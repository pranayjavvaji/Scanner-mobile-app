// Check-digit validation for EAN-13 / EAN-8 / UPC-A.
// A barcode read while the camera is moving usually fails this, so it is a cheap misread filter.
const chk = (s) => {
  const body = s.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += +body[body.length - 1 - i] * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === +s.slice(-1);
};

export function validCode(type, d) {
  const digits = /^\d+$/.test(d);
  if (type === 'ean13') return digits && d.length === 13 && chk(d);
  if (type === 'ean8') return digits && d.length === 8 && chk(d);
  if (type === 'upc_a') return digits && d.length === 12 && chk(d);
  return true; // other formats have no simple check digit
}

/**
 * Restore leading zeros that the phone's scanner drops.
 * An EAN-13 starting with 0 has exactly the same bars as a UPC-A, and Android reports it as a
 * 12-digit UPC-A, so the first 0 "disappears". Adding it back gives the 13-digit number that
 * supermarket scanners and inventory software use.
 *   settings.upcToEan : convert 12-digit UPC-A to 13-digit EAN-13 (add a leading 0)
 *   settings.padLen   : pad any all-digit code with leading zeros up to this many digits (0 = off)
 * Check digits are validated BEFORE this runs, and adding a 0 keeps an EAN-13 valid.
 */
export function normalize(type, data, settings) {
  let d = String(data), t = type;
  if (settings?.upcToEan && type === 'upc_a' && /^\d{12}$/.test(d)) { d = '0' + d; t = 'ean13'; }
  const n = parseInt(settings?.padLen, 10);
  if (n > 0 && /^\d+$/.test(d) && d.length < n) d = d.padStart(n, '0');
  return { data: d, type: t };
}
