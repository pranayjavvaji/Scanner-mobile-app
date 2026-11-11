import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Modal } from 'react-native';
import { C } from './theme';
import { Btn, Input, Dot, Overlay, s } from './ui';
import { addItem, updateItem, lookupBarcode } from './db';
import { buildText, buildMeta, ping } from './net';
import Scanner from './Scanner';
import { keyAction } from './keys';

export default function ScanScreen({ app }) {
  const { settings, devices, device, setDefaultId } = app;
  const [last, setLast] = useState(null);
  const [status, setStatus] = useState('unknown');
  const [multiPrompt, setMultiPrompt] = useState(null); // { data, type, name, rates }
  const infoTimer = useRef(null);

  useEffect(() => {
    if (!device) { setStatus('unknown'); return; }
    let live = true;
    const run = async () => { const r = await ping(device); if (live) setStatus(r.ok ? 'ok' : 'bad'); };
    run();
    const id = setInterval(run, 8000);
    return () => { live = false; clearInterval(id); };
  }, [device?.id, device?.host, device?.port]);

  const processScan = async (data, type, chosenRate = null) => {
    let noteText = '';
    const info = await lookupBarcode(data);
    if (info) {
      noteText = info.product.pro_name;
      if (chosenRate != null) {
        noteText += ` | ₹${chosenRate.toFixed(2)}`;
      } else if (info.rates.length === 1) {
        noteText += ` | ₹${info.rates[0].toFixed(2)}`;
      }
    }

    let item = null, sent = null;
    if (settings.mode !== 'send') {
      item = await addItem({ code: data, format: type, quantity: 1, notes: noteText }, settings.dup);
    }
    if (settings.mode !== 'store') {
      const finalNotes = item?.notes || noteText;
      sent = await app.sendOne(
        buildText({ code: data, quantity: item?.quantity ?? 1, notes: finalNotes }, settings.format),
        buildMeta({ code: data, quantity: item?.quantity ?? 1, notes: finalNotes, format: type, existed: item?.existed }, 'scan'));
    }
    setLast({ code: data, type, item: item || { code: data, quantity: 1, notes: noteText }, sent });
    app.bump();
  };

  const onAccept = async ({ data, type }) => {
    const info = await lookupBarcode(data);
    if (info && info.rates && info.rates.length > 1) {
      setMultiPrompt({ data, type, name: info.product.pro_name, rates: info.rates });
      return;
    }
    await processScan(data, type);
  };

  const edit = (patch) => {
    const item = { ...last.item, ...patch };
    setLast({ ...last, item });
    updateItem(item.id, item);
    app.bump();
    // tell the PC console about the change (waits a moment so typing notes doesn't spam it)
    if (settings.mode !== 'store') {
      clearTimeout(infoTimer.current);
      infoTimer.current = setTimeout(() => app.sendInfo(buildMeta(item, 'scan')), 700);
    }
  };

  const cycleDevice = () => {
    if (devices.length < 2) return;
    const i = devices.findIndex((d) => d.id === device?.id);
    setDefaultId(devices[(i + 1) % devices.length].id);
  };

  const needsPC = settings.mode !== 'store';
  const keyButtons = ['keyLeft', 'keyRight'].map((k) => {
    const a = keyAction(settings[k]);
    return a.keys ? { label: a.icon, onPress: () => app.sendKey(a.keys) } : null;
  });

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

      <View style={{ flex: 1 }}><Scanner app={app} onAccept={onAccept} keyButtons={keyButtons} /></View>

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
                <Input style={{ flex: 1, marginBottom: 0 }} placeholder="Notes / Name" value={last.item.notes}
                  onChangeText={(t) => edit({ notes: t })} />
              </View>
            )}
          </View>
        )}
      </View>

      {/* Multiple Rate Prompt Modal */}
      <Modal visible={!!multiPrompt} transparent animationType="fade">
        <Overlay>
          <View style={s.modal}>
            <Text style={s.h}>Select Price</Text>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 6 }}>
              {multiPrompt?.name}
            </Text>
            <Text style={{ color: C.sub, fontSize: 12, marginBottom: 14 }}>
              Multiple MRPs registered for this barcode. Tap the rate printed on the packet:
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {multiPrompt?.rates?.map((r, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    const { data, type } = multiPrompt;
                    setMultiPrompt(null);
                    processScan(data, type, r);
                  }}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10,
                    backgroundColor: C.accent, alignItems: 'center', minWidth: 90
                  }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
                    ₹{r.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Btn kind="ghost" title="Skip Rate Selection" onPress={() => {
              const { data, type } = multiPrompt;
              setMultiPrompt(null);
              processScan(data, type);
            }} />
          </View>
        </Overlay>
      </Modal>
    </KeyboardAvoidingView>
  );
}
