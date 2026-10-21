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
