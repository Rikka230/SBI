/**
 * SBI 8.0A - View lifecycle registry
 *
 * Centralise les nettoyages quand une vue est remplacée sans reload complet.
 * Les prochaines étapes PJAX brancheront ici les listeners Firestore, timers,
 * éditeurs riches et observateurs à démonter proprement.
 */

const cleanupStack = [];
let activeViewKey = null;

export function getActiveViewKey() {
  return activeViewKey;
}

export function setActiveViewKey(viewKey) {
  activeViewKey = viewKey || null;
}

export function registerCleanup(cleanup, label = 'anonymous-cleanup') {
  if (typeof cleanup !== 'function') return () => {};

  const entry = { cleanup, label };
  cleanupStack.push(entry);

  return () => {
    const index = cleanupStack.indexOf(entry);
    if (index >= 0) cleanupStack.splice(index, 1);
  };
}

export async function runViewCleanups(reason = 'navigation') {
  const cleanups = cleanupStack.splice(0, cleanupStack.length).reverse();

  for (const entry of cleanups) {
    try {
      await entry.cleanup({ reason, activeViewKey });
    } catch (error) {
      console.warn('[SBI AppShell] Cleanup ignoré:', entry.label, error);
    }
  }
}

export function createAbortController(label = 'view') {
  const controller = new AbortController();
  registerCleanup(() => controller.abort(), `${label}:abort`);
  return controller;
}
