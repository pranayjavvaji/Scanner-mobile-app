import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert, Switch } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { C } from './theme';
import { Btn, Input, Label, Seg, Dot, Overlay, s } from './ui';
import { ping, discover } from './net';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export default function DevicesScreen({ app }) {
  const { devices, setDevices, defaultId, setDefaultId, settings, setSettings } = app;
  const [form, setForm] = useState(null);
  const [qr, setQr] = useState(false);
  const [perm, askPerm] = useCameraPermissions();
  const [found, setFound] = useState([]);
  const [searching, setSearching] = useState(false);
  const [state, setState] = useState({});
  const stop = useRef(false);
  const qrDone = useRef(false);

  const save = () => {
    const port = parseInt(form.port, 10);
    if (!form.host.trim() || !port) return Alert.alert('Enter IP and port');
    const d = { id: form.id || uid(), name: form.name.trim() || form.host, host: form.host.trim(), port, token: form.token.trim() };
    const next = form.id ? devices.map((x) => (x.id === d.id ? d : x)) : [...devices, d];
    setDevices(next);
    if (!defaultId || !form.id) setDefaultId(d.id);
    setForm(null);
  };
  const test = async (d) => {
    setState((p) => ({ ...p, [d.id]: 'wait' }));
    const r = await ping(d);
    setState((p) => ({ ...p, [d.id]: r.ok ? (r.authed === false ? 'token' : 'ok') : 'bad' }));
    if (!r.ok) Alert.alert('Connection failed', r.msg);
    else if (r.authed === false) Alert.alert('PC found, but the token is wrong', 'Check the token shown in the receiver window.');
  };
  const remove = (d) => Alert.alert('Remove device?', d.name, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => { setDevices(devices.filter((x) => x.id !== d.id)); if (defaultId === d.id) setDefaultId(null); } },
  ]);

  const openQr = async () => {
    if (!perm?.granted) { const r = await askPerm(); if (!r.granted) return; }
    qrDone.current = false; setQr(true);
  };
  const onQr = ({ data }) => {
    if (qrDone.current) return;
    try {
      const p = JSON.parse(data);
      if (p.app !== 'barscan') return;
      qrDone.current = true; setQr(false);
      const d = { id: uid(), name: p.n || p.h, host: p.h, port: p.p, token: p.t };
      const exists = devices.find((x) => x.host === d.host && x.port === d.port);
      setDevices(exists ? devices.map((x) => (x === exists ? { ...exists, token: d.token, name: d.name } : x)) : [...devices, d]);
      setDefaultId(exists ? exists.id : d.id);
      Alert.alert('Paired', `${d.name} (${d.host}:${d.port})`);
    } catch { /* not our QR */ }
  };

  const find = async () => {
    stop.current = false; setFound([]); setSearching(true);
    try { await discover(8765, (f) => setFound((p) => (p.some((x) => x.host === f.host) ? p : [...p, f])), () => stop.current); }
    catch (e) { Alert.alert('Search failed', e.message); }
    setSearching(false);
  };

  const set = (k) => (v) => setSettings({ ...settings, [k]: v });

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h}>PCs</Text>
      {!devices.length && <Text style={{ color: C.sub, marginBottom: 10 }}>
        Run the receiver on your computer, then tap “Pair via QR”.</Text>}
      {devices.map((d) => (
        <View key={d.id} style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Dot status={state[d.id] === 'ok' ? 'ok' : state[d.id] ? 'bad' : 'unknown'} />
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{d.name}</Text>
            {(defaultId === d.id || (!defaultId && devices[0] === d)) && <Text style={{ color: C.accent, fontWeight: '700' }}>★ default</Text>}
          </View>
          <Text style={{ color: C.sub, marginVertical: 4 }}>{d.host}:{d.port}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <Btn small kind="ghost" title={state[d.id] === 'wait' ? '…' : 'Test'} onPress={() => test(d)} />
            <Btn small kind="ghost" title="Make default" onPress={() => setDefaultId(d.id)} />
            <Btn small kind="ghost" title="Edit" onPress={() => setForm({ ...d, port: String(d.port) })} />
            <Btn small kind="danger" title="Remove" onPress={() => remove(d)} />
          </View>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <Btn title="Pair via QR" onPress={openQr} />
        <Btn kind="ghost" title={searching ? 'Searching…' : 'Find on network'} onPress={find} disabled={searching} />
        <Btn kind="ghost" title="Add manually" onPress={() => setForm({ id: null, name: '', host: '', port: '8765', token: '' })} />
      </View>
      {found.map((f) => (
        <TouchableOpacity key={f.host} style={s.card} onPress={() => setForm({ id: null, name: f.name, host: f.host, port: String(f.port), token: '' })}>
          <Text style={{ color: C.text, fontWeight: '700' }}>{f.name} – {f.host}:{f.port}</Text>
          <Text style={{ color: C.sub, fontSize: 12 }}>Tap to add (you’ll need the token from the receiver window)</Text>
        </TouchableOpacity>
      ))}

      <Text style={[s.h, { marginTop: 22 }]}>Typing on the PC</Text>
      <Label>WHEN A BARCODE IS SCANNED</Label>
      <Seg value={settings.mode} onChange={set('mode')} options={[['both', 'Store + send'], ['send', 'Send only'], ['store', 'Store only']]} />
      <Label>SAME BARCODE SCANNED AGAIN</Label>
      <Seg value={settings.dup} onChange={set('dup')} options={[['increment', 'Add to quantity'], ['new', 'New row']]} />
      <Label>KEY PRESSED ON PC BEFORE EACH ITEM</Label>
      <Seg value={settings.prefix} onChange={set('prefix')} options={[['none', 'Nothing'], ['esc', 'Esc ×1'], ['esc2', 'Esc ×2']]} />
      <Label>KEY PRESSED ON PC AFTER EACH ITEM</Label>
      <Seg value={settings.suffix} onChange={set('suffix')} options={[['enter', 'Enter'], ['tab', 'Tab'], ['none', 'Nothing']]} />
      <Label>WHAT GETS TYPED</Label>
      <Seg value={settings.format} onChange={set('format')} options={[['code', 'Code'], ['code_qty', 'Code⇥Qty'], ['code_qty_notes', 'Code⇥Qty⇥Notes']]} />

      <Text style={[s.h, { marginTop: 22 }]}>Scanner & app</Text>
      <Label>HOW A SCAN IS ACCEPTED</Label>
      <Seg value={settings.scanMode} onChange={set('scanMode')} options={[['confirm', 'Tap shutter to confirm'], ['auto', 'Auto']]} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: C.text, flex: 1, paddingRight: 10 }}>Auto mode: reject misreads (bad check digit)</Text>
        <Switch value={settings.strict} onValueChange={set('strict')} />
      </View>
      <Label>APP OPENS ON</Label>
      <Seg value={settings.startScreen} onChange={set('startScreen')} options={[['scan', 'Scan'], ['home', 'Home']]} />
      <Label>CURRENCY SYMBOL (BILLS)</Label>
      <Input value={settings.currency} onChangeText={set('currency')} maxLength={4} style={{ width: 90 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <Text style={{ color: C.text }}>Vibrate on scan</Text>
        <Switch value={settings.haptics} onValueChange={set('haptics')} />
      </View>

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <Overlay><View style={s.modal}>
          <Text style={s.h}>{form?.id ? 'Edit PC' : 'Add PC'}</Text>
          <Label>NAME</Label><Input value={form?.name} onChangeText={(t) => setForm({ ...form, name: t })} placeholder="Office laptop" />
          <Label>IP ADDRESS</Label><Input value={form?.host} onChangeText={(t) => setForm({ ...form, host: t })} keyboardType="numbers-and-punctuation" placeholder="192.168.1.20" autoCapitalize="none" />
          <Label>PORT</Label><Input value={form?.port} onChangeText={(t) => setForm({ ...form, port: t })} keyboardType="number-pad" />
          <Label>TOKEN</Label><Input value={form?.token} onChangeText={(t) => setForm({ ...form, token: t })} autoCapitalize="none" placeholder="shown in the receiver window" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn title="Save" onPress={save} /><Btn kind="ghost" title="Cancel" onPress={() => setForm(null)} />
          </View>
        </View></Overlay>
      </Modal>

      <Modal visible={qr} animationType="slide" onRequestClose={() => setQr(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onQr} />
          <View style={{ padding: 16, backgroundColor: C.card }}>
            <Text style={{ color: C.text, marginBottom: 10 }}>Scan the QR code shown in the receiver window on your PC.</Text>
            <Btn kind="ghost" title="Cancel" onPress={() => setQr(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
