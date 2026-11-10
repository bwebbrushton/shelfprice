(function () {
  const APP_VERSION = '1.2.0';
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
    vatReg: false, vatRate: 20, ad: 0, adMode: 'gbp', ship: 0.6, feePct: 0, feeFixed: 0, target: 30, sellMode: 'gbp',
    sheetUrl: '', sheetKey: '',
  };
  let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('sp.settings', {}));
  // One-off: switch existing installs to the £0.60 shipping default.
  if (!store.get('sp.shipDefault060', false)) {
    if (!settings.ship) settings.ship = 0.6;
    store.set('sp.settings', settings);
    store.set('sp.shipDefault060', true);
  }
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
    f.sellMode = $('sellMode').dataset.mode;
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

    const ship = num(f.ship);
    // Sell price: either typed in £, or buy cost + shipping plus a mark-up %
    const markupBase = unitCost + ship;
    const sell = f.sellMode === 'pct' ? (unitCost > 0 ? markupBase * (1 + num(f.sell) / 100) : 0) : num(f.sell);
    const feeP = num(f.feePct) / 100;
    const adP = f.adMode === 'pct' ? num(f.ad) / 100 : 0;
    const adFixed = f.adMode === 'pct' ? 0 : num(f.ad);
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
      k, fixedCosts, markupBase, markupPct: f.sellMode === 'pct' ? num(f.sell) : (markupBase ? (sell / markupBase - 1) * 100 : NaN),
      hasCost: unitCost > 0, hasSell: sell > 0,
    };
  }

  function render() {
    const f = readForm();
    const r = calc(f);
    $('outUnit').textContent = r.hasCost
      ? (settings.vatReg ? `${gbp(r.unitInc)} inc · ${gbp(r.unitEx)} ex VAT` : `${gbp(r.unitInc)} inc VAT`)
      : '–';
    const pctMode = f.sellMode === 'pct';
    $('sellCalcLine').hidden = !pctMode;
    if (pctMode) {
      $('sellCalcTxt').textContent = r.hasCost ? `${gbp(r.markupBase)} cost + ship + ${num(f.sell)}% =` : 'Sell price';
      $('sellCalcOut').textContent = r.hasCost ? gbp(r.sell) : 'enter a buy price';
    }
    const p = $('outProfit');
    const show = r.hasCost && r.hasSell;
    if (show) {
      p.textContent = gbp(r.profit);
      p.className = 'profit ' + (r.profit >= 0 ? 'good' : 'bad');
    } else {
      p.textContent = r.hasCost ? 'Enter a sell price' : 'Enter a buy price';
      p.className = 'profit';
    }
    // Don't overwrite a box while it's being typed in
    const setBox = (id, val) => { if (document.activeElement !== $(id)) $(id).value = show && Number.isFinite(val) ? val.toFixed(id === 'outBatch' ? 2 : 1) : ''; };
    setBox('outMargin', r.margin);
    setBox('outRoi', r.roi);
    setBox('outBatch', r.batchProfit);
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

  // Type a target into Margin / ROI / Batch profit → work out the sell price
  function sellFromBox(id) {
    const raw = $(id).value.trim();
    if (raw === '' || raw === '-') return;
    const r = calc(readForm());
    if (!r.hasCost) { toast('Enter a buy price first'); return; }
    const v = num(raw);
    let profitPerUnit;
    let sell;
    if (id === 'outMargin') {
      sell = r.k - v / 100 > 0 ? r.fixedCosts / (r.k - v / 100) : NaN;
    } else {
      profitPerUnit = id === 'outRoi' ? (v / 100) * r.unitCost : v / Math.max(1, r.units * Math.max(1, r.qty));
      sell = r.k > 0 ? (r.fixedCosts + profitPerUnit) / r.k : NaN;
    }
    if (!Number.isFinite(sell) || sell <= 0) { toast('That margin isn’t possible with these fees'); return; }
    setSellValue(sell, r.markupBase);
    render();
  }
  // Put a £ sell price into the sell box, converting to a mark-up % if in % mode
  function setSellValue(sell, markupBase) {
    if ($('sellMode').dataset.mode === 'pct') {
      $('sell').value = markupBase > 0 ? round2((sell / markupBase - 1) * 100).toString() : '';
    } else {
      $('sell').value = sell.toFixed(2);
    }
  }
  ['outMargin', 'outRoi', 'outBatch'].forEach((id) => {
    $(id).addEventListener('input', () => sellFromBox(id));
    $(id).addEventListener('focus', () => $(id).select());
    $(id).addEventListener('blur', render);
  });

  function setSellMode(mode) {
    const b = $('sellMode');
    b.dataset.mode = mode;
    b.textContent = mode === 'pct' ? '%' : '£';
    $('sellLbl').textContent = mode === 'pct' ? 'Mark-up on buy cost + shipping (%)' : 'Sell price per unit (£)';
    $('sell').placeholder = mode === 'pct' ? '20' : '0.00';
  }
  $('sellMode').addEventListener('click', () => {
    // Keep the same sell price when switching between £ and %
    const before = calc(readForm());
    const next = $('sellMode').dataset.mode === 'pct' ? 'gbp' : 'pct';
    setSellMode(next);
    if (before.hasSell) setSellValue(before.sell, before.markupBase);
    settings.sellMode = next;
    store.set('sp.settings', settings);
    render();
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
    $('ship').value = settings.ship ? num(settings.ship).toFixed(2) : '';
    $('feePct').value = settings.feePct || '';
    $('feeFixed').value = settings.feeFixed || '';
    setAdMode(settings.adMode);
    setSellMode(settings.sellMode || 'gbp');
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
      unitCost: round2(r.unitCost), sell: round2(r.sell), sellMode: f.sellMode, markup: round2(r.markupPct || 0),
      ad: num(f.ad), adMode: f.adMode, ship: num(f.ship), feePct: num(f.feePct), feeFixed: num(f.feeFixed),
      profit: round2(r.profit), margin: round2(r.margin || 0), roi: round2(r.roi || 0),
      vatReg: settings.vatReg, synced: false,
    });
    store.set('sp.items', items);
    updateBadge();
    toast('Added to list');
    resetForm();
  });

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
    setSellMode(i.sellMode || 'gbp');
    $('sell').value = i.sellMode === 'pct' ? (i.markup ?? '') : (i.sell ? i.sell.toFixed(2) : '');
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
    const head = ['Date', 'Item No', 'Name', 'Packs', 'Units/Pack', 'Stock Added', 'Pack ex VAT', 'Pack inc VAT', 'Unit Cost', 'Sell', 'Mark-up %', 'Ad', 'Ad Type', 'Ship', 'Fee %', 'Fixed Fee', 'Profit/Unit', 'Margin %', 'ROI %'];
    const rows = items.map((i) => [i.date.slice(0, 10), i.itemNo, i.name, i.qty, i.units, i.qty * i.units, i.packEx, i.packInc, i.unitCost, i.sell, i.markup ?? '', i.ad, i.adMode === 'pct' ? '%' : '£', i.ship, i.feePct, i.feeFixed, i.profit, i.margin, i.roi]);
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
    if (!num(draft.ship) && settings.ship) $('ship').value = settings.ship.toFixed(2);
    setAdMode(draft.adMode || settings.adMode);
    setSellMode(draft.sellMode || settings.sellMode || 'gbp');
    render();
  } else {
    resetForm();
  }
  updateBadge();
  updateNet();
  $('versionLbl').textContent = 'ShelfPrice v' + APP_VERSION;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
