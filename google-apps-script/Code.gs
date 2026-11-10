/**
 * ShelfPrice → Google Sheets
 *
 * Paste this into Extensions → Apps Script in your Google Sheet, change SECRET,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 *
 * It keeps two tabs:
 *   Purchases – one row for every item you add in the app (a full log)
 *   Stock     – one row per product; stock quantity goes up each time you buy more
 */
const SECRET = 'change-me';

const PURCHASE_HEADERS = ['Entry ID', 'Date', 'Item No', 'Name', 'Packs', 'Units/Pack', 'Units Added',
  'Pack ex VAT', 'Pack inc VAT', 'Unit Cost', 'Sell Price', 'Ad Cost', 'Ad Type', 'Ship/Unit',
  'Fee %', 'Fixed Fee', 'Profit/Unit', 'Margin %', 'ROI %', 'Batch Cost', 'Batch Profit'];
const STOCK_HEADERS = ['Item No', 'Name', 'Stock Qty', 'Unit Cost', 'Sell Price', 'Profit/Unit',
  'Margin %', 'Last Bought', 'Last Updated'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.key !== SECRET) return reply({ ok: false, error: 'Wrong secret key' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.action === 'ping') return reply({ ok: true, sheet: ss.getName() });
    if (body.action === 'addItems') return reply(addItems(ss, body.items || []));
    return reply({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply({ ok: true, message: 'ShelfPrice script is running. The app uses POST.' });
}

function addItems(ss, items) {
  const purchases = getSheet(ss, 'Purchases', PURCHASE_HEADERS);
  const stock = getSheet(ss, 'Stock', STOCK_HEADERS);

  // Skip entries already logged (safe to retry an upload)
  const lastP = purchases.getLastRow();
  const seen = new Set(lastP > 1 ? purchases.getRange(2, 1, lastP - 1, 1).getValues().map(r => String(r[0])) : []);

  const lastS = stock.getLastRow();
  const stockRows = lastS > 1 ? stock.getRange(2, 1, lastS - 1, STOCK_HEADERS.length).getValues() : [];
  const keyOf = (itemNo, name) => itemNo ? 'no:' + String(itemNo).trim() : 'name:' + String(name).trim().toLowerCase();
  const index = {};
  stockRows.forEach((r, i) => { index[keyOf(r[0], r[1])] = i; });

  const saved = [];
  const newLog = [];
  const now = new Date();

  items.forEach(it => {
    saved.push(it.id);
    if (seen.has(String(it.id))) return;
    const unitsAdded = Number(it.units) * Number(it.qty);
    const date = new Date(it.date);
    newLog.push([it.id, date, it.itemNo, it.name, it.qty, it.units, unitsAdded, it.packEx, it.packInc,
      it.unitCost, it.sell, it.ad, it.adMode === 'pct' ? '%' : '£', it.ship, it.feePct, it.feeFixed,
      it.profit, it.margin, it.roi, round2(it.unitCost * unitsAdded), round2(it.profit * unitsAdded)]);

    const k = keyOf(it.itemNo, it.name);
    if (k in index) {
      const r = stockRows[index[k]];
      r[1] = it.name || r[1];
      r[2] = Number(r[2] || 0) + unitsAdded;
      r[3] = it.unitCost; r[4] = it.sell; r[5] = it.profit; r[6] = it.margin; r[7] = date; r[8] = now;
    } else {
      index[k] = stockRows.length;
      stockRows.push([it.itemNo, it.name, unitsAdded, it.unitCost, it.sell, it.profit, it.margin, date, now]);
    }
  });

  if (newLog.length) purchases.getRange(purchases.getLastRow() + 1, 1, newLog.length, PURCHASE_HEADERS.length).setValues(newLog);
  if (stockRows.length) stock.getRange(2, 1, stockRows.length, STOCK_HEADERS.length).setValues(stockRows);
  return { ok: true, saved: saved, logged: newLog.length };
}

function getSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function round2(n) { return Math.round(Number(n) * 100) / 100; }

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
