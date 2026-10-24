import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { C } from './src/theme';
import { loadAll, saveSettings, saveDevices, saveDefault } from './src/storage';
import { sendText, sendBulk, sendKeys, sendInfo as netInfo } from './src/net';
import HomeScreen from './src/HomeScreen';
import ScanScreen from './src/ScanScreen';
import BillsScreen from './src/BillsScreen';
import LibraryScreen from './src/LibraryScreen';
import DevicesScreen from './src/DevicesScreen';

const TABS = [['home', '🏠 Home'], ['scan', '📷 Scan'], ['bills', '🧾 Bills'], ['library', '🗂 Library'], ['devices', '⚙️ Setup']];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('scan');
  const [intent, setIntent] = useState(null);   // lets Home open "New bill" directly
  const [settings, setSettingsS] = useState({});
  const [devices, setDevicesS] = useState([]);
  const [defaultId, setDefaultS] = useState(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    loadAll().then((d) => {
      setSettingsS(d.settings); setDevicesS(d.devices); setDefaultS(d.defaultId);
      setTab(d.settings.startScreen === 'home' ? 'home' : 'scan');
      setReady(true);
    });
  }, []);

  const setSettings = (v) => { setSettingsS(v); saveSettings(v); };
  const setDevices = (v) => { setDevicesS(v); saveDevices(v); };
  const setDefaultId = (v) => { setDefaultS(v); saveDefault(v); };
  const bump = useCallback(() => setRev((r) => r + 1), []);

  const device = devices.find((d) => d.id === defaultId) || devices[0] || null;
  const noDev = { ok: false, msg: 'No PC set up (Setup tab)' };
  // Excel turns long numbers into 8.90101E+12 and drops leading zeros; a leading apostrophe keeps the cell as text
  const xl = (t) => {
    const first = t.split('\t')[0];
    return settings.excelText && /^\d+$/.test(first) && (first.length >= 10 || first[0] === '0') ? `'${t}` : t;
  };
  const sendOne = async (text, meta) =>
    (device ? sendText(device, xl(text), settings.suffix, settings.prefix, meta) : noDev);
  const sendMany = async (texts, metas) =>
    (device ? sendBulk(device, texts.map(xl), settings.suffix, settings.sendDelay / 1000, settings.prefix, metas) : noDev);
  const sendInfo = async (meta) => (device ? netInfo(device, meta) : noDev);
  const sendKey = async (keys) => (device ? sendKeys(device, keys) : noDev);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const app = {
    settings, setSettings, devices, setDevices, defaultId, setDefaultId, device, sendOne, sendMany, sendKey, sendInfo, rev, bump,
    intent, clearIntent: () => setIntent(null),
    goto: (t, i = null) => { setIntent(i); setTab(t); },
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ flex: 1 }}>
          {tab === 'home' && <HomeScreen app={app} />}
          {tab === 'scan' && <ScanScreen app={app} />}
          {tab === 'bills' && <BillsScreen app={app} />}
          {tab === 'library' && <LibraryScreen app={app} />}
          {tab === 'devices' && <DevicesScreen app={app} />}
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: C.border, backgroundColor: C.card }}>
          {TABS.map(([k, l]) => {
            const on = tab === k;
            const [icon, ...words] = l.split(' ');
            return (
              <TouchableOpacity key={k} onPress={() => setTab(k)} activeOpacity={0.7}
                style={{ flex: 1, paddingTop: 8, paddingBottom: 10, alignItems: 'center', borderTopWidth: 2,
                  borderTopColor: on ? C.accent : 'transparent', opacity: on ? 1 : 0.75 }}>
                <Text style={{ fontSize: 18 }}>{icon}</Text>
                <Text style={{ color: on ? C.accent : C.sub, fontWeight: '700', fontSize: 10, marginTop: 2 }}>{words.join(' ')}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
