// UI-level actions any screen can trigger: open Settings, the command
// palette, or the quick reflection sheet after a session.

import { createContext, useContext } from 'react';

export const UiContext = createContext({
  openSettings: () => {},
  openCommand: () => {},
  openReflection: () => {},
});

export const useUi = () => useContext(UiContext);

/** Ask the Today page to focus its quick-add box (from shortcuts or the palette). */
export function focusQuickAdd(text) {
  window.dispatchEvent(new CustomEvent('focusflow:quick-add', { detail: { text } }));
}
