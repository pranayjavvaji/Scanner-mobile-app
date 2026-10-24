import * as SQLite from 'expo-sqlite';

let dbp;
export const getDb = () => (dbp ??= (async () => {
  const db = await SQLite.openDatabaseAsync('barscan.db');
  await db.execAsync(`CREATE TABLE IF NOT EXISTS items(
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, format TEXT,
    quantity INTEGER NOT NULL DEFAULT 1, notes TEXT DEFAULT '',
    created_at INTEGER, updated_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_code ON items(code);
    CREATE TABLE IF NOT EXISTS bills(
      id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER, saved_at INTEGER, total REAL DEFAULT 0, note TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS bill_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL,
      code TEXT DEFAULT '', name TEXT DEFAULT '', qty INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0, created_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_bi_bill ON bill_items(bill_id);`);
  return db;
})());

/* ------------------------------ Library ------------------------------ */
export async function listItems(search = '') {
  const db = await getDb();
  const q = `%${search.trim()}%`;
  return db.getAllAsync(
    'SELECT * FROM items WHERE code LIKE ? OR notes LIKE ? ORDER BY updated_at DESC', [q, q]);
}
export async function countItems() {
  return (await (await getDb()).getFirstAsync('SELECT COUNT(*) AS n FROM items')).n;
}

// dup: 'increment' bumps quantity if code already stored, 'new' always adds a row
export async function addItem({ code, format = '', quantity = 1, notes = '' }, dup = 'increment') {
  const db = await getDb();
  const now = Date.now();
  if (dup === 'increment') {
    const ex = await db.getFirstAsync('SELECT * FROM items WHERE code = ? ORDER BY id DESC', [code]);
    if (ex) {
      await db.runAsync('UPDATE items SET quantity = quantity + ?, updated_at = ? WHERE id = ?', [quantity, now, ex.id]);
      return { ...ex, quantity: ex.quantity + quantity, updated_at: now, existed: true };
    }
  }
  const r = await db.runAsync(
    'INSERT INTO items(code, format, quantity, notes, created_at, updated_at) VALUES(?,?,?,?,?,?)',
    [code, format, quantity, notes, now, now]);
  return { id: r.lastInsertRowId, code, format, quantity, notes, created_at: now, updated_at: now };
}

export async function updateItem(id, { code, quantity, notes }) {
  const db = await getDb();
  await db.runAsync('UPDATE items SET code = ?, quantity = ?, notes = ?, updated_at = ? WHERE id = ?',
    [code, quantity, notes, Date.now(), id]);
}
export async function deleteItem(id) { await (await getDb()).runAsync('DELETE FROM items WHERE id = ?', [id]); }
export async function clearAll() { await (await getDb()).runAsync('DELETE FROM items'); }

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
// Excel shows long numbers as 8.90101E+12 and strips leading zeros; the ="..." form keeps them as text
const csvCode = (c) => (/^(0\d+|\d{10,})$/.test(String(c)) ? `="${c}"` : esc(c));
export const toCSV = (rows) =>
  ['code,format,quantity,notes,created_at', ...rows.map((r) =>
    [csvCode(r.code), esc(r.format), r.quantity, esc(r.notes), esc(new Date(r.created_at).toISOString())].join(','))].join('\n');

// One-time repair: items stored earlier as 12-digit UPC-A get their leading 0 back (-> 13-digit EAN-13)
export async function fixStoredUpc() {
  const db = await getDb();
  const r = await db.runAsync("UPDATE items SET code = '0' || code, format = 'ean13' WHERE format = 'upc_a' AND length(code) = 12 AND code NOT GLOB '*[^0-9]*'");
  return r.changes;
}

/* ------------------------------ Billing ------------------------------
   Every bill line is written to disk the moment it is added, so an unfinished
   bill survives a power cut or the app being closed, and can be resumed. */
