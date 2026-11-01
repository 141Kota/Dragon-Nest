// セーブ（localStorage）。どこで失敗してもゲームは止めない
import { defaultState, sanitizeState } from './logic.js';

export const SAVE_KEY = 'dragonNest.save.v1';

function getStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}

export function loadState(storage, now = Date.now()) {
  const st = getStorage(storage);
  try {
    const raw = st && st.getItem(SAVE_KEY);
    if (!raw) return defaultState(now);
    return sanitizeState(JSON.parse(raw), now);
  } catch (e) {
    return defaultState(now);
  }
}

export function saveState(state, storage) {
  const st = getStorage(storage);
  try {
    if (!st) return false;
    st.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}
