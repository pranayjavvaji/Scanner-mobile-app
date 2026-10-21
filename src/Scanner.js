import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CameraView, Camera, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { C, TYPES } from './theme';
import { Btn } from './ui';
import { validCode } from './barcode';

const LIVE_TTL = 1200;   // a live detection disappears this long after it was last seen
const PHOTO_TTL = 8000;  // a detection decoded from a still photo stays until confirmed

// Barcode bounds are only trusted when they fall inside the preview
const rectOf = (b, size) => {
  if (!b?.origin || !b?.size || !size.w) return null;
  const { x, y } = b.origin, { width: w, height: h } = b.size;
  if (!(w > 0 && h > 0) || x < -5 || y < -5 || x + w > size.w * 1.05 || y + h > size.h * 1.05) return null;
  return { x, y, w, h };
};
// red = bad check digit (misread), green = seen repeatedly (stable), amber = still settling
const colorOf = (d) => (!d.ok ? C.bad : d.count >= 2 ? C.good : C.warn);

/**
 * Camera + barcode detection used by the Scan screen and the Bill screen.
 *  - "confirm" mode: the number is drawn next to the barcode; the user taps the shutter when it is right.
 *  - "auto" mode: accepts a code as soon as it is read (optionally ignoring bad check digits).
 */
