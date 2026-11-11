import * as SQLite from 'expo-sqlite';

let dbp;
export const getDb = () => (dbp ??= (async () => {
  const db = await SQLite.openDatabaseAsync('barscan.db');
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS items(
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, format TEXT,
      quantity INTEGER NOT NULL DEFAULT 1, notes TEXT DEFAULT '',
      created_at INTEGER, updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_code ON items(code);

    CREATE TABLE IF NOT EXISTS bills(
      id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER, saved_at INTEGER, total REAL DEFAULT 0, note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS bill_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL,
      code TEXT DEFAULT '', name TEXT DEFAULT '', qty INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0, created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_bi_bill ON bill_items(bill_id);

    -- Master Products Table
    CREATE TABLE IF NOT EXISTS products(
      pro_id TEXT PRIMARY KEY,
      pro_code TEXT DEFAULT '',
      pro_name TEXT NOT NULL,
      pro_active INTEGER DEFAULT 1,
      enable_stock INTEGER DEFAULT 1,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(pro_name);
    CREATE INDEX IF NOT EXISTS idx_products_code ON products(pro_code);

    -- Barcodes & Rates Table
    CREATE TABLE IF NOT EXISTS barcodes(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      barcode TEXT NOT NULL,
      sp REAL NOT NULL DEFAULT 0,
      stock_qty REAL DEFAULT 0,
      is_default INTEGER DEFAULT 1,
      updated_at INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(pro_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_barcodes_barcode ON barcodes(barcode);
    CREATE INDEX IF NOT EXISTS idx_barcodes_pid ON barcodes(product_id);
  `);
  return db;
})());

/* ------------------------------ Catalogue & Barcode Lookup ------------------------------ */

export async function lookupBarcode(code) {
  if (!code) return null;
  const db = await getDb();
  const clean = String(code).trim();
  const rows = await db.getAllAsync(`
    SELECT 
      b.id AS barcode_id,
      b.barcode,
      b.sp,
      b.stock_qty,
      p.pro_id,
      p.pro_code,
      p.pro_name,
      p.pro_active
    FROM barcodes b
    JOIN products p ON p.pro_id = b.product_id
    WHERE b.barcode = ? OR p.pro_code = ?
    ORDER BY b.sp ASC
  `, [clean, clean]);

  if (!rows || rows.length === 0) return null;
  return {
    product: {
      pro_id: rows[0].pro_id,
      pro_code: rows[0].pro_code,
      pro_name: rows[0].pro_name,
      pro_active: !!rows[0].pro_active,
    },
    prices: rows.map((r) => ({
      id: r.barcode_id,
      sp: r.sp,
      stock_qty: r.stock_qty,
    })),
    rates: Array.from(new Set(rows.map((r) => r.sp))),
  };
}

export async function searchCatalogue(query = '', limit = 60, offset = 0) {
  const db = await getDb();
  const q = `%${String(query).trim()}%`;
  const rows = await db.getAllAsync(`
    SELECT 
      p.pro_id,
      p.pro_code,
      p.pro_name,
      p.pro_active,
      b.barcode,
      b.sp,
      b.stock_qty
    FROM products p
    LEFT JOIN barcodes b ON b.product_id = p.pro_id
    WHERE p.pro_name LIKE ? OR p.pro_code LIKE ? OR b.barcode LIKE ?
    ORDER BY p.pro_name ASC
    LIMIT ? OFFSET ?
  `, [q, q, q, limit, offset]);

  // Group by product
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.pro_id)) {
      map.set(r.pro_id, {
        pro_id: r.pro_id,
        pro_code: r.pro_code,
        pro_name: r.pro_name,
        pro_active: !!r.pro_active,
        barcodes: [],
      });
    }
    if (r.barcode) {
      map.get(r.pro_id).barcodes.push({
        barcode: r.barcode,
        sp: r.sp,
        stock_qty: r.stock_qty,
      });
    }
  }
  return Array.from(map.values());
}

export async function countCatalogue() {
  const db = await getDb();
  const p = await db.getFirstAsync('SELECT COUNT(*) AS n FROM products');
  const b = await db.getFirstAsync('SELECT COUNT(*) AS n FROM barcodes');
  return { products: p?.n || 0, barcodes: b?.n || 0 };
}

export async function upsertProducts(products) {
  if (!products || !products.length) return;
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const p of products) {
      await db.runAsync(`
        INSERT INTO products(pro_id, pro_code, pro_name, pro_active, enable_stock, updated_at)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(pro_id) DO UPDATE SET
          pro_code = excluded.pro_code,
          pro_name = excluded.pro_name,
          pro_active = excluded.pro_active,
          enable_stock = excluded.enable_stock,
          updated_at = excluded.updated_at
      `, [p.pro_id, p.pro_code || '', p.pro_name, p.pro_active ?? 1, p.enable_stock ?? 1, now]);
    }
  });
}

export async function upsertBarcodes(barcodes) {
  if (!barcodes || !barcodes.length) return;
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const b of barcodes) {
      // Check if this exact product_id + barcode + sp exists
      const existing = await db.getFirstAsync(
        'SELECT id FROM barcodes WHERE product_id = ? AND barcode = ? AND sp = ? LIMIT 1',
        [b.product_id, b.barcode, b.sp]
      );
      if (existing) {
        await db.runAsync(
          'UPDATE barcodes SET stock_qty = ?, updated_at = ? WHERE id = ?',
          [b.stock_qty ?? 0, now, existing.id]
        );
      } else {
        await db.runAsync(`
          INSERT INTO barcodes(product_id, barcode, sp, stock_qty, is_default, updated_at)
          VALUES(?, ?, ?, ?, ?, ?)
        `, [b.product_id, b.barcode, b.sp, b.stock_qty ?? 0, b.is_default ?? 1, now]);
      }
    }
  });
}

/**
 * Imports Excel data mapped by user:
 * rows: array of objects parsed from excel sheet
 * mapping: { nameKey, barcodeKey, priceKey, stockKey }
 */
export async function importExcelData(rows, mapping, onProgress) {
  const db = await getDb();
  const now = Date.now();

  onProgress?.('Fetching existing products for name matching...');
  const allProds = await db.getAllAsync('SELECT pro_id, pro_name FROM products');
  const prodNameMap = new Map();
  for (const p of allProds) {
    prodNameMap.set(String(p.pro_name).trim().toUpperCase(), p.pro_id);
  }

  let matched = 0;
  let newProductsCreated = 0;
  let barcodesAdded = 0;

  const BATCH_SIZE = 250;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    onProgress?.(`Importing row ${i + 1} of ${rows.length}...`);

    await db.withTransactionAsync(async () => {
      for (const row of chunk) {
        const rawName = String(row[mapping.nameKey] ?? '').trim();
        const rawBarcode = String(row[mapping.barcodeKey] ?? '').trim().replace(/\.0$/, '');
        const rawPrice = parseFloat(String(row[mapping.priceKey] ?? 0).replace(',', '.')) || 0;
        const rawStock = parseFloat(String(row[mapping.stockKey] ?? 0)) || 0;

        if (!rawName && !rawBarcode) continue;

        const nameKey = rawName.toUpperCase();
        let pid = prodNameMap.get(nameKey);

        if (!pid) {
          // Create new product on-the-fly if not in database
          pid = 'EXCEL_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
          await db.runAsync(`
            INSERT INTO products(pro_id, pro_code, pro_name, pro_active, enable_stock, updated_at)
            VALUES(?, ?, ?, 1, 1, ?)
          `, [pid, rawBarcode, rawName || rawBarcode, now]);
          prodNameMap.set(nameKey, pid);
          newProductsCreated++;
        } else {
          matched++;
        }

        if (rawBarcode) {
          const ex = await db.getFirstAsync(
            'SELECT id FROM barcodes WHERE product_id = ? AND barcode = ? AND sp = ? LIMIT 1',
            [pid, rawBarcode, rawPrice]
          );
          if (ex) {
            await db.runAsync('UPDATE barcodes SET stock_qty = ?, updated_at = ? WHERE id = ?', [rawStock, now, ex.id]);
          } else {
            await db.runAsync(`
              INSERT INTO barcodes(product_id, barcode, sp, stock_qty, is_default, updated_at)
              VALUES(?, ?, ?, ?, 1, ?)
            `, [pid, rawBarcode, rawPrice, rawStock, now]);
            barcodesAdded++;
          }
        }
      }
    });
  }

  return { total: rows.length, matched, newProductsCreated, barcodesAdded };
}

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
const csvCode = (c) => (/^(0\d+|\d{10,})$/.test(String(c)) ? `="${c}"` : esc(c));
export const toCSV = (rows) =>
  ['code,format,quantity,notes,created_at', ...rows.map((r) =>
    [csvCode(r.code), esc(r.format), r.quantity, esc(r.notes), esc(new Date(r.created_at).toISOString())].join(','))].join('\n');

export async function fixStoredUpc() {
  const db = await getDb();
  const r = await db.runAsync("UPDATE items SET code = '0' || code, format = 'ean13' WHERE format = 'upc_a' AND length(code) = 12 AND code NOT GLOB '*[^0-9]*'");
  return r.changes;
}

/* ------------------------------ Billing ------------------------------ */
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

/**
 * Returns product info for a scanned barcode.
 * Priority 1: Master Catalogue (barcodes & products tables)
 * Priority 2: Previously saved bill items
 * Priority 3: Library notes
 */
export async function lastInfo(code) {
  const db = await getDb();
  // 1. Official master catalogue
  const found = await lookupBarcode(code);
  if (found) {
    return {
      name: found.product.pro_name,
      price: found.rates[0] ?? null,
      rates: found.rates,
      prices: found.prices,
      pro_code: found.product.pro_code,
    };
  }
  // 2. Previously used bill item
  const b = await db.getFirstAsync("SELECT name, price FROM bill_items WHERE code=? AND code<>'' ORDER BY id DESC", [code]);
  if (b) return { name: b.name, price: b.price, rates: [b.price], prices: [{ sp: b.price }] };
  // 3. Fallback to Library note
  const l = await db.getFirstAsync('SELECT notes FROM items WHERE code=? LIMIT 1', [code]);
  return { name: l?.notes || '', price: null, rates: [], prices: [] };
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
