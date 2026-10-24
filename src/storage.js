import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_SETTINGS = {
  mode: 'both',        // both | send | store
  dup: 'increment',    // increment | new
  suffix: 'enter',     // enter | tab | none   (key pressed on the PC AFTER each item)
  prefix: 'none',      // none | esc | esc2    (Esc pressed on the PC BEFORE each item)
  format: 'code',      // code | code_qty | code_qty_notes
  scanMode: 'confirm', // confirm (tap the shutter) | auto
  strict: true,        // auto mode: ignore codes with a bad check digit
  startScreen: 'scan', // scan | home
  currency: '₹',
  upcToEan: true,      // 12-digit UPC-A -> 13-digit EAN-13 (restores the leading 0 the scanner drops)
  padLen: 0,           // pad all-digit codes with leading zeros up to N digits (0 = off)
  excelText: false,    // type an apostrophe before codes starting with 0 so Excel keeps the zero
  keyLeft: 'shift_tab', // key sent to the PC by the button left of the shutter (see keys.js)
  keyRight: 'tab',      // key sent to the PC by the button right of the shutter
  haptics: true,
  cooldown: 1500,
  sendDelay: 150,
};
const get = async (k, d) => { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const set = (k, v) => AsyncStorage.setItem(k, JSON.stringify(v));

export const loadAll = async () => ({
  settings: { ...DEFAULT_SETTINGS, ...(await get('settings', {})) },
  devices: await get('devices', []),
  defaultId: await get('defaultId', null),
});
export const saveSettings = (v) => set('settings', v);
export const saveDevices = (v) => set('devices', v);
export const saveDefault = (v) => set('defaultId', v);
