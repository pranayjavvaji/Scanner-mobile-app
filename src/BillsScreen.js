import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Share } from 'react-native';
import { C } from './theme';
import { Btn, Seg, s } from './ui';
import BillEditor from './BillEditor';
import Receipt, { money, receiptText } from './Receipt';
import { getOpenBill, createBill, discardBill, listBills, billItems, billsSince, productsSold,
  startOfDay, allBillLines, billsCSV, r2 } from './db';

export default function BillsScreen({ app }) {
  const cur = app.settings.currency || '₹';
  const [view, setView] = useState('list');     // list | edit
  const [billId, setBillId] = useState(null);
  const [open, setOpen] = useState(null);       // bill in progress (if any)
  const [bills, setBills] = useState([]);
  const [today, setToday] = useState({ n: 0, total: 0 });
  const [tab, setTab] = useState('bills');
  const [range, setRange] = useState('today');
  const [prods, setProds] = useState([]);
  const [show, setShow] = useState(null);       // {bill, items}

  const load = async () => {
    setOpen(await getOpenBill());
    setBills(await listBills());
    setToday(await billsSince(startOfDay()));
    setProds(await productsSold(range === 'today' ? startOfDay() : 0));
  };
  useEffect(() => { if (view === 'list') load(); }, [view, range]);
  useEffect(() => { if (app.intent === 'bill') { app.clearIntent(); startOrResume(); } }, []);

  const startOrResume = async () => {
    const b = await getOpenBill();
    setBillId(b ? b.id : await createBill());
    setView('edit');
  };
  const openBill = async (b) => setShow({ bill: b, items: await billItems(b.id) });
  const exportCSV = async () => {
    const rows = await allBillLines();
    rows.length ? Share.share({ title: 'bills.csv', message: billsCSV(rows) }) : Alert.alert('No saved bills yet');
  };

  if (view === 'edit') return <BillEditor app={app} billId={billId} onExit={() => setView('list')} />;
  const prodTotal = r2(prods.reduce((t, p) => t + p.amount, 0));

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <View>
          <Text style={{ color: C.sub, fontSize: 12 }}>TODAY</Text>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '900' }}>{money(today.total, cur)}</Text>
        </View>
        <Text style={{ color: C.sub }}>{today.n} bill(s)</Text>
      </View>

      {open ? (
        <View style={[s.card, { borderColor: C.warn }]}>
          <Text style={{ color: C.warn, fontWeight: '800' }}>Bill in progress #{open.id}</Text>
          <Text style={{ color: C.text, marginVertical: 4 }}>{open.count} lines · {money(open.total, cur)}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small title="Resume" onPress={startOrResume} />
            <Btn small kind="danger" title="Discard" onPress={() => Alert.alert('Discard bill in progress?', '', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Discard', style: 'destructive', onPress: async () => { await discardBill(open.id); load(); } }])} />
          </View>
        </View>
      ) : <Btn title="＋ New bill" onPress={startOrResume} style={{ marginBottom: 10 }} />}

      <Seg value={tab} onChange={setTab} options={[['bills', 'Saved bills'], ['products', 'Products sold']]} />

      {tab === 'bills' ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: C.sub }}>{bills.length} saved bill(s)</Text>
            <TouchableOpacity onPress={exportCSV}><Text style={{ color: C.accent, fontWeight: '700' }}>Export CSV</Text></TouchableOpacity>
          </View>
          <FlatList data={bills} keyExtractor={(b) => String(b.id)}
            ListEmptyComponent={<Text style={{ color: C.sub, textAlign: 'center', marginTop: 30 }}>No saved bills yet</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={[s.card, { flexDirection: 'row', justifyContent: 'space-between' }]} onPress={() => openBill(item)}>
                <View>
                  <Text style={{ color: C.text, fontWeight: '800' }}>Bill #{item.id}</Text>
                  <Text style={{ color: C.sub, fontSize: 12 }}>{new Date(item.saved_at).toLocaleString()} · {item.count} lines</Text>
                </View>
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 16 }}>{money(item.total, cur)}</Text>
              </TouchableOpacity>
            )} />
        </>
      ) : (
        <>
          <Seg value={range} onChange={setRange} options={[['today', 'Today'], ['all', 'All time']]} />
          <FlatList data={prods} keyExtractor={(p, i) => `${p.code}-${p.name}-${i}`}
            ListEmptyComponent={<Text style={{ color: C.sub, textAlign: 'center', marginTop: 30 }}>Nothing sold in this period</Text>}
            renderItem={({ item }) => (
              <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '700' }} numberOfLines={1}>{item.name || item.code}</Text>
                  <Text style={{ color: C.sub, fontSize: 12 }}>{item.name && item.code ? `${item.code} · ` : ''}sold {item.qty}</Text>
                </View>
                <Text style={{ color: C.text, fontWeight: '800' }}>{money(item.amount, cur)}</Text>
              </View>
            )} />
          {!!prods.length && (
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, textAlign: 'right' }}>Total {money(prodTotal, cur)}</Text>
          )}
        </>
      )}

      <Receipt visible={!!show} bill={show?.bill} items={show?.items || []} cur={cur} actions={[
        <Btn key="sh" kind="ghost" title="Share" onPress={() => Share.share({ message: receiptText(show.bill, show.items, cur) })} />,
        <Btn key="d" kind="danger" title="Delete" onPress={() => Alert.alert('Delete this bill?', 'It will no longer count in sales.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => { await discardBill(show.bill.id); setShow(null); load(); } }])} />,
        <Btn key="c" title="Close" onPress={() => setShow(null)} />,
      ]} />
    </View>
  );
}