export default function Scanner({ app, onAccept, paused }) {
  const { settings, setSettings } = app;
  const confirmMode = settings.scanMode === 'confirm';
  const [perm, askPerm] = useCameraPermissions();
  const cam = useRef(null);
  const store = useRef(new Map());
  const autoSeen = useRef({ code: '', t: 0 });
  const toastT = useRef(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dets, setDets] = useState([]);
  const [sel, setSel] = useState(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (m) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2400); };
  const clear = () => { store.current.clear(); setDets([]); setSel(null); };

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now(), m = store.current;
      let changed = false;
      for (const [k, v] of m) if (now - v.seen > v.ttl) { m.delete(k); changed = true; }
      if (changed) setDets([...m.values()]);
    }, 250);
    return () => { clearInterval(id); clearTimeout(toastT.current); };
  }, []);
  useEffect(() => { if (paused) clear(); }, [paused]);
  useEffect(() => { clear(); }, [confirmMode]);

  const accept = (d) => {
    if (settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAccept({ data: d.data, type: d.type });
  };

  const onScan = ({ data, type, bounds }) => {
    if (paused) return;
    const now = Date.now(), ok = validCode(type, data);
    if (!confirmMode) {                                   // AUTO mode
      if (!ok && settings.strict) return;
      const same = autoSeen.current.code === data && now - autoSeen.current.t < settings.cooldown;
      autoSeen.current = { code: data, t: now };          // holding the same code never repeats it
      if (!same) accept({ data, type });
      return;
    }
    const m = store.current, prev = m.get(data);          // CONFIRM mode: just remember what is visible
    m.set(data, { key: data, data, type, bounds, ok, seen: now, ttl: LIVE_TTL,
      count: (prev && now - prev.seen < LIVE_TTL ? prev.count : 0) + 1 });
    setDets([...m.values()]);
  };

  // choose which detection the shutter confirms: valid ones first, then closest to the centre
  const best = (arr) => {
    const pool = arr.some((d) => d.ok) ? arr.filter((d) => d.ok) : arr;
    if (!pool.length) return null;
    const cx = size.w / 2, cy = size.h / 2;
    return pool.map((d) => {
      const r = rectOf(d.bounds, size);
      return { d, dist: r ? Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy) : 0 };
    }).sort((a, b) => a.dist - b.dist || b.d.seen - a.d.seen)[0].d;
  };
  const chosen = dets.find((d) => d.key === sel) || best(dets);

  const shutter = async () => {
    if (busy || paused) return;
    if (chosen) {
      if (!chosen.ok) return flash('Looks misread (bad check digit). Hold steady and try again.');
      clear();
      return accept(chosen);
    }
    // Nothing detected live: take a sharp still photo and decode that instead
    if (!ready || !cam.current) return flash('Camera is still starting…');
    setBusy(true);
    try {
      const photo = await cam.current.takePictureAsync({ quality: 1, skipProcessing: true, shutterSound: false });
      const res = (await Camera.scanFromURLAsync(photo.uri, TYPES)) || [];
      if (!res.length) {
        flash('No barcode found. Move closer and hold steady.');
      } else {
        const now = Date.now();
        res.forEach((r) => store.current.set(r.data, { key: r.data, data: r.data, type: r.type, bounds: null,
          ok: validCode(r.type, r.data), seen: now, ttl: PHOTO_TTL, count: 2 }));
        setDets([...store.current.values()]);
        flash('Check the number, then tap the shutter to confirm.');
      }
    } catch (e) {
      flash('Could not take the photo. Try again.');
    }
    setBusy(false);
  };

  if (!perm) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  if (!perm.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 30, backgroundColor: C.bg }}>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Camera access needed</Text>
        <Text style={{ color: C.sub, marginBottom: 18 }}>BarScan uses the camera only to read barcodes.</Text>
        <Btn title="Allow camera" onPress={askPerm} />
      </View>
    );
  }

  const withRect = dets.map((d) => ({ d, r: rectOf(d.bounds, size) }));
  const floating = withRect.filter((x) => !x.r).map((x) => x.d);   // no usable position: list under the frame
  const chip = { backgroundColor: 'rgba(15,17,21,0.85)', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' };
  const nextZoom = () => setZoom(zoom === 0 ? 0.25 : zoom === 0.25 ? 0.5 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} zoom={zoom}
        onCameraReady={() => setReady(true)}
        barcodeScannerSettings={{ barcodeTypes: TYPES }} onBarcodeScanned={paused ? undefined : onScan} />
      <View pointerEvents="none" style={{ position: 'absolute', top: '20%', left: '8%', right: '8%', height: '38%',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 14 }} />

      {withRect.filter((x) => x.r).map(({ d, r }) => {
        const on = chosen?.key === d.key, col = colorOf(d);
        const below = r.y + r.h + 34 < size.h;
        return (
          <React.Fragment key={d.key}>
            <View pointerEvents="none" style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h,
              borderWidth: on ? 3 : 2, borderColor: col, borderRadius: 4 }} />
            <TouchableOpacity onPress={() => setSel(d.key)} style={{ position: 'absolute',
              left: Math.max(2, Math.min(r.x, size.w - 170)), top: below ? r.y + r.h + 4 : Math.max(2, r.y - 32),
              backgroundColor: col, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
              borderWidth: on ? 2 : 0, borderColor: '#fff' }}>
              <Text style={{ color: '#000', fontWeight: '800', fontSize: 16 }}>{d.data}{d.ok ? '' : ' ✗'}</Text>
            </TouchableOpacity>
          </React.Fragment>
        );
      })}

      {!!floating.length && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: '60%', alignItems: 'center', gap: 6 }}>
          {floating.map((d) => (
            <TouchableOpacity key={d.key} onPress={() => setSel(d.key)} style={{ backgroundColor: colorOf(d),
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              borderWidth: chosen?.key === d.key ? 2 : 0, borderColor: '#fff' }}>
              <Text style={{ color: '#000', fontWeight: '800', fontSize: 18 }}>{d.data}{d.ok ? '' : ' ✗'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={() => setSettings({ ...settings, scanMode: confirmMode ? 'auto' : 'confirm' })}
          style={{ backgroundColor: 'rgba(15,17,21,0.85)', paddingHorizontal: 12, height: 40, borderRadius: 20, justifyContent: 'center' }}>
          <Text style={{ color: C.text, fontWeight: '700' }}>{confirmMode ? '● Tap to confirm' : '⚡ Auto'}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={nextZoom} style={chip}>
            <Text style={{ color: C.text, fontWeight: '700' }}>{zoom === 0 ? '1×' : zoom === 0.25 ? '2×' : '3×'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTorch(!torch)} style={[chip, torch && { backgroundColor: C.warn }]}>
            <Text style={{ fontSize: 18 }}>🔦</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!!toast && (
        <View style={{ position: 'absolute', top: 58, alignSelf: 'center', backgroundColor: 'rgba(15,17,21,0.92)',
          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, maxWidth: '90%' }}>
          <Text style={{ color: C.text, textAlign: 'center' }}>{toast}</Text>
        </View>
      )}
      {confirmMode && !toast && (
        <Text style={{ position: 'absolute', top: 58, alignSelf: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)',
          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontSize: 12 }}>
          {dets.length ? 'Check the number, then tap the shutter' : 'Aim at a barcode'}
        </Text>
      )}

      {confirmMode && (
        <TouchableOpacity onPress={shutter} activeOpacity={0.7} style={{ position: 'absolute', bottom: 12, alignSelf: 'center',
          width: 66, height: 66, borderRadius: 33, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: busy ? C.warn : chosen?.ok ? C.good : '#fff' }} />
        </TouchableOpacity>
      )}
    </View>
  );
}
