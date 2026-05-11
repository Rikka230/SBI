/**
 * SBI 8.0A - Listener bag
 *
 * Petit coffre à câbles pour stocker les unsubscribe Firestore / Storage.
 * Il évite les doublons lorsque le futur PJAX changera de vue sans reload.
 */

import { registerCleanup } from './view-lifecycle.js';

const bags = new Map();

export function createListenerBag(name = 'default') {
  disposeListenerBag(name);

  const listeners = new Set();
  bags.set(name, listeners);

  const add = (unsubscribe, label = 'listener') => {
    if (typeof unsubscribe !== 'function') return () => {};
    const entry = { unsubscribe, label };
    listeners.add(entry);
    return () => {
      if (!listeners.has(entry)) return;
      listeners.delete(entry);
      try { unsubscribe(); } catch (error) { console.warn('[SBI AppShell] Unsubscribe ignoré:', label, error); }
    };
  };

  registerCleanup(() => disposeListenerBag(name), `listener-bag:${name}`);

  return { add, dispose: () => disposeListenerBag(name) };
}

export function disposeListenerBag(name = 'default') {
  const listeners = bags.get(name);
  if (!listeners) return;
  bags.delete(name);

  listeners.forEach(({ unsubscribe, label }) => {
    try { unsubscribe(); } catch (error) { console.warn('[SBI AppShell] Unsubscribe ignoré:', label, error); }
  });

  listeners.clear();
}

export function disposeAllListenerBags() {
  Array.from(bags.keys()).forEach((name) => disposeListenerBag(name));
}
