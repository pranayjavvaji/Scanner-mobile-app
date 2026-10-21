import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, Alert, Share, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { C, TYPES } from './theme';
import { Btn, Input, Label, Overlay, s } from './ui';
import { listItems, addItem, updateItem, deleteItem, clearAll, toCSV } from './db';
import { buildText } from './net';

export default function LibraryScreen({ app }) {
  const { settings } = app;
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);      // item being edited, or {id:null} for new
  const [found, setFound] = useState(null);    // [{code,type,on}] from image import
  const [busy, setBusy] = useState(false);

  const load = async () => setItems(await listItems(q));
  useEffect(() => { load(); }, [q, app.rev]);

  const report = (r, n) =>
    r.ok ? Alert.alert('Sent', n > 1 ? `${n} items queued.\nClick the target field on your PC now – typing starts in ${r.countdown ?? 3}s.` : 'Sent to PC.')
         : Alert.alert('Not sent', r.msg);

  const sendAll = () => {
    if (!items.length) return;
    Alert.alert('Send all', `Type ${items.length} item(s) on your PC?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: async () => report(await app.sendMany(items.map((i) => buildText(i, settings.format))), items.length) },
    ]);
  };
  const exportCSV = () => items.length && Share.share({ title: 'barscan.csv', message: toCSV(items) });
  const clear = () => Alert.alert('Delete everything?', 'This removes all stored barcodes.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete all', style: 'destructive', onPress: async () => { await clearAll(); load(); } },
  ]);

  const saveEdit = async () => {
    const code = edit.code.trim();
    if (!code) return Alert.alert('Barcode is empty');
    const quantity = Math.max(1, parseInt(edit.quantity, 10) || 1);
    if (edit.id) await updateItem(edit.id, { code, quantity, notes: edit.notes });
    else await addItem({ code, format: 'manual', quantity, notes: edit.notes }, 'new');
    setEdit(null); load();
  };

  const importImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
    if (res.canceled) return;
    setBusy(true);
    const map = new Map();
    try {
      for (const a of res.assets) {
        const r = await Camera.scanFromURLAsync(a.uri, TYPES);
        (r || []).forEach((b) => map.set(b.data, { code: b.data, type: b.type, on: true }));
      }
    } catch (e) { Alert.alert('Could not read image', String(e.message || e)); }
    setBusy(false);
    if (!map.size) return Alert.alert('No barcodes found', 'Try a sharper, closer, well-lit photo.');
    setFound([...map.values()]);
  };
  const saveFound = async (andSend) => {
    const chosen = found.filter((f) => f.on);
    const saved = [];
    for (const f of chosen) saved.push(await addItem({ code: f.code, format: f.type }, settings.dup));
    setFound(null); load(); app.bump();
    if (andSend && chosen.length) report(await app.sendMany(saved.map((i) => buildText(i, settings.format))), saved.length);
  };

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <Input placeholder="Search code or notes" value={q} onChangeText={setQ} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn small title="+ Add" onPress={() => setEdit({ id: null, code: '', quantity: '1', notes: '' })} />
          <Btn small kind="ghost" title={busy ? 'Reading…' : '🖼 From image'} onPress={importImages} disabled={busy} />
          <Btn small kind="ghost" title="Send all" onPress={sendAll} />
          <Btn small kind="ghost" title="Export CSV" onPress={exportCSV} />
          <Btn small kind="danger" title="Clear" onPress={clear} />
        </View>
      </ScrollView>
      <Text style={{ color: C.sub, marginBottom: 6 }}>{items.length} item(s)</Text>
      <FlatList data={items} keyExtractor={(i) => String(i.id)}
        ListEmptyComponent={<Text style={{ color: C.sub, textAlign: 'center', marginTop: 40 }}>Nothing stored yet. Scan something!</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} activeOpacity={0.8}
            onPress={() => setEdit({ ...item, quantity: String(item.quantity) })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: C.text, fontWeight: '800', fontSize: 16, flex: 1 }} numberOfLines={1}>{item.code}</Text>
              <Text style={{ color: C.accent, fontWeight: '800' }}>× {item.quantity}</Text>
            </View>
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>
              {item.format} · {new Date(item.updated_at).toLocaleString()}
            </Text>
            {!!item.notes && <Text style={{ color: C.text, marginTop: 4 }} numberOfLines={2}>{item.notes}</Text>}
          </TouchableOpacity>
        )} />

      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <Overlay><View style={s.modal}>
          <Text style={s.h}>{edit?.id ? 'Edit item' : 'Add item'}</Text>
          <Label>BARCODE</Label>
          <Input value={edit?.code} onChangeText={(t) => setEdit({ ...edit, code: t })} autoCapitalize="none" />
          <Label>QUANTITY</Label>
          <Input value={edit?.quantity} keyboardType="number-pad" onChangeText={(t) => setEdit({ ...edit, quantity: t })} />
          <Label>NOTES</Label>
          <Input value={edit?.notes} multiline onChangeText={(t) => setEdit({ ...edit, notes: t })} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Btn title="Save" onPress={saveEdit} />
            {!!edit?.id && <Btn kind="ghost" title="Send to PC" onPress={async () =>
              report(await app.sendOne(buildText({ ...edit, quantity: parseInt(edit.quantity, 10) || 1 }, settings.format)), 1)} />}
            {!!edit?.id && <Btn kind="danger" title="Delete" onPress={async () => { await deleteItem(edit.id); setEdit(null); load(); }} />}
            <Btn kind="ghost" title="Close" onPress={() => setEdit(null)} />
          </View>
        </View></Overlay>
      </Modal>

      <Modal visible={!!found} transparent animationType="fade" onRequestClose={() => setFound(null)}>
        <View style={s.modalWrap}><View style={s.modal}>
          <Text style={s.h}>Found {found?.length} barcode(s)</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {found?.map((f, i) => (
              <TouchableOpacity key={f.code} style={[s.card, { flexDirection: 'row', justifyContent: 'space-between', opacity: f.on ? 1 : 0.4 }]}
                onPress={() => setFound(found.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}>
                <Text style={{ color: C.text, flex: 1, fontWeight: '700' }} numberOfLines={1}>{f.code}</Text>
                <Text style={{ color: C.sub }}>{f.on ? '✓ ' : ''}{f.type}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Btn title="Save" onPress={() => saveFound(false)} />
            <Btn kind="ghost" title="Save & send" onPress={() => saveFound(true)} />
            <Btn kind="ghost" title="Cancel" onPress={() => setFound(null)} />
          </View>
        </View></View>
      </Modal>
    </View>
  );
}
