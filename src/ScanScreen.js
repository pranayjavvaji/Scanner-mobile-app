import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { C, TYPES } from './theme';
import { Btn, Input, Dot } from './ui';
import { addItem, updateItem } from './db';
import { buildText, ping } from './net';

export default function ScanScreen({ app }) {
  const { settings, devices, device, setDefaultId } = app;
  const [perm, askPerm] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [last, setLast] = useState(null);
  const [status, setStatus] = useState('unknown');
  const seen = useRef({ code: '', t: 0 });
  const busy = useRef(false);

  useEffect(() => {
    if (!device) { setStatus('unknown'); return; }
    let live = true;
    const run = async () => { const r = await ping(device); if (live) setStatus(r.ok ? 'ok' : 'bad'); };
    run();
    const id = setInterval(run, 8000);
    return () => { live = false; clearInterval(id); };
  }, [device?.id, device?.host, device?.port]);

  const onScan = async ({ data, type }) => {
    const now = Date.now();
    const same = seen.current.code === data && now - seen.current.t < settings.cooldown;
    seen.current = { code: data, t: now };   // holding on the same code never repeats
    if (same || busy.current) return;
    busy.current = true;
    try {
      if (settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      let item = null, sent = null;
      if (settings.mode !== 'send') item = await addItem({ code: data, format: type, quantity: 1 }, settings.dup);
      if (settings.mode !== 'store') {
        sent = await app.sendOne(buildText({ code: data, quantity: item?.quantity ?? 1, notes: item?.notes ?? '' }, settings.format));
      }
      setLast({ code: data, type, item, sent });
      app.bump();
    } finally { busy.current = false; }
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

  if (!perm) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  if (!perm.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 30 }}>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Camera access needed</Text>
        <Text style={{ color: C.sub, marginBottom: 18 }}>BarScan uses the camera only to read barcodes.</Text>
        <Btn title="Allow camera" onPress={askPerm} />
      </View>
    );
  }

  const needsPC = settings.mode !== 'store';
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CameraView style={{ flex: 1 }} facing="back" enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: TYPES }} onBarcodeScanned={onScan} />
      <View pointerEvents="none" style={{ position: 'absolute', top: '22%', left: '10%', right: '10%', height: 170,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16 }} />

      <View style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={device ? cycleDevice : () => app.goto('devices')} activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(15,17,21,0.85)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, maxWidth: '70%' }}>
          <Dot status={needsPC ? status : 'unknown'} />
          <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>
            {settings.mode === 'store' ? 'Store only' : device ? `${device.name} · ${device.host}` : 'No PC – tap to set up'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTorch(!torch)}
          style={{ backgroundColor: torch ? C.warn : 'rgba(15,17,21,0.85)', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>🔦</Text>
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border, padding: 14 }}>
        {!last ? (
          <Text style={{ color: C.sub, textAlign: 'center' }}>Point the camera at a barcode</Text>
        ) : (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }} numberOfLines={1}>{last.code}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>
                  {last.type}
                  {last.item?.existed ? ' · already stored, quantity increased' : last.item ? ' · saved' : ''}
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
