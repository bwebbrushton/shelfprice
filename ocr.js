// Offline label reading. Everything (engine, language data) is served from
// this site and cached by the service worker, so it works with no signal.
(function () {
  const base = new URL('vendor/tesseract/', document.baseURI).href;
  let workerPromise = null;

  function getWorker(onProgress) {
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker('eng', 1 /* LSTM only */, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core',
        langPath: base + 'lang',
        gzip: false,
        workerBlobURL: false,
        logger: (m) => onProgress && onProgress(m),
      }).then(async (w) => {
        await w.setParameters({ preserve_interword_spaces: '1' });
        return w;
      }).catch((e) => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  // Shrink big iPhone photos and boost contrast; OCR is faster and more accurate.
  async function prepareImage(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(() => createImageBitmap(file));
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g = (g - 128) * 1.5 + 128; // contrast
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  const PRICE_RE = /£?\s?(\d{1,4})\s?[.,]\s?(\d{2})(?!\d)/g;

  // Turn raw label text into candidate prices, an item number and a name guess.
  function parseLabel(text, vatRate) {
    const lines = text.split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1);
    const prices = [];
    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      let hint = null;
      if (/(inc|incl|including)\.?\s*vat/.test(lower)) hint = 'inc';
      else if (/(exc|excl|ex|excluding)\.?\s*vat|\+\s*vat|plus vat/.test(lower)) hint = 'ex';
      let m;
      PRICE_RE.lastIndex = 0;
      while ((m = PRICE_RE.exec(line))) {
        const value = parseFloat(m[1] + '.' + m[2]);
        if (value <= 0) continue;
        if (!prices.some((p) => p.value === value)) prices.push({ value, hint, line: idx, hasPound: m[0].includes('£') });
      }
    });

    // If two prices differ by the VAT rate, that pair is ex/inc VAT.
    const r = 1 + vatRate / 100;
    let ex = null, inc = null;
    outer: for (const a of prices) {
      for (const b of prices) {
        if (a !== b && Math.abs(a.value * r - b.value) <= 0.02 + b.value * 0.003) { ex = a.value; inc = b.value; break outer; }
      }
    }
    if (ex === null) {
      const exHint = prices.find((p) => p.hint === 'ex');
      const incHint = prices.find((p) => p.hint === 'inc');
      if (exHint) ex = exHint.value;
      if (incHint) inc = incHint.value;
    }
    if (ex === null && inc === null && prices.length) {
      // Costco UK shows the ex-VAT price biggest; take the largest £ price as a guess.
      const pool = prices.filter((p) => p.hasPound).length ? prices.filter((p) => p.hasPound) : prices;
      ex = pool.reduce((a, b) => (b.value > a.value ? b : a)).value;
    }

    // Costco item numbers are usually 5–7 digits on their own.
    let itemNo = '';
    const itemMatch = text.match(/(?:item|art|no\.?|#)\s*:?\s*(\d{4,8})/i) || text.match(/(?<![\d.,£])(\d{5,7})(?![\d.,])/);
    if (itemMatch) itemNo = itemMatch[1];

    // Name guess: the longest line that is mostly letters.
    const wordy = lines
      .filter((l) => !/vat|£|\d[.,]\d{2}/i.test(l))
      .map((l) => ({ l, score: (l.match(/[a-z]/gi) || []).length }))
      .filter((x) => x.score >= 4 && x.score / x.l.length > 0.6)
      .sort((a, b) => b.score - a.score);
    const name = wordy.length ? wordy[0].l : '';

    // Pack size like "48 pack", "x 24", "24 x 330ml"
    let units = null;
    const packMatch = text.match(/(\d{1,4})\s*(?:pk|pack|ct|count|pcs|pieces)\b/i) || text.match(/\b(\d{1,3})\s*x\s*\d/i);
    if (packMatch) units = parseInt(packMatch[1], 10);

    return { lines, prices, ex, inc, itemNo, name, units };
  }

  async function readLabel(file, vatRate, onProgress) {
    const canvas = await prepareImage(file);
    const worker = await getWorker(onProgress);
    const { data } = await worker.recognize(canvas);
    return parseLabel(data.text || '', vatRate);
  }

  // Load the engine once while online so every file is cached for offline use.
  async function warmUp(onProgress) {
    const worker = await getWorker(onProgress);
    const c = document.createElement('canvas');
    c.width = 200; c.height = 60;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 200, 60);
    ctx.fillStyle = '#000'; ctx.font = '32px sans-serif'; ctx.fillText('£12.99', 20, 42);
    const { data } = await worker.recognize(c);
    return data.text;
  }

  window.ShelfOCR = { readLabel, warmUp, parseLabel };
})();