export const r2 = (n) => Math.round((+n || 0) * 100) / 100;
export const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export async function getOpenBill() {
  const db = await getDb();
  const b = await db.getFirstAsync("SELECT * FROM bills WHERE status='open' ORDER BY id DESC");
  if (!b) return null;
  const s = await db.getFirstAsync('SELECT COUNT(*) AS n, COALESCE(SUM(qty*price),0) AS t FROM bill_items WHERE bill_id=?', [b.id]);
  return { ...b, count: s.n, total: r2(s.t) };
}
export async function createBill() {
  const r = await (await getDb()).runAsync("INSERT INTO bills(status, created_at) VALUES('open', ?)", [Date.now()]);
  return r.lastInsertRowId;
}
export async function billItems(id) {
  return (await getDb()).getAllAsync('SELECT * FROM bill_items WHERE bill_id=? ORDER BY id', [id]);
}
export async function addBillItem(billId, { code, name, qty, price }) {
  await (await getDb()).runAsync(
    'INSERT INTO bill_items(bill_id, code, name, qty, price, created_at) VALUES(?,?,?,?,?,?)',
    [billId, code, name, qty, price, Date.now()]);
}
export async function updateBillItem(id, { code, name, qty, price }) {
  await (await getDb()).runAsync('UPDATE bill_items SET code=?, name=?, qty=?, price=? WHERE id=?', [code, name, qty, price, id]);
}
export async function deleteBillItem(id) { await (await getDb()).runAsync('DELETE FROM bill_items WHERE id=?', [id]); }
export async function saveBill(id, note = '') {
  const db = await getDb();
  const s = await db.getFirstAsync('SELECT COALESCE(SUM(qty*price),0) AS t FROM bill_items WHERE bill_id=?', [id]);
  await db.runAsync("UPDATE bills SET status='saved', saved_at=?, total=?, note=? WHERE id=?", [Date.now(), r2(s.t), note, id]);
}
export async function discardBill(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM bill_items WHERE bill_id=?', [id]);
  await db.runAsync('DELETE FROM bills WHERE id=?', [id]);
}
export async function listBills() {
  return (await getDb()).getAllAsync(`SELECT b.*, (SELECT COUNT(*) FROM bill_items WHERE bill_id=b.id) AS count
    FROM bills b WHERE status='saved' ORDER BY saved_at DESC`);
}
export async function billsSince(since) {
  const r = await (await getDb()).getFirstAsync(
    "SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS t FROM bills WHERE status='saved' AND saved_at>=?", [since]);
  return { n: r.n, total: r2(r.t) };
}
// Last price/name used for a barcode (falls back to the Library note as the name)
export async function lastInfo(code) {
  const db = await getDb();
  const b = await db.getFirstAsync("SELECT name, price FROM bill_items WHERE code=? AND code<>'' ORDER BY id DESC", [code]);
  if (b) return b;
  const l = await db.getFirstAsync('SELECT notes FROM items WHERE code=? LIMIT 1', [code]);
  return { name: l?.notes || '', price: null };
}
export async function productsSold(since) {
  return (await getDb()).getAllAsync(`SELECT code, name, SUM(qty) AS qty, SUM(qty*price) AS amount FROM bill_items
    WHERE bill_id IN (SELECT id FROM bills WHERE status='saved' AND saved_at>=?)
    GROUP BY code, name ORDER BY amount DESC`, [since]);
}
export async function allBillLines() {
  return (await getDb()).getAllAsync(`SELECT b.id AS bill, b.saved_at, i.code, i.name, i.qty, i.price
    FROM bill_items i JOIN bills b ON b.id=i.bill_id WHERE b.status='saved' ORDER BY b.id, i.id`);
}
export const billsCSV = (rows) => ['bill,date,code,name,qty,price,amount', ...rows.map((r) =>
  [r.bill, esc(new Date(r.saved_at).toISOString()), csvCode(r.code), esc(r.name), r.qty, r.price, r2(r.qty * r.price)].join(','))].join('\n');
