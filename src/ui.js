import React from 'react';
import { Text, TouchableOpacity, TextInput, View, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { C } from './theme';

export const Btn = ({ title, onPress, kind = 'primary', small, style, disabled }) => (
  <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.75}
    style={[s.btn, small && s.small,
      kind === 'primary' && { backgroundColor: C.accent },
      kind === 'ghost' && { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
      kind === 'danger' && { backgroundColor: '#2a1519', borderWidth: 1, borderColor: C.bad },
      disabled && { opacity: 0.4 }, style]}>
    <Text style={[s.btnT, kind === 'danger' && { color: C.bad }]}>{title}</Text>
  </TouchableOpacity>
);
export const Input = (p) => <TextInput placeholderTextColor={C.sub} {...p} style={[s.input, p.style]} />;
export const Label = ({ children }) => <Text style={s.label}>{children}</Text>;
export const Seg = ({ options, value, onChange }) => (
  <View style={s.seg}>
    {options.map(([v, l]) => (
      <TouchableOpacity key={v} onPress={() => onChange(v)} style={[s.segI, value === v && { backgroundColor: C.accent }]}>
        <Text style={{ color: value === v ? '#fff' : C.sub, fontSize: 13, fontWeight: '600' }}>{l}</Text>
      </TouchableOpacity>
    ))}
  </View>
);
export const Dot = ({ status }) => (
  <View style={{ width: 10, height: 10, borderRadius: 5,
    backgroundColor: status === 'ok' ? C.good : status === 'bad' ? C.bad : C.sub }} />
);
// Dark backdrop for pop-up dialogs that lifts above the keyboard (needed with Android edge-to-edge)
export const Overlay = ({ children }) => (
  <KeyboardAvoidingView behavior="padding" style={s.modalWrap}>{children}</KeyboardAvoidingView>
);
export const s = StyleSheet.create({
  btn: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
  small: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 10 },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },
  input: { backgroundColor: C.bg, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, marginBottom: 10 },
  label: { color: C.sub, fontSize: 11, marginBottom: 5, marginTop: 6, fontWeight: '700', letterSpacing: 0.8 },
  seg: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden', marginBottom: 14, padding: 3, gap: 3 },
  segI: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  h: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 12, letterSpacing: 0.2 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 18 },
  modal: { backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.border, maxHeight: '90%' },
});
