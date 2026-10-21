import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView } from 'react-native';
import { C } from './theme';
import { Btn, Input, Dot } from './ui';
import { addItem, updateItem } from './db';
import { buildText, ping } from './net';
import Scanner from './Scanner';

export default function ScanScreen({ app }) {
  const { settings, devices, device, setDefaultId } = app;
  const [last, setLast] = useState(null);
  const [status, setStatus] = useState('unknown');

  useEffect(() => {
    if (!device) { setStatus('unknown'); return; }
    let live = true;
    const run = async () => { const r = await ping(device); if (live) setStatus(r.ok ? 'ok' : 'bad'); };
    run();
    const id = setInterval(run, 8000);
    return () => { live = false; clearInterval(id); };
  }, [device?.id, device?.host, device?.port]);

  const onAccept = async ({ data, type }) => {
    let item = null, sent = null;
    if (settings.mode !== 'send') item = await addItem({ code: data, format: type, quantity: 1 }, settings.dup);
    if (settings.mode !== 'store') {
      sent = await app.sendOne(buildText({ code: data, quantity: item?.quantity ?? 1, notes: item?.notes ?? '' }, settings.format));
    }
    setLast({ code: data, type, item, sent });
    app.bump();
  };
  const edit = (patch) => {
    const item = { ...last.item, ...patch };
    setLast({ ...last, item });
    updateItem(item.id, item);
    app.bump();
  };
  const cycleDevice = () => {
    if (devices.length < 2) return;
    const i = devices.findIndex((d) => d.id === device?.id);
    setDefaultId(devices[(i + 1) % devices.length].id);
  };
  const needsPC = settings.mode !== 'store';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <TouchableOpacity onPress={device ? cycleDevice : () => app.goto('devices')} activeOpacity={0.8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: C.card }}>
        <Dot status={needsPC ? status : 'unknown'} />
        <Text style={{ color: C.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {settings.mode === 'store' ? 'Store only (not sending to a PC)'
            : device ? `${device.name} · ${device.host}:${device.port}` : 'No PC – tap to set up'}
        </Text>
        {devices.length > 1 && <Text style={{ color: C.sub, fontSize: 12 }}>tap to switch</Text>}
      </TouchableOpacity>

      <View style={{ flex: 1 }}><Scanner app={app} onAccept={onAccept} /></View>

      <View style={{ backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border, padding: 14 }}>
        {!last ? (
          <Text style={{ color: C.sub, textAlign: 'center' }}>Scanned items appear here</Text>
        ) : (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }} numberOfLines={1}>{last.code}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>
                  {last.type}{last.item?.existed ? ' · already stored, quantity increased' : last.item ? ' · saved' : ''}
                </Text>
              </View>
              {last.sent && (
                <Text style={{ color: last.sent.ok ? C.good : C.bad, fontWeight: '700' }}>
                  {last.sent.ok ? 'Sent ✓' : last.sent.msg}
                </Text>
              )}
            </View>
            {last.item && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
                <Btn small kind="ghost" title="−" onPress={() => edit({ quantity: Math.max(1, last.item.quantity - 1) })} />
                <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', minWidth: 28, textAlign: 'center' }}>{last.item.quantity}</Text>
                <Btn small kind="ghost" title="+" onPress={() => edit({ quantity: last.item.quantity + 1 })} />
                <Input style={{ flex: 1, marginBottom: 0 }} placeholder="Notes" value={last.item.notes}
                  onChangeText={(t) => edit({ notes: t })} />
              </View>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
