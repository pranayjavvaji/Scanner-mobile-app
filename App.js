import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { C } from './src/theme';
import { loadAll, saveSettings, saveDevices, saveDefault } from './src/storage';
import { sendText, sendBulk } from './src/net';
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
  const sendOne = async (text) => (device ? sendText(device, text, settings.suffix, settings.prefix) : noDev);
  const sendMany = async (texts) =>
    (device ? sendBulk(device, texts, settings.suffix, settings.sendDelay / 1000, settings.prefix) : noDev);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const app = {
    settings, setSettings, devices, setDevices, defaultId, setDefaultId, device, sendOne, sendMany, rev, bump,
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
          {TABS.map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: tab === k ? C.accent : C.sub, fontWeight: '700', fontSize: 11 }}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
