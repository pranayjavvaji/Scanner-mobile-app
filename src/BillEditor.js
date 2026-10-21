import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, Alert, Share } from 'react-native';
import { C } from './theme';
import { Btn, Input, Label, Overlay, s } from './ui';
import Scanner from './Scanner';
import Receipt, { money, receiptText } from './Receipt';
import { billItems, addBillItem, updateBillItem, deleteBillItem, saveBill, discardBill, lastInfo, r2 } from './db';

export default function BillEditor({ app, billId, onExit }) {
  const cur = app.settings.currency || '₹';
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);        // {id?, code, name, price, qty}
  const [preview, setPreview] = useState(false);
  const load = async () => setItems(await billItems(billId));
  useEffect(() => { load(); }, [billId]);
  const total = r2(items.reduce((t, i) => t + i.qty * i.price, 0));

  const onAccept = async ({ data }) => {
    const info = await lastInfo(data);   // pre-fill the last price / name used for this barcode
    setForm({ id: null, code: data, name: info.name || '', price: info.price != null ? String(info.price) : '', qty: '1' });
  };
  const submit = async () => {
    const price = parseFloat(String(form.price).replace(',', '.'));
    const qty = Math.max(1, parseInt(form.qty, 10) || 1);
    if (isNaN(price) || price < 0) return Alert.alert('Enter the amount');
    if (!form.code.trim() && !form.name.trim()) return Alert.alert('Enter a barcode or a name');
    const row = { code: form.code.trim(), name: form.name.trim(), qty, price };
    if (form.id) await updateBillItem(form.id, row); else await addBillItem(billId, row);
    setForm(null); load();
  };
  const discard = () => Alert.alert('Discard this bill?', 'All its lines will be deleted.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: async () => { await discardBill(billId); onExit(); } },
  ]);
  const confirmSave = async () => {
    await saveBill(billId);
    setPreview(false); app.bump();
    Alert.alert('Bill saved', money(total, cur));
    onExit();
  };
  const bill = { id: billId, created_at: Date.now() };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, backgroundColor: C.card }}>
        <Btn small kind="ghost" title="← Back" onPress={onExit} />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: C.text, fontWeight: '800' }}>Bill #{billId}</Text>
          <Text style={{ color: C.good, fontSize: 11 }}>auto-saved · safe if power goes off</Text>
        </View>
        <Btn small kind="danger" title="Discard" onPress={discard} />
      </View>

      <View style={{ height: 270 }}><Scanner app={app} onAccept={onAccept} paused={!!form || preview} /></View>

      <FlatList style={{ flex: 1 }} data={items} keyExtractor={(i) => String(i.id)} contentContainerStyle={{ padding: 10 }}
        ListEmptyComponent={<Text style={{ color: C.sub, textAlign: 'center', marginTop: 20 }}>Scan a product to add it</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={[s.card, { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }]}
            onPress={() => setForm({ id: item.id, code: item.code, name: item.name, price: String(item.price), qty: String(item.qty) })}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: C.text, fontWeight: '700' }} numberOfLines={1}>{item.name || item.code}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>
                {item.qty} × {r2(item.price).toFixed(2)}{item.name && item.code ? `  ·  ${item.code}` : ''}
              </Text>
            </View>
            <Text style={{ color: C.text, fontWeight: '800' }}>{r2(item.qty * item.price).toFixed(2)}</Text>
          </TouchableOpacity>
        )} />

      <View style={{ backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border, padding: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: C.sub }}>{items.length} lines</Text>
          <Text style={{ color: C.text, fontSize: 26, fontWeight: '900' }}>Total {money(total, cur)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn kind="ghost" title="+ Manual item" style={{ flex: 1 }}
            onPress={() => setForm({ id: null, code: '', name: '', price: '', qty: '1' })} />
          <Btn title="Preview & save" style={{ flex: 1 }} disabled={!items.length} onPress={() => setPreview(true)} />
        </View>
      </View>

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <Overlay><View style={s.modal}>
          <Text style={s.h}>{form?.id ? 'Edit line' : 'Add to bill'}</Text>
          <Label>BARCODE (optional for manual items)</Label>
          <Input value={form?.code} onChangeText={(t) => setForm({ ...form, code: t })} autoCapitalize="none" />
          <Label>PRODUCT NAME (optional)</Label>
          <Input value={form?.name} onChangeText={(t) => setForm({ ...form, name: t })} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 2 }}>
              <Label>AMOUNT ({cur}) PER UNIT</Label>
              <Input value={form?.price} autoFocus keyboardType="decimal-pad"
                onChangeText={(t) => setForm({ ...form, price: t })} onSubmitEditing={submit} />
            </View>
            <View style={{ flex: 1 }}>
              <Label>QTY</Label>
              <Input value={form?.qty} keyboardType="number-pad"
                onChangeText={(t) => setForm({ ...form, qty: t })} onSubmitEditing={submit} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Btn title={form?.id ? 'Save' : 'Add'} onPress={submit} />
            {!!form?.id && <Btn kind="danger" title="Delete line"
              onPress={async () => { await deleteBillItem(form.id); setForm(null); load(); }} />}
            <Btn kind="ghost" title="Cancel" onPress={() => setForm(null)} />
          </View>
        </View></Overlay>
      </Modal>

      <Receipt visible={preview} bill={bill} items={items} cur={cur} actions={[
        <Btn key="s" title="Save bill" onPress={confirmSave} />,
        <Btn key="sh" kind="ghost" title="Share" onPress={() => Share.share({ message: receiptText(bill, items, cur) })} />,
        <Btn key="b" kind="ghost" title="Back to edit" onPress={() => setPreview(false)} />,
      ]} />
    </View>
  );
}
