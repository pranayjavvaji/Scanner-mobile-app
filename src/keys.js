// Keys the two buttons beside the shutter can send to the PC.
// To add a new action, add a line here: it shows up in Setup automatically.
// `keys` are pyautogui key names (the receiver only accepts the ones in its ALLOWED_KEYS list).
export const KEY_ACTIONS = [
  { id: 'none', name: 'Hidden', keys: null, icon: '' },
  { id: 'left', name: '← Left arrow', keys: ['left'], icon: '←' },
  { id: 'right', name: '→ Right arrow', keys: ['right'], icon: '→' },
  { id: 'up', name: '↑ Up arrow', keys: ['up'], icon: '↑' },
  { id: 'down', name: '↓ Down arrow', keys: ['down'], icon: '↓' },
  { id: 'tab', name: '⇥ Tab', keys: ['tab'], icon: '⇥' },
  { id: 'shift_tab', name: '⇧⇥ Shift+Tab', keys: ['shift', 'tab'], icon: '⇧⇥' },
  { id: 'enter', name: '↵ Enter', keys: ['enter'], icon: '↵' },
  { id: 'esc', name: 'Esc', keys: ['esc'], icon: 'Esc' },
  { id: 'backspace', name: '⌫ Backspace', keys: ['backspace'], icon: '⌫' },
  { id: 'delete', name: 'Delete', keys: ['delete'], icon: 'Del' },
  { id: 'space', name: '␣ Space', keys: ['space'], icon: '␣' },
  { id: 'home', name: 'Home', keys: ['home'], icon: 'Home' },
  { id: 'end', name: 'End', keys: ['end'], icon: 'End' },
];
export const keyAction = (id) => KEY_ACTIONS.find((a) => a.id === id) || KEY_ACTIONS[0];
