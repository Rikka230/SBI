/**
 * SBI 8.0D.1 - Admin page loader
 *
 * Charge une page admin externe dans le shell sans rechargement complet.
 * Ajoute un cache DOM pour restaurer rapidement l'index admin au retour.
 */

const loadedStyleHrefs = new Set(
  Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
    .map((link) => new URL(link.getAttribute('href'), window.location.href).href)
);

const loadedScriptSrcs = new Set(
  Array.from(document.querySelectorAll('script[src]'))
    .map((script) => new URL(script.getAttribute('src'), window.location.href).href)
);

const mainDomCache = new Map();

const ROUTE_BODY_CLASSES = new Set([
  'sbi-profile-page',
  'sbi-admin-surface',
  'sbi-student-surface',
  'sbi-teacher-surface',
  'sbi-dashboard-page',
  'sbi-dashboard-redesign'
]);

export async function fetchAdminDocument(url) {
  const response = await fetch(url.href, {
    credentials: 'same-origin',
    headers: { 'X-SBI-PJAX': '1' }
  });

  if (!response.ok) {
    throw new Error(`Chargement impossible (${response.status}) : ${url.pathname}`);
  }

  const html = await response.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

export function ensureDocumentStyles(doc, baseUrl = window.location.href) {
  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'));

  links.forEach((link) => {
    const href = new URL(link.getAttribute('href'), baseUrl).href;
    if (loadedStyleHrefs.has(href)) return;

    const nextLink = document.createElement('link');
    nextLink.rel = 'stylesheet';
    nextLink.href = href;
    nextLink.setAttribute('data-sbi-pjax-style', 'true');
    document.head.appendChild(nextLink);
    loadedStyleHrefs.add(href);
  });
}

export function applyBodyRouteClassesFromDocument(doc, extraClasses = []) {
  ROUTE_BODY_CLASSES.forEach((className) => document.body.classList.remove(className));

  const incomingClasses = Array.from(doc.body?.classList || []);
  incomingClasses.forEach((className) => {
    if (ROUTE_BODY_CLASSES.has(className)) {
      document.body.classList.add(className);
    }
  });

  extraClasses.filter(Boolean).forEach((className) => document.body.classList.add(className));
}

export function cacheCurrentMain(key, metadata = {}) {
  const currentMain = document.querySelector('#main-content');
  if (!currentMain || !key) return false;
  if (!currentMain.childNodes.length) return false;

  const host = document.createElement('div');
  host.setAttribute('data-sbi-pjax-cache-host', key);
  host.replaceChildren(...Array.from(currentMain.childNodes));

  mainDomCache.set(key, {
    host,
    metadata: {
      title: document.title,
      pageTitleHtml: document.querySelector('.top-bar .page-title')?.innerHTML || '',
      cachedAt: Date.now(),
      ...metadata
    }
  });

  return true;
}

export function hasCachedMain(key) {
  const cached = mainDomCache.get(key);
  return Boolean(cached?.host?.childNodes?.length);
}

export function restoreCachedMain(key) {
  const currentMain = document.querySelector('#main-content');
  const cached = mainDomCache.get(key);

  if (!currentMain || !cached?.host?.childNodes?.length) return null;

  currentMain.replaceChildren(...Array.from(cached.host.childNodes));

  if (cached.metadata?.title) {
    document.title = cached.metadata.title;
  }

  const pageTitle = document.querySelector('.top-bar .page-title');
  if (pageTitle && cached.metadata?.pageTitleHtml) {
    pageTitle.innerHTML = cached.metadata.pageTitleHtml;
  }

  window.dispatchEvent(new CustomEvent('sbi:app-shell:main-restored', {
    detail: { key, metadata: cached.metadata, main: currentMain }
  }));

  return cached.metadata || {};
}

export function replaceMainFromDocument(doc) {
  const currentMain = document.querySelector('#main-content');
  const incomingMain = doc.querySelector('#main-content');

  if (!currentMain || !incomingMain) {
    throw new Error('Structure #main-content introuvable pour route PJAX.');
  }

  currentMain.replaceChildren(...Array.from(incomingMain.childNodes).map((node) => node.cloneNode(true)));

  window.dispatchEvent(new CustomEvent('sbi:app-shell:main-replaced', {
    detail: { main: currentMain }
  }));

  return currentMain;
}

export function replaceRouteNodeFromDocument(doc, selector, mountSelector = '#app-container') {
  const incoming = doc.querySelector(selector);
  const current = document.querySelector(selector);
  current?.remove();

  if (!incoming) return () => {};

  const mount = document.querySelector(mountSelector) || document.body;
  const cloned = incoming.cloneNode(true);
  cloned.setAttribute('data-sbi-pjax-route-node', 'true');
  mount.appendChild(cloned);

  return () => {
    if (cloned.isConnected) cloned.remove();
  };
}

export function updateAdminChromeFromDocument(doc, fallbackTitle = 'SBI Admin') {
  const incomingTitle = doc.querySelector('title')?.textContent?.trim();
  const incomingPageTitle = doc.querySelector('.top-bar .page-title');

  document.title = incomingTitle || fallbackTitle;

  const pageTitle = document.querySelector('.top-bar .page-title');
  if (pageTitle) {
    if (incomingPageTitle) {
      pageTitle.replaceChildren(...Array.from(incomingPageTitle.childNodes).map((node) => node.cloneNode(true)));
    } else {
      pageTitle.textContent = fallbackTitle;
    }
  }
}

export function setLeftNavActive(activeId) {
  const items = document.querySelectorAll('#left-panel .nav-item, #left-panel .admin-return-link');

  items.forEach((item) => {
    const isActive = item.id === activeId;
    item.classList.toggle('active', isActive);

    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  window.dispatchEvent(new CustomEvent('sbi:navigation-mutated'));
}

export function loadScriptOnce(src, { globalName = null, baseUrl = window.location.href } = {}) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);

  const url = new URL(src, baseUrl).href;
  if (loadedScriptSrcs.has(url)) return Promise.resolve(globalName ? window[globalName] : true);

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.setAttribute('data-sbi-pjax-script', 'true');

    script.onload = () => {
      loadedScriptSrcs.add(url);
      resolve(globalName ? window[globalName] : true);
    };

    script.onerror = () => {
      reject(new Error(`Script impossible à charger : ${url}`));
    };

    document.head.appendChild(script);
  });
}
