import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_SETTINGS = {
  mode: 'both',        // both | send | store
  dup: 'increment',    // increment | new
  suffix: 'enter',     // enter | tab | none
  format: 'code',      // code | code_qty | code_qty_notes
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
