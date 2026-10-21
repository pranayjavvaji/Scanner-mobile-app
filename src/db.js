import * as SQLite from 'expo-sqlite';

let dbp;
export const getDb = () => (dbp ??= (async () => {
  const db = await SQLite.openDatabaseAsync('barscan.db');
  await db.execAsync(`CREATE TABLE IF NOT EXISTS items(
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, format TEXT,
    quantity INTEGER NOT NULL DEFAULT 1, notes TEXT DEFAULT '',
    created_at INTEGER, updated_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_code ON items(code);`);
  return db;
})());

export async function listItems(search = '') {
  const db = await getDb();
  const q = `%${search.trim()}%`;
  return db.getAllAsync(
    'SELECT * FROM items WHERE code LIKE ? OR notes LIKE ? ORDER BY updated_at DESC', [q, q]);
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
export async function deleteItem(id) { (await getDb()).runAsync('DELETE FROM items WHERE id = ?', [id]); }
export async function clearAll() { (await getDb()).runAsync('DELETE FROM items'); }

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const toCSV = (rows) =>
  ['code,format,quantity,notes,created_at', ...rows.map((r) =>
    [esc(r.code), esc(r.format), r.quantity, esc(r.notes), esc(new Date(r.created_at).toISOString())].join(','))].join('\n');
