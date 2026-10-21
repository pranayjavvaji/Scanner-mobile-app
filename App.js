import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { C } from './src/theme';
import { loadAll, saveSettings, saveDevices, saveDefault } from './src/storage';
import { sendText, sendBulk } from './src/net';
import ScanScreen from './src/ScanScreen';
import LibraryScreen from './src/LibraryScreen';
import DevicesScreen from './src/DevicesScreen';

const TABS = [['scan', '📷  Scan'], ['library', '🗂  Library'], ['devices', '💻  Devices']];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('scan');
  const [settings, setSettingsS] = useState({});
  const [devices, setDevicesS] = useState([]);
  const [defaultId, setDefaultS] = useState(null);
  const [rev, setRev] = useState(0);

  useEffect(() => { loadAll().then((d) => { setSettingsS(d.settings); setDevicesS(d.devices); setDefaultS(d.defaultId); setReady(true); }); }, []);

  const setSettings = (v) => { setSettingsS(v); saveSettings(v); };
  const setDevices = (v) => { setDevicesS(v); saveDevices(v); };
  const setDefaultId = (v) => { setDefaultS(v); saveDefault(v); };
  const bump = useCallback(() => setRev((r) => r + 1), []);

  const device = devices.find((d) => d.id === defaultId) || devices[0] || null;
  const noDev = { ok: false, msg: 'No PC set up (Devices tab)' };
  const sendOne = async (text) => (device ? sendText(device, text, settings.suffix) : noDev);
  const sendMany = async (texts) => (device ? sendBulk(device, texts, settings.suffix, settings.sendDelay / 1000) : noDev);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const app = { settings, setSettings, devices, setDevices, defaultId, setDefaultId, device, sendOne, sendMany, rev, bump, goto: setTab };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ flex: 1 }}>
          {tab === 'scan' && <ScanScreen app={app} />}
          {tab === 'library' && <LibraryScreen app={app} />}
          {tab === 'devices' && <DevicesScreen app={app} />}
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: C.border, backgroundColor: C.card }}>
          {TABS.map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: tab === k ? C.accent : C.sub, fontWeight: '700', fontSize: 13 }}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
