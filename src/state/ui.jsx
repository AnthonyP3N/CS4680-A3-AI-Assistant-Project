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

const NEW_ENTRY_FLAG = 'focusflow:journal-new-entry';

/** Open the journal's New entry view, from anywhere (e.g. the command palette). */
export function openNewEntry() {
  try { sessionStorage.setItem(NEW_ENTRY_FLAG, '1'); } catch { /* the event below still works */ }
  if (window.location.hash !== '#journal') window.location.hash = 'journal';
  window.dispatchEvent(new Event('focusflow:new-entry'));
}

/** True if a New entry request is waiting, without clearing it. */
export function hasNewEntryRequest() {
  try { return sessionStorage.getItem(NEW_ENTRY_FLAG) === '1'; } catch { return false; }
}

/** True once if a New entry request is waiting (read by the journal page). */
export function takeNewEntryRequest() {
  try {
    const v = sessionStorage.getItem(NEW_ENTRY_FLAG);
    sessionStorage.removeItem(NEW_ENTRY_FLAG);
    return v === '1';
  } catch {
    return false;
  }
}
