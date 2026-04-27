/**
 * SBI 6.7E - Component readiness helpers
 *
 * Les panels/topbars sont chargés en Web Components depuis un script legacy.
 * Ces helpers donnent un signal stable aux pages métier sans bloquer l'UI.
 */

const SPACE_CONFIG = {
  admin: {
    tags: ['admin-left-panel', 'admin-right-panel'],
    selectors: ['#left-panel', '#right-panel'],
    topbarIds: []
  },
  student: {
    tags: ['student-left-panel', 'student-top-bar'],
    selectors: ['#left-panel', '.top-bar'],
    topbarIds: ['top-user-name', 'top-user-avatar']
  },
  teacher: {
    tags: ['teacher-left-panel', 'teacher-top-bar'],
    selectors: ['#left-panel', '.top-bar'],
    topbarIds: ['top-user-name', 'top-user-avatar']
  }
};

export function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getSbiSpace(pathname = window.location.pathname) {
  const path = pathname.toLowerCase();
  if (path.startsWith('/admin/')) return 'admin';
  if (path.startsWith('/student/')) return 'student';
  if (path.startsWith('/teacher/')) return 'teacher';
  return 'public';
}

export async function waitDomReady() {
  if (document.readyState !== 'loading') return;
  await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
}

export async function waitForElements(selectorsOrIds = [], timeoutMs = 1600) {
  const selectors = selectorsOrIds
    .filter(Boolean)
    .map((value) => value.startsWith('#') || value.startsWith('.') || value.includes('[') ? value : `#${value}`);

  if (!selectors.length) return true;

  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (selectors.every((selector) => document.querySelector(selector))) return true;
    await sleep(40);
  }

  return selectors.every((selector) => document.querySelector(selector));
}

export async function waitForDefinedTags(tags = [], timeoutMs = 1600) {
  const definitions = tags
    .filter((tag) => tag && !customElements.get(tag))
    .map((tag) => Promise.race([
      customElements.whenDefined(tag).catch(() => null),
      sleep(timeoutMs).then(() => null)
    ]));

  await Promise.all(definitions);
}

export async function waitForExpectedComponents(timeoutMs = 1800) {
  await waitDomReady();

  const space = getSbiSpace();
  const config = SPACE_CONFIG[space];

  if (!config) return true;

  await waitForDefinedTags(config.tags, timeoutMs);
  return waitForElements(config.selectors, timeoutMs);
}

export async function waitForSbiComponents(timeoutMs = 1800) {
  if (window.__SBI_COMPONENTS_READY === true) {
    return waitForExpectedComponents(timeoutMs);
  }

  if (window.SBI_COMPONENTS_READY && typeof window.SBI_COMPONENTS_READY.then === 'function') {
    await Promise.race([
      window.SBI_COMPONENTS_READY.catch(() => null),
      sleep(timeoutMs)
    ]);
  } else {
    await new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, timeoutMs);
      window.addEventListener('sbi:components-ready', () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }

  return waitForExpectedComponents(timeoutMs);
}

export async function waitForSbiTopbar(timeoutMs = 1800) {
  await waitForSbiComponents(timeoutMs);

  const space = getSbiSpace();
  const config = SPACE_CONFIG[space];

  if (!config?.topbarIds?.length) return true;
  return waitForElements(config.topbarIds, timeoutMs);
}

export function dispatchComponentMounted(name, element) {
  window.dispatchEvent(new CustomEvent('sbi:component-mounted', {
    detail: { name, element }
  }));

  if (name.endsWith('-top-bar')) {
    window.dispatchEvent(new CustomEvent('sbi:topbar-ready', {
      detail: { name, element }
    }));
  }
}
