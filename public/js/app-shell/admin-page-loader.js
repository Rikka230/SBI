/**
 * SBI 8.0F.2 - App shell page loader
 *
 * Charge les pages internes explicitement migrées dans le shell sans reload complet.
 * 8.0F.1 : attend les CSS des pages avant d'injecter le contenu PJAX.
 * 8.0F.2 : injecte aussi les blocs <style> du document cible.
 */

const loadedStyleHrefs = new Set(
  Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
    .map((link) => new URL(link.getAttribute('href'), window.location.href).href)
);

const loadedInlineStyleKeys = new Set(
  Array.from(document.querySelectorAll('style[data-sbi-pjax-inline-style]'))
    .map((style) => style.getAttribute('data-sbi-pjax-inline-style'))
    .filter(Boolean)
);

const styleLoadPromises = new Map();

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
  'sbi-course-editor-page',
  'sbi-course-viewer-page',
  'sbi-viewer-preview-shell',
  'sbi-dashboard-page',
  'sbi-dashboard-redesign',
  'no-right-panel'
]);

function makeInlineStyleKey(cssText, baseUrl) {
  const source = `${baseUrl || window.location.pathname}::${cssText || ''}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }

  return `style-${Math.abs(hash)}`;
}

function ensureInlineDocumentStyles(doc, baseUrl = window.location.href) {
  const styles = Array.from(doc.querySelectorAll('head style, style[data-sbi-pjax-keep="true"]'));

  styles.forEach((style) => {
    const cssText = style.textContent || '';
    if (!cssText.trim()) return;

    const key = makeInlineStyleKey(cssText, baseUrl);
    if (loadedInlineStyleKeys.has(key)) return;

    const nextStyle = document.createElement('style');
    nextStyle.textContent = cssText;
    nextStyle.setAttribute('data-sbi-pjax-inline-style', key);
    nextStyle.setAttribute('data-sbi-pjax-source', new URL(baseUrl, window.location.href).pathname);
    document.head.appendChild(nextStyle);
    loadedInlineStyleKeys.add(key);
  });
}

function waitForStylesheet(link, href, timeoutMs = 2500) {
  if (!link || link.sheet) {
    loadedStyleHrefs.add(href);
    return Promise.resolve();
  }

  if (styleLoadPromises.has(href)) {
    return styleLoadPromises.get(href);
  }

  const promise = new Promise((resolve) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timeoutId);
      loadedStyleHrefs.add(href);
      resolve();
    };

    const timeoutId = window.setTimeout(finish, timeoutMs);

    link.addEventListener('load', finish, { once: true });
    link.addEventListener('error', finish, { once: true });
  });

  styleLoadPromises.set(href, promise);
  return promise;
}

function findExistingStyleLink(href) {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
    .find((link) => new URL(link.getAttribute('href'), window.location.href).href === href) || null;
}

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

export async function ensureDocumentStyles(doc, baseUrl = window.location.href) {
  ensureInlineDocumentStyles(doc, baseUrl);

  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'));
  const waits = [];

  links.forEach((link) => {
    const href = new URL(link.getAttribute('href'), baseUrl).href;
    const existing = findExistingStyleLink(href);

    if (existing) {
      waits.push(waitForStylesheet(existing, href));
      return;
    }

    const nextLink = document.createElement('link');
    nextLink.rel = 'stylesheet';
    nextLink.href = href;
    nextLink.setAttribute('data-sbi-pjax-style', 'true');

    waits.push(waitForStylesheet(nextLink, href));
    document.head.appendChild(nextLink);
  });

  await Promise.allSettled(waits);
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

export function updateAdminChromeFromDocument(doc, fallbackTitle = 'SBI') {
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

function resolveComparableHref(rawHref) {
  if (!rawHref) return '';
  try {
    const url = new URL(rawHref, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return String(rawHref || '');
  }
}

export function setLeftNavActive(activeTarget) {
  const items = document.querySelectorAll('#left-panel .nav-item, #left-panel .admin-return-link');
  const target = String(activeTarget || '').trim();
  const targetComparable = resolveComparableHref(target);

  items.forEach((item) => {
    const itemHref = item.getAttribute('data-sbi-href') || item.getAttribute('data-href') || item.getAttribute('href') || '';
    const isActive = Boolean(target) && (
      item.id === target ||
      itemHref === target ||
      resolveComparableHref(itemHref) === targetComparable ||
      resolveComparableHref(itemHref).startsWith(targetComparable + '?')
    );

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
