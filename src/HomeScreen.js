import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { C } from './theme';
import { countItems, getOpenBill, billsSince, startOfDay } from './db';
import { money } from './Receipt';

const Tile = ({ icon, title, sub, onPress, accent }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    borderColor: accent || C.border, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
    <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(77,141,255,0.12)' }}>
      <Text style={{ fontSize: 28 }}>{icon}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>{title}</Text>
      {!!sub && <Text style={{ color: C.sub, marginTop: 2 }}>{sub}</Text>}
    </View>
    <Text style={{ color: C.sub, fontSize: 20 }}>›</Text>
  </TouchableOpacity>
);

export default function HomeScreen({ app }) {
  const cur = app.settings.currency || '₹';
  const [st, setSt] = useState({ lib: 0, open: null, today: { n: 0, total: 0 } });
  useEffect(() => {
    (async () => setSt({ lib: await countItems(), open: await getOpenBill(), today: await billsSince(startOfDay()) }))();
  }, [app.rev]);
  const pc = app.device ? `${app.device.name} · ${app.device.host}` : 'No PC set up yet';

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: C.text, fontSize: 30, fontWeight: '900' }}>BarScan</Text>
      <Text style={{ color: C.sub, marginBottom: 18 }}>Scan · Store · Send to PC · Bill</Text>
      <Tile icon="📷" title="Scan"
        sub={`${app.settings.scanMode === 'confirm' ? 'Tap to confirm' : 'Auto'} · ${pc}`}
        onPress={() => app.goto('scan')} />
      <Tile icon="🧾" accent={st.open ? C.warn : null} title={st.open ? 'Resume bill' : 'New bill'}
        sub={st.open ? `Bill #${st.open.id} · ${st.open.count} lines · ${money(st.open.total, cur)}`
          : 'Scan items, enter amounts, save the bill'}
        onPress={() => app.goto('bills', 'bill')} />
      <Tile icon="📊" title="Bills & sales" sub={`Today: ${st.today.n} bill(s) · ${money(st.today.total, cur)}`}
        onPress={() => app.goto('bills')} />
      <Tile icon="🗂" title="Library" sub={`${st.lib} stored barcode(s)`} onPress={() => app.goto('library')} />
      <Tile icon="⚙️" title="PC & Settings" sub="Devices, keys pressed on PC, scanner options"
        onPress={() => app.goto('devices')} />
    </ScrollView>
  );
}
