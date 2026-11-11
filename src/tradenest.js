import AsyncStorage from '@react-native-async-storage/async-storage';
import { upsertProducts, upsertBarcodes } from './db';

const BASE_URL = 'https://trade-nest.oneway.org.in';
const LOGIN_URL = `${BASE_URL}/api/login`;
const PRODUCTS_URL = `${BASE_URL}/api/product`;
const STOCK_REPORTS_URL = `${BASE_URL}/api/stock-reports`;
const BILLING_REPORTS_URL = `${BASE_URL}/api/billing-reports`;

const CONFIG_KEY = '@tradenest_config';
const LAST_SLOT_KEY = '@tradenest_last_sync_slot';

export async function getTradeNestConfig() {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : { storeId: '', user: '', password: '', autoSync: true, lastSync: null };
  } catch {
    return { storeId: '', user: '', password: '', autoSync: true, lastSync: null };
  }
}

export async function saveTradeNestConfig(cfg) {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export async function loginTradeNest(storeId, user, password) {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_name: user,
      user_pwd: password,
      store_id: storeId,
      is_client_environment: true,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Login failed (HTTP ${res.status}): ${txt.slice(0, 150)}`);
  }

  // Token in headers or body
  let token = res.headers.get('x-new-access-token');
  if (!token) {
    const body = await res.json().catch(() => ({}));
    token = body.token || body.access_token || body?.data?.token;
  }
  if (!token) throw new Error('Token not found in login response');
  return token;
}

function findListWithKey(obj, key) {
  if (Array.isArray(obj)) {
    if (obj.length && obj[0] && typeof obj[0] === 'object' && key in obj[0]) return obj;
    for (let i = 0; i < obj.length; i++) {
      const f = findListWithKey(obj[i], key);
      if (f) return f;
    }
  } else if (obj && typeof obj === 'object') {
    for (const k in obj) {
      const g = findListWithKey(obj[k], key);
      if (g) return g;
    }
  }
  return null;
}

export async function fetchProductsAPI(token) {
  const res = await fetch(PRODUCTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      form_name: 'Frm_Product',
      method: 'get',
      sorted_columns: [],
      filter_data: { is_filter: false },
    }),
  });

  if (!res.ok) throw new Error(`Product fetch failed (HTTP ${res.status})`);
  const data = await res.json();
  const list = findListWithKey(data, 'pro_code');
  return list || (Array.isArray(data.data) ? data.data : []);
}

export async function fetchStockReportsAPI(token, dateFrom, dateTo) {
  const res = await fetch(STOCK_REPORTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      form_name: 'Stock_Barcodewise_Report',
      table_name: 'stock',
      date_from: dateFrom,
      date_to: dateTo,
      order_by: [],
      print_group_by: ['outlet_id', 'com_id'],
      table_name: 'stock',
    }),
  });

  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.data) ? data.data : [];
}

/**
 * Executes a full sync from TradeNest:
 * 1. Logs in
 * 2. Fetches Products catalogue
 * 3. Fetches Stock / Rate reports
 * 4. Merges into local SQLite database
 */
export async function runTradeNestSync(onProgress) {
  const cfg = await getTradeNestConfig();
  if (!cfg.storeId || !cfg.user || !cfg.password) {
    throw new Error('TradeNest credentials not configured. Please enter them in Products > API Settings.');
  }

  onProgress?.('Logging in to TradeNest...');
  const token = await loginTradeNest(cfg.storeId, cfg.user, cfg.password);

  onProgress?.('Fetching product catalogue...');
  const rawProducts = await fetchProductsAPI(token);

  const today = new Date().toISOString().slice(0, 10);
  onProgress?.('Fetching stock and selling rates...');
  const rawStock = await fetchStockReportsAPI(token, today, today);

  onProgress?.(`Processing ${rawProducts.length} products...`);

  // Build product records for SQLite
  const productsToUpsert = [];
  const barcodesToUpsert = [];

  // Map stock by pro_id
  const stockMap = new Map();
  for (const s of rawStock) {
    const pid = String(s.pro_id || '').trim();
    if (!pid) continue;
    if (!stockMap.has(pid)) stockMap.set(pid, []);
    stockMap.get(pid).push(s);
  }

  const now = Date.now();
  for (const p of rawProducts) {
    const pid = String(p.pro_id || '').trim();
    if (!pid) continue;

    const pcode = String(p.pro_code || '').trim();
    const pname = String(p.pro_name || '').trim();
    const fallbackBarcode = String(p.pro_barcode || pcode).trim();

    productsToUpsert.push({
      pro_id: pid,
      pro_code: pcode,
      pro_name: pname,
      pro_active: p.pro_active !== false ? 1 : 0,
      enable_stock: p.pro_enable_stock !== false ? 1 : 0,
    });

    const stockEntries = stockMap.get(pid) || [];
    if (stockEntries.length > 0) {
      for (const s of stockEntries) {
        const bcode = String(s.s2_barcode || s.barcode || fallbackBarcode).trim();
        const sp = parseFloat(s.bar_sale_price) || 0;
        const stockQty = parseFloat(s.balance_qty || s.balance_sale_price_value || 0);

        barcodesToUpsert.push({
          product_id: pid,
          barcode: bcode,
          sp,
          stock_qty: stockQty,
          updated_at: now,
        });
      }
    } else {
      // Default fallback barcode from product table
      barcodesToUpsert.push({
        product_id: pid,
        barcode: fallbackBarcode,
        sp: parseFloat(p.pro_sale_price) || 0,
        stock_qty: 0,
        updated_at: now,
      });
    }
  }

  onProgress?.('Saving to local database...');
  await upsertProducts(productsToUpsert);
  await upsertBarcodes(barcodesToUpsert);

  const updatedCfg = { ...cfg, lastSync: Date.now() };
  await saveTradeNestConfig(updatedCfg);

  return {
    productsCount: productsToUpsert.length,
    barcodesCount: barcodesToUpsert.length,
    timestamp: updatedCfg.lastSync,
  };
}

/**
 * Determines current schedule slot:
 * - 'midnight': 00:00 - 11:59
 * - 'noon':     12:00 - 16:59
 * - 'evening':  17:00 - 23:59
 */
export function getCurrentTimeSlot() {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const hours = d.getHours();

  let slot = 'midnight';
  if (hours >= 17) {
    slot = 'evening';
  } else if (hours >= 12) {
    slot = 'noon';
  }
  return `${dateStr}_${slot}`;
}

/**
 * Checks if a scheduled sync is due (called whenever app opens).
 * If autoSync is enabled and current slot hasn't been synced, runs sync in background.
 */
export async function checkAndRunScheduledSync() {
  try {
    const cfg = await getTradeNestConfig();
    if (!cfg.autoSync || !cfg.storeId || !cfg.user || !cfg.password) return false;

    const currentSlot = getCurrentTimeSlot();
    const lastSlot = await AsyncStorage.getItem(LAST_SLOT_KEY);

    if (lastSlot === currentSlot) {
      // Already synced for this window
      return false;
    }

    // Run sync silently in background
    console.log(`[AutoSync] Triggering scheduled sync for slot ${currentSlot}...`);
    await runTradeNestSync();
    await AsyncStorage.setItem(LAST_SLOT_KEY, currentSlot);
    console.log(`[AutoSync] Completed scheduled sync for slot ${currentSlot}`);
    return true;
  } catch (err) {
    console.warn('[AutoSync] Background sync skipped/failed:', err?.message || err);
    return false;
  }
}
