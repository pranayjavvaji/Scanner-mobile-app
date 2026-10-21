import React from 'react';
import { View, Text, ScrollView, Modal } from 'react-native';
import { C } from './theme';
import { s } from './ui';
import { r2 } from './db';

export const money = (n, cur) => `${cur}${r2(n).toFixed(2)}`;

export function receiptText(bill, items, cur) {
  const total = r2(items.reduce((t, i) => t + i.qty * i.price, 0));
  const when = new Date(bill?.saved_at || bill?.created_at || Date.now()).toLocaleString();
  return [`BILL #${bill?.id ?? ''}   ${when}`, '------------------------',
    ...items.map((i) => `${i.name || i.code}\n  ${i.qty} x ${r2(i.price).toFixed(2)} = ${r2(i.qty * i.price).toFixed(2)}`),
    '------------------------', `TOTAL: ${money(total, cur)}`].join('\n');
}

export default function Receipt({ visible, bill, items, cur, actions }) {
  const total = r2(items.reduce((t, i) => t + i.qty * i.price, 0));
  const pcs = items.reduce((t, i) => t + i.qty, 0);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={s.modalWrap}><View style={[s.modal, { maxHeight: '92%' }]}>
        <Text style={s.h}>Bill #{bill?.id}</Text>
        <Text style={{ color: C.sub, marginBottom: 8 }}>
          {new Date(bill?.saved_at || bill?.created_at || Date.now()).toLocaleString()}
        </Text>
        <ScrollView style={{ maxHeight: 380 }}>
          {items.map((i) => (
            <View key={i.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
              borderBottomWidth: 1, borderColor: C.border }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: C.text, fontWeight: '600' }}>{i.name || i.code}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>
                  {i.qty} × {r2(i.price).toFixed(2)}{i.name && i.code ? `  ·  ${i.code}` : ''}
                </Text>
              </View>
              <Text style={{ color: C.text, fontWeight: '700' }}>{r2(i.qty * i.price).toFixed(2)}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
          <Text style={{ color: C.sub }}>{items.length} lines · {pcs} pcs</Text>
          <Text style={{ color: C.text, fontSize: 24, fontWeight: '900' }}>{money(total, cur)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>{actions}</View>
      </View></View>
    </Modal>
  );
}
