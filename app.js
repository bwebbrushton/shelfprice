(function () {
  const APP_VERSION = '1.0.0';
  const $ = (id) => document.getElementById(id);
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('Could not save – storage full?'); }
    },
  };

  const DEFAULT_SETTINGS = {
    vatReg: false, vatRate: 20, ad: 0, adMode: 'gbp', ship: 0, feePct: 0, feeFixed: 0, target: 30,
    sheetUrl: '', sheetKey: '',
  };
  let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('sp.settings', {}));
  let items = store.get('sp.items', []);

  // ---------- helpers ----------
  const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(/[£,\s%]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const gbp = (n) => (Number.isFinite(n) ? (n < 0 ? '-£' : '£') + Math.abs(n).toFixed(2) : '–');
  const pct = (n) => (Number.isFinite(n) ? n.toFixed(1) + '%' : '–');
  const round2 = (n) => Math.round(n * 100) / 100;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  // ---------- tabs ----------
  document.querySelectorAll('.tabbar button').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
  function showTab(name) {
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
    window.scrollTo(0, 0);
    if (name === 'list') renderList();
  }

  // ---------- calculator ----------
  const F = ['name', 'itemNo', 'packEx', 'packInc', 'units', 'qty', 'sell', 'ad', 'ship', 'feePct', 'feeFixed'];
  const vatMult = () => 1 + num(settings.vatRate) / 100;

  function readForm() {
    const f = {};
    F.forEach((k) => (f[k] = $(k).value));
    f.adMode = $('adMode').dataset.mode;
    return f;
  }

  function calc(f) {
    const units = Math.max(1, num(f.units));
    const qty = Math.max(0, num(f.qty));
    const v = vatMult();
    let packEx = num(f.packEx), packInc = num(f.packInc);
    if (!packEx && packInc) packEx = packInc / v;
    if (!packInc && packEx) packInc = packEx * v;
    const unitEx = packEx / units;
    const unitInc = packInc / units;
    const unitCost = settings.vatReg ? unitEx : unitInc;

    const sell = num(f.sell);
    const feeP = num(f.feePct) / 100;
    const adP = f.adMode === 'pct' ? num(f.ad) / 100 : 0;
    const adFixed = f.adMode === 'pct' ? 0 : num(f.ad);
    const ship = num(f.ship);
    const fixedFee = num(f.feeFixed);

    const vatOnSale = settings.vatReg ? sell - sell / v : 0;
    const fees = sell * feeP + fixedFee;
    const ad = sell * adP + adFixed;
    const profit = sell - vatOnSale - unitCost - fees - ad - ship;
    const margin = sell ? (profit / sell) * 100 : NaN;
    const roi = unitCost ? (profit / unitCost) * 100 : NaN;

    // Sell price needed for a given margin (0 = break even)
    const k = (settings.vatReg ? 1 / v : 1) - feeP - adP;
    const fixedCosts = unitCost + fixedFee + adFixed + ship;
    const priceFor = (m) => (k - m > 0 ? fixedCosts / (k - m) : NaN);

    return {
      units, qty, packEx, packInc, unitEx, unitInc, unitCost, sell, vatOnSale, fees, ad, ship,
      profit, margin, roi, batchProfit: profit * units * qty,
      breakEven: priceFor(0), targetPrice: priceFor(num(settings.target) / 100),
      hasCost: unitCost > 0, hasSell: sell > 0,
    };
  }

  function render() {
    const f = readForm();
    const r = calc(f);
    $('outUnit').textContent = r.hasCost
      ? `${gbp(r.unitEx)} ex · ${gbp(r.unitInc)} inc VAT`
      : '–';
    const p = $('outProfit');
    if (r.hasCost && r.hasSell) {
      p.textContent = gbp(r.profit);
      p.className = 'profit ' + (r.profit >= 0 ? 'good' : 'bad');
      $('outMargin').textContent = pct(r.margin);
      $('outRoi').textContent = pct(r.roi);
      $('outBatch').textContent = gbp(r.batchProfit);
    } else {
      p.textContent = r.hasCost ? 'Enter a sell price' : 'Enter a buy price';
      p.className = 'profit';
      $('outMargin').textContent = $('outRoi').textContent = $('outBatch').textContent = '–';
    }
    const rows = [
      ['Sell price', gbp(r.sell)],
      settings.vatReg ? ['VAT on sale', '−' + gbp(r.vatOnSale)] : null,
      ['Cost per unit' + (settings.vatReg ? ' (ex VAT)' : ' (inc VAT)'), '−' + gbp(r.unitCost)],
      ['Platform fees', '−' + gbp(r.fees)],
      ['Ad cost', '−' + gbp(r.ad)],
      ['Shipping', '−' + gbp(r.ship)],
    ].filter(Boolean);
    $('breakdown').innerHTML = r.hasCost && r.hasSell
      ? rows.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('')
      : '';
    $('outBreakEven').textContent = r.hasCost ? gbp(r.breakEven) : '–';
    $('outTarget').textContent = r.hasCost ? gbp(r.targetPrice) : '–';
    $('targetLbl').textContent = num(settings.target);
    store.set('sp.draft', f);
  }

  // Keep ex/inc VAT in step with each other
  $('packEx').addEventListener('input', () => {
    const v = num($('packEx').value);
    $('packInc').value = v ? round2(v * vatMult()).toFixed(2) : '';
  });
  $('packInc').addEventListener('input', () => {
    const v = num($('packInc').value);
    $('packEx').value = v ? round2(v / vatMult()).toFixed(2) : '';
  });
  F.forEach((k) => $(k).addEventListener('input', render));
  document.querySelectorAll('#tab-calc input').forEach((el) => {
    el.addEventListener('focus', () => { if (el.inputMode === 'decimal' || el.inputMode === 'numeric') el.select(); });
  });

  function setAdMode(mode) {
    const b = $('adMode');
    b.dataset.mode = mode;
    b.textContent = mode === 'pct' ? '%' : '£';
  }
  $('adMode').addEventListener('click', () => {
    setAdMode($('adMode').dataset.mode === 'pct' ? 'gbp' : 'pct');
    render();
  });

  function resetForm() {
    ['name', 'itemNo', 'packEx', 'packInc', 'sell'].forEach((k) => ($(k).value = ''));
    $('units').value = '1';
    $('qty').value = '1';
    $('ad').value = settings.ad || '';
    $('ship').value = settings.ship || '';
    $('feePct').value = settings.feePct || '';
    $('feeFixed').value = settings.feeFixed || '';
    setAdMode(settings.adMode);
    $('ocrResult').hidden = true;
    $('ocrStatus').hidden = true;
    render();
  }
  $('clearBtn').addEventListener('click', resetForm);

  $('addBtn').addEventListener('click', () => {
    const f = readForm();
    const r = calc(f);
    if (!r.hasCost) { toast('Enter a buy price first'); return; }
    if (!f.name.trim() && !f.itemNo.trim()) { toast('Add a name or item number'); $('name').focus(); return; }
    items.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: new Date().toISOString(),
      name: f.name.trim(), itemNo: f.itemNo.trim(),
      packEx: round2(r.packEx), packInc: round2(r.packInc), units: r.units, qty: r.qty,
      unitCost: round2(r.unitCost), sell: round2(r.sell),
      ad: num(f.ad), adMode: f.adMode, ship: num(f.ship), feePct: num(f.feePct), feeFixed: num(f.feeFixed),
      profit: round2(r.profit), margin: round2(r.margin || 0), roi: round2(r.roi || 0),
      vatReg: settings.vatReg, synced: false,
    });
    store.set('sp.items', items);
    updateBadge();
    toast('Added to list');
    resetForm();
  });

  // ---------- scanning ----------
  $('scanBtn').addEventListener('click', () => $('photoInput').click());
  $('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = $('ocrStatus');
    status.hidden = false;
    status.textContent = 'Reading label…';
    $('scanBtn').disabled = true;
    try {
      const res = await ShelfOCR.readLabel(file, num(settings.vatRate), (m) => {
        if (m.status === 'recognizing text') status.textContent = `Reading label… ${Math.round(m.progress * 100)}%`;
        else if (m.status) status.textContent = m.status.replace(/^./, (c) => c.toUpperCase()) + '…';
      });
      applyScan(res);
    } catch (err) {
      console.error(err);
      status.textContent = 'Could not read the label. ' + (navigator.onLine ? '' : 'If this is the first scan, open Settings on Wi-Fi and tap “Prepare scanner”. ') + 'You can type the price instead.';
    } finally {
      $('scanBtn').disabled = false;
    }
  });

  function applyScan(res) {
    const status = $('ocrStatus');
    const filled = [];
    if (res.ex) { $('packEx').value = res.ex.toFixed(2); $('packInc').value = (res.inc || round2(res.ex * vatMult())).toFixed(2); filled.push('price'); }
    else if (res.inc) { $('packInc').value = res.inc.toFixed(2); $('packEx').value = round2(res.inc / vatMult()).toFixed(2); filled.push('price'); }
    if (res.itemNo && !$('itemNo').value) { $('itemNo').value = res.itemNo; filled.push('item no.'); }
    if (res.name && !$('name').value) { $('name').value = res.name; filled.push('name'); }
    if (res.units && $('units').value === '1') { $('units').value = res.units; filled.push('pack size'); }
    status.textContent = res.prices.length
      ? `Filled in ${filled.join(', ') || 'nothing'}. Check it matches the label.`
      : 'No prices found. Try again closer, with the label flat and well lit.';

    const chips = $('priceChips');
    chips.innerHTML = '';
    res.prices.forEach((p) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip';
      c.innerHTML = `£${p.value.toFixed(2)}${p.hint ? ` <small>${p.hint} VAT</small>` : ''}`;
      c.addEventListener('click', () => choosePrice(p.value, c));
      chips.appendChild(c);
    });
    const lines = $('ocrLines');
    lines.innerHTML = '';
    res.lines.forEach((l) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = l;
      b.addEventListener('click', () => { $('name').value = l; render(); toast('Name set'); });
      lines.appendChild(b);
    });
    $('ocrResult').hidden = false;
    render();
  }

  function choosePrice(value, chipEl) {
    const existing = document.querySelector('.chip-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.className = 'chip-menu';
    const opts = [
      ['Use as ex VAT', () => { $('packEx').value = value.toFixed(2); $('packInc').value = round2(value * vatMult()).toFixed(2); }],
      ['Use as inc VAT', () => { $('packInc').value = value.toFixed(2); $('packEx').value = round2(value / vatMult()).toFixed(2); }],
      ['Use as sell price', () => { $('sell').value = value.toFixed(2); }],
    ];
    opts.forEach(([label, fn]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ghost'; b.textContent = label;
      b.addEventListener('click', () => { fn(); menu.remove(); render(); toast(label.replace('Use as', 'Set as')); });
      menu.appendChild(b);
    });
    chipEl.after(menu);
  }

  // ---------- list ----------
  function updateBadge() {
    const n = items.filter((i) => !i.synced).length;
    const b = $('listBadge');
    b.textContent = n; b.hidden = n === 0;
  }

  function renderList() {
    const wrap = $('listItems');
    $('listEmpty').hidden = items.length > 0;
    const pending = items.filter((i) => !i.synced).length;
    const totalCost = items.reduce((s, i) => s + i.unitCost * i.units * i.qty, 0);
    const totalProfit = items.reduce((s, i) => s + i.profit * i.units * i.qty, 0);
    $('listSummary').textContent = items.length
      ? `${items.length} items · ${pending} to upload · spend ${gbp(totalCost)} · profit ${gbp(totalProfit)}`
      : '';
    wrap.innerHTML = items.map((i) => `
      <div class="card item" data-id="${i.id}">
        <span class="tag ${i.synced ? 'done' : ''}">${i.synced ? '✓ uploaded' : 'not uploaded'}</span>
        <div class="title">${esc(i.name || 'Item ' + i.itemNo)}</div>
        <div class="meta">${i.itemNo ? '#' + esc(i.itemNo) + ' · ' : ''}${i.qty} × pack of ${i.units} · ${new Date(i.date).toLocaleDateString('en-GB')}</div>
        <div class="nums">
          <div><span>Unit cost</span>${gbp(i.unitCost)}</div>
          <div><span>Sell</span>${gbp(i.sell)}</div>
          <div><span>Profit/unit</span>${gbp(i.profit)}</div>
          <div><span>Margin</span>${pct(i.margin)}</div>
          <div><span>Stock added</span>${i.units * i.qty}</div>
          <div><span>Batch profit</span>${gbp(i.profit * i.units * i.qty)}</div>
        </div>
        <div class="row-actions">
          <button class="btn ghost" type="button" data-act="edit">Edit</button>
          <button class="btn ghost" type="button" data-act="del">Delete</button>
        </div>
      </div>`).join('');
    updateBadge();
  }

  $('listItems').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.item').dataset.id;
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    if (btn.dataset.act === 'del') {
      if (!confirm('Delete this item?')) return;
      items.splice(idx, 1);
    } else if (btn.dataset.act === 'edit') {
      const i = items.splice(idx, 1)[0];
      loadIntoForm(i);
      showTab('calc');
      toast('Editing – tap “Add to list” to save');
    }
    store.set('sp.items', items);
    renderList();
  });

  function loadIntoForm(i) {
    $('name').value = i.name; $('itemNo').value = i.itemNo;
    $('packEx').value = i.packEx.toFixed(2); $('packInc').value = i.packInc.toFixed(2);
    $('units').value = i.units; $('qty').value = i.qty;
    $('sell').value = i.sell ? i.sell.toFixed(2) : '';
    $('ad').value = i.ad || ''; setAdMode(i.adMode);
    $('ship').value = i.ship || ''; $('feePct').value = i.feePct || ''; $('feeFixed').value = i.feeFixed || '';
    render();
  }

  $('clearSyncedBtn').addEventListener('click', () => {
    const n = items.filter((i) => i.synced).length;
    if (!n) { toast('Nothing uploaded yet'); return; }
    if (!confirm(`Remove ${n} uploaded item(s) from this phone?`)) return;
    items = items.filter((i) => !i.synced);
    store.set('sp.items', items);
    renderList();
  });

  // ---------- Google Sheets ----------
  async function postToSheet(payload) {
    if (!settings.sheetUrl) throw new Error('Add your Apps Script URL in Settings first');
    // text/plain avoids a CORS preflight, which Apps Script can't answer.
    const res = await fetch(settings.sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ key: settings.sheetKey }, payload)),
      redirect: 'follow',
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Unexpected reply – check the URL and that access is set to “Anyone”'); }
    if (!data.ok) throw new Error(data.error || 'Sheet returned an error');
    return data;
  }

  let syncing = false;
  async function sync(auto) {
    if (syncing) return;
    const pending = items.filter((i) => !i.synced);
    const status = $('syncStatus');
    if (!pending.length) { if (!auto) status.textContent = 'Everything is already uploaded.'; return; }
    if (!navigator.onLine) { if (!auto) status.textContent = 'No signal. Your list is saved on this phone – upload when you’re back online.'; return; }
    if (!settings.sheetUrl) { if (!auto) status.textContent = 'Set up Google Sheets in Settings first.'; return; }
    syncing = true;
    $('syncBtn').disabled = true;
    status.textContent = `Uploading ${pending.length} item(s)…`;
    try {
      const data = await postToSheet({ action: 'addItems', items: pending });
      const done = new Set(data.saved || pending.map((p) => p.id));
      items.forEach((i) => { if (done.has(i.id)) i.synced = true; });
      store.set('sp.items', items);
      status.textContent = `Uploaded ${done.size} item(s). Stock sheet updated.`;
      if (auto) toast(`Uploaded ${done.size} item(s) to Google Sheets`);
    } catch (err) {
      status.textContent = 'Upload failed: ' + err.message;
    } finally {
      syncing = false;
      $('syncBtn').disabled = false;
      renderList();
    }
  }
  $('syncBtn').addEventListener('click', () => sync(false));

  $('testSheetBtn').addEventListener('click', async () => {
    saveSettings();
    const s = $('testSheetStatus');
    s.textContent = 'Testing…';
    try {
      const d = await postToSheet({ action: 'ping' });
      s.textContent = '✓ Connected to “' + (d.sheet || 'your sheet') + '”';
    } catch (err) {
      s.textContent = '✗ ' + err.message;
    }
  });

  $('csvBtn').addEventListener('click', async () => {
    if (!items.length) { toast('List is empty'); return; }
    const head = ['Date', 'Item No', 'Name', 'Packs', 'Units/Pack', 'Stock Added', 'Pack ex VAT', 'Pack inc VAT', 'Unit Cost', 'Sell', 'Ad', 'Ad Type', 'Ship', 'Fee %', 'Fixed Fee', 'Profit/Unit', 'Margin %', 'ROI %'];
    const rows = items.map((i) => [i.date.slice(0, 10), i.itemNo, i.name, i.qty, i.units, i.qty * i.units, i.packEx, i.packInc, i.unitCost, i.sell, i.ad, i.adMode === 'pct' ? '%' : '£', i.ship, i.feePct, i.feeFixed, i.profit, i.margin, i.roi]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const file = new File([csv], `shelfprice-${new Date().toISOString().slice(0, 10)}.csv`, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'ShelfPrice list' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  // ---------- settings ----------
  const S = { setVatReg: 'vatReg', setVatRate: 'vatRate', setAd: 'ad', setAdMode: 'adMode', setShip: 'ship', setFeePct: 'feePct', setFeeFixed: 'feeFixed', setTarget: 'target', setSheetUrl: 'sheetUrl', setSheetKey: 'sheetKey' };
  function loadSettings() {
    Object.entries(S).forEach(([id, key]) => {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = !!settings[key];
      else el.value = settings[key] ?? '';
    });
  }
  function saveSettings() {
    Object.entries(S).forEach(([id, key]) => {
      const el = $(id);
      if (el.type === 'checkbox') settings[key] = el.checked;
      else if (['sheetUrl', 'sheetKey', 'adMode'].includes(key)) settings[key] = el.value.trim();
      else settings[key] = num(el.value);
    });
    if (!settings.vatRate) settings.vatRate = 20;
    store.set('sp.settings', settings);
    render();
  }
  Object.keys(S).forEach((id) => $(id).addEventListener('change', saveSettings));

  $('warmOcrBtn').addEventListener('click', async () => {
    const s = $('warmStatus');
    $('warmOcrBtn').disabled = true;
    s.textContent = 'Downloading scanner…';
    try {
      await ShelfOCR.warmUp((m) => { if (m.status) s.textContent = `${m.status} ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`; });
      if ('caches' in window) {
        // Make sure every scanner file is stored, even ones this phone's engine didn't need.
        const c = await caches.open('shelfprice-ocr');
        const files = ['tesseract.min.js', 'worker.min.js', 'lang/eng.traineddata',
          'core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'];
        for (const f of files) {
          const url = new URL('vendor/tesseract/' + f, document.baseURI).href;
          if (!(await c.match(url))) await c.add(url);
        }
      }
      store.set('sp.ocrReady', true);
      s.textContent = '✓ Scanner ready – works offline now.';
    } catch (err) {
      console.error(err);
      s.textContent = 'Download failed: ' + err.message + '. Try again on Wi-Fi.';
    } finally {
      $('warmOcrBtn').disabled = false;
    }
  });

  // ---------- online status ----------
  function updateNet() {
    $('netStatus').textContent = navigator.onLine ? 'Online' : 'Offline';
    if (navigator.onLine && settings.sheetUrl) sync(true);
  }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);

  // ---------- start ----------
  loadSettings();
  const draft = store.get('sp.draft', null);
  if (draft) {
    F.forEach((k) => { if (draft[k] != null) $(k).value = draft[k]; });
    setAdMode(draft.adMode || settings.adMode);
    render();
  } else {
    resetForm();
  }
  updateBadge();
  updateNet();
  if (store.get('sp.ocrReady', false)) $('warmStatus').textContent = '✓ Scanner ready – works offline.';
  $('versionLbl').textContent = 'ShelfPrice v' + APP_VERSION;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
