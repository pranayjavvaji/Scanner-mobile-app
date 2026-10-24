import * as Network from 'expo-network';

async function call(d, path, body, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`http://${d.host}:${d.port}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Token': d.token || '' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) return { ok: false, msg: 'Wrong token' };
    return res.ok ? { ...json, ok: true } : { ok: false, msg: json.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, msg: e.name === 'AbortError' ? 'Timed out' : 'Cannot reach PC' };
  } finally { clearTimeout(t); }
}

export const ping = (d) => call(d, '/ping', null, 2500);
// suffix = key pressed after the item, prefix = key(s) pressed before it (none | esc | esc2)
// `meta` = details shown in the PC console only (never typed): code, quantity, notes, type, source
export const sendText = (d, text, suffix, prefix, meta) => call(d, '/type', { text, suffix, prefix, meta });
export const sendBulk = (d, items, suffix, delay, prefix, metas) => call(d, '/bulk', { items, suffix, delay, prefix, metas }, 30000);
// quantity / notes changed on the phone after a scan was already sent
export const sendInfo = (d, meta) => call(d, '/info', { meta });
export const buildMeta = (item, source) => ({
  code: String(item.code), quantity: item.quantity, notes: String(item.notes || '').replace(/\s+/g, ' ').slice(0, 200),
  type: item.format || item.type || '', source, existed: !!item.existed,
});
// press a key / key combo on the PC, e.g. ['left'] or ['shift', 'tab']
export const sendKeys = (d, keys) => call(d, '/key', { keys });

// What gets typed on the PC for one stored/scanned item
export function buildText(item, format) {
  const notes = String(item.notes || '').replace(/\s+/g, ' ');
  if (format === 'code_qty') return `${item.code}\t${item.quantity}`;
  if (format === 'code_qty_notes') return `${item.code}\t${item.quantity}\t${notes}`;
  return String(item.code);
}

// Scan the phone's /24 subnet for running receivers
export async function discover(port, onFound, shouldStop) {
  const ip = await Network.getIpAddressAsync();
  const m = /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip || '');
  if (!m) throw new Error('Connect the phone to Wi-Fi first');
  const hosts = Array.from({ length: 254 }, (_, i) => `${m[1]}.${i + 1}`);
  for (let i = 0; i < hosts.length; i += 48) {
    if (shouldStop?.()) return;
    await Promise.all(hosts.slice(i, i + 48).map(async (host) => {
      const r = await call({ host, port }, '/ping', null, 900);
      if (r.ok && r.app === 'barscan') onFound({ host, port, name: r.name });
    }));
  }
}
