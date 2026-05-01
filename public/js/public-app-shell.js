/**
 * SBI 8.0P.5 - Public pages foundation
 *
 * Shell public prudent :
 * - navigation fluide des ancres de l'index ;
 * - liaison PJAX entre index public, login et pages publiques ;
 * - liens inconnus / pages non migrées laissés en navigation classique ;
 * - espaces admin/student/teacher et viewers toujours protégés en reload.
 */

const PUBLIC_SHELL_VERSION = '8.0P.5';
const DISABLED_FLAG = 'sbiPublicShellDisabled';
const READY_CLASS = 'sbi-public-shell-ready';
const SCROLLING_CLASS = 'sbi-public-shell-scrolling';
const LOADING_CLASS = 'sbi-public-shell-loading';
const ACTIVE_CLASS = 'is-active';

const PUBLIC_PAGE_DEFINITIONS = new Map([
  ['/', { page: 'home', route: 'public-home-top', fetchPath: '/index.html', reason: 'index public migré en shell' }],
  ['/index.html', { page: 'home', route: 'public-home-top', fetchPath: '/index.html', reason: 'index public migré en shell' }],
  ['/login.html', { page: 'login', route: 'public-login', fetchPath: '/login.html', reason: 'connexion migrée dans le shell public' }],
  ['/formations.html', { page: 'formations', route: 'public-formations', fetchPath: '/formations.html', reason: 'page formations publique migrée' }],
  ['/parcours.html', { page: 'parcours', route: 'public-parcours', fetchPath: '/parcours.html', reason: 'page parcours publique migrée' }],
  ['/a-propos.html', { page: 'apropos', route: 'public-apropos', fetchPath: '/a-propos.html', reason: 'page à propos publique migrée' }],
  ['/ressources.html', { page: 'ressources', route: 'public-ressources', fetchPath: '/ressources.html', reason: 'page ressources publique migrée' }],
  ['/contact.html', { page: 'contact', route: 'public-contact', fetchPath: '/contact.html', reason: 'page contact publique migrée' }]
]);

const PUBLIC_INDEX_PATHS = new Set(['/', '/index.html']);
const PUBLIC_LOGIN_PATHS = new Set(['/login.html']);

const PROTECTED_PATH_PREFIXES = [
  ['/admin/', 'espace admin protégé par son shell interne'],
  ['/student/', 'espace étudiant protégé par son shell interne'],
  ['/teacher/', 'espace professeur protégé par son shell interne'],
  ['/assets/', 'asset statique'],
  ['/uploads/', 'asset upload'],
  ['/api/', 'endpoint API'],
  ['/__/auth/', 'callback Firebase Auth']
];

const PROTECTED_PATHS = new Map([
  ['/change-email.html', 'flux sécurité email'],
  ['/password-reset.html', 'flux sécurité mot de passe'],
  ['/student/cours-viewer.html', 'viewer étudiant / progression / quiz / vidéo'],
  ['/teacher/cours-viewer.html', 'viewer prof / preview protégé'],
  ['/admin/cours-viewer.html', 'viewer admin / preview protégé'],
  ['/admin/formations-live.html', 'live / médias / logique non migrée']
]);

let initialized = false;
let apiInstance = null;
let activeObserver = null;
let activeClickCleanup = null;
let activeKeyboardCleanup = null;
let activePopCleanup = null;
let activeScrollTimer = null;
let activeSectionIds = [];
let pageTransitionPromise = null;

function safeReadFlag(name) {
  try { return localStorage.getItem(name) === 'true'; }
  catch { return false; }
}

function safeSetFlag(name, value) {
  try {
    if (value) localStorage.setItem(name, 'true');
    else localStorage.removeItem(name);
  } catch {}
}

function normalizePath(pathname = '/') {
  const clean = String(pathname || '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '') || '/';

  if (clean === '/index') return '/index.html';
  if (clean === '/login') return '/login.html';
  return clean;
}

function isPublicIndexPath(pathname = window.location.pathname) {
  return PUBLIC_INDEX_PATHS.has(normalizePath(pathname));
}

function isPublicLoginPath(pathname = window.location.pathname) {
  return PUBLIC_LOGIN_PATHS.has(normalizePath(pathname));
}

function getPublicRouteDefinition(pathname = window.location.pathname) {
  return PUBLIC_PAGE_DEFINITIONS.get(normalizePath(pathname).toLowerCase()) || null;
}

function getPublicPageId(pathname = window.location.pathname) {
  return getPublicRouteDefinition(pathname)?.page || 'external';
}

function isPublicShellBootPath(pathname = window.location.pathname) {
  return Boolean(getPublicRouteDefinition(pathname));
}

function isDownloadPath(pathname = '') {
  return /\.(pdf|zip|rar|7z|mp4|webm|mov|jpg|jpeg|png|webp|gif|svg|json|csv|xlsx?)$/i.test(pathname);
}

function sameOrigin(url) {
  return Boolean(url && url.origin === window.location.origin);
}

function normalizeHref(rawHref) {
  if (!rawHref || typeof rawHref !== 'string') return null;

  const href = rawHref.trim();
  if (!href || /^(javascript:|mailto:|tel:)/i.test(href)) return null;

  try { return new URL(href, window.location.href); }
  catch { return null; }
}

function getRawHref(trigger) {
  return trigger?.getAttribute('data-sbi-href')
    || trigger?.getAttribute('data-href')
    || trigger?.getAttribute('href')
    || null;
}

function getHeaderOffset() {
  const header = document.querySelector('.site-header');
  const headerHeight = header?.getBoundingClientRect?.().height || 80;
  return Math.max(0, Math.round(headerHeight + 18));
}

function decodeHash(hash = '') {
  const clean = String(hash || '').replace(/^#/, '');
  if (!clean) return '';

  try { return decodeURIComponent(clean); }
  catch { return clean; }
}

function getAnchorTarget(hash = '') {
  const id = decodeHash(hash);
  if (!id) return null;

  if (window.CSS?.escape) {
    return document.getElementById(id)
      || document.querySelector(`[data-sbi-public-section~="${CSS.escape(id)}"]`);
  }

  return document.getElementById(id);
}

function getProtectedReason(url) {
  if (!sameOrigin(url)) return 'navigation externe';

  const path = normalizePath(url.pathname).toLowerCase();
  if (PROTECTED_PATHS.has(path)) return PROTECTED_PATHS.get(path);

  const prefixMatch = PROTECTED_PATH_PREFIXES.find(([prefix]) => path.startsWith(prefix));
  if (prefixMatch) return prefixMatch[1];

  if (isDownloadPath(path)) return 'fichier ou média';

  return null;
}

function classifyPublicRoute(rawUrl) {
  const url = rawUrl instanceof URL ? rawUrl : normalizeHref(rawUrl);

  if (!url) {
    return { mode: 'ignore', page: null, route: null, reason: 'URL ignorée', href: '' };
  }

  const protectedReason = getProtectedReason(url);
  if (protectedReason) {
    return { mode: 'reload', page: null, route: null, reason: protectedReason, href: url.href };
  }

  const path = normalizePath(url.pathname).toLowerCase();
  const definition = PUBLIC_PAGE_DEFINITIONS.get(path);

  if (!definition) {
    return {
      mode: 'reload',
      page: null,
      route: null,
      reason: 'page publique non migrée, fallback reload',
      href: url.href
    };
  }

  if (definition.page === 'home') {
    if (!url.hash) {
      return {
        mode: 'public-shell',
        page: 'home',
        route: definition.route,
        reason: definition.reason,
        href: url.href,
        targetId: ''
      };
    }

    const currentPageId = getPublicPageId(window.location.pathname);
    const target = currentPageId === 'home' ? getAnchorTarget(url.hash) : null;
    const targetId = decodeHash(url.hash);

    if (currentPageId === 'home' && !target) {
      return {
        mode: 'ignore',
        page: 'home',
        route: null,
        reason: 'ancre absente, navigation neutralisée',
        href: url.href,
        targetId
      };
    }

    return {
      mode: 'public-shell',
      page: 'home',
      route: 'public-home-anchor',
      reason: currentPageId === 'home' ? 'ancre publique migrée' : 'index public migré avec ancre différée',
      href: url.href,
      targetId
    };
  }

  return {
    mode: 'public-shell',
    page: definition.page,
    route: definition.route,
    reason: definition.reason,
    href: url.href,
    targetId: decodeHash(url.hash)
  };
}

function shouldIgnoreActivation(event) {
  return event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey;
}

function isTriggerOptedOut(trigger) {
  return Boolean(
    trigger?.closest?.('[data-sbi-no-public-shell="true"]')
    || trigger?.closest?.('[data-sbi-no-transition="true"]')
    || trigger?.matches?.('a[download]')
    || (trigger?.matches?.('a[target]') && trigger.getAttribute('target') !== '_self')
  );
}

function getNavigationIntentFromTrigger(trigger) {
  if (!trigger || isTriggerOptedOut(trigger)) return null;

  const rawHref = getRawHref(trigger);
  if (rawHref === '#') {
    return { trigger, url: null, placeholder: true, decision: { mode: 'ignore', reason: 'lien placeholder neutralisé' } };
  }

  const url = normalizeHref(rawHref);
  if (!url) return null;

  const decision = classifyPublicRoute(url);
  return { trigger, url, placeholder: false, decision };
}

function markScrolling() {
  document.body.classList.add(SCROLLING_CLASS);
  document.body.setAttribute('aria-busy', 'true');

  if (activeScrollTimer) window.clearTimeout(activeScrollTimer);
  activeScrollTimer = window.setTimeout(() => {
    document.body.classList.remove(SCROLLING_CLASS);
    document.body.removeAttribute('aria-busy');
    activeScrollTimer = null;
  }, 360);
}

function scrollToTarget(target, behavior = 'smooth') {
  if (!target) {
    markScrolling();
    window.scrollTo({ top: 0, behavior });
    return;
  }

  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - getHeaderOffset());
  markScrolling();
  window.scrollTo({ top, behavior });

  if (typeof target.focus === 'function') {
    const previousTabIndex = target.getAttribute('tabindex');
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    if (previousTabIndex === null) target.removeAttribute('tabindex');
  }
}

function updateHistoryForUrl(url, mode = 'push') {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (current === next) return;

  const state = { sbiPublicShell: true, href: url.href };
  if (mode === 'replace') window.history.replaceState(state, '', next);
  else window.history.pushState(state, '', next);
}

function setActiveLinks(targetId = '', pageId = getPublicPageId(window.location.pathname)) {
  const normalizedHash = targetId ? `#${targetId}` : '';
  const currentPath = normalizePath(window.location.pathname).toLowerCase();
  const currentDefinition = getPublicRouteDefinition(window.location.pathname);
  const links = document.querySelectorAll('.main-nav a[href], .header-actions a[href], .footer-nav a[href]');

  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const url = normalizeHref(href);
    let isActive = false;

    if (url) {
      const linkPath = normalizePath(url.pathname).toLowerCase();
      const linkDefinition = PUBLIC_PAGE_DEFINITIONS.get(linkPath);

      if (pageId === 'home' && normalizedHash && PUBLIC_INDEX_PATHS.has(linkPath) && url.hash === normalizedHash) {
        isActive = true;
      } else if (linkDefinition && currentDefinition) {
        isActive = linkDefinition.page === currentDefinition.page && linkDefinition.page !== 'home';
      } else if (normalizedHash && href === normalizedHash) {
        isActive = true;
      } else {
        isActive = linkPath === currentPath && linkPath !== '/index.html' && linkPath !== '/';
      }
    }

    link.classList.toggle(ACTIVE_CLASS, isActive);

    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function pageFetchUrl(url) {
  const definition = getPublicRouteDefinition(url.pathname) || PUBLIC_PAGE_DEFINITIONS.get('/index.html');
  const cleanPath = definition?.fetchPath || '/index.html';
  return `${cleanPath}${url.search || ''}`;
}

function syncHeadAssets(nextDocument, pageId) {
  const stylesheetSelector = 'link[rel="stylesheet"], link[rel="preload"][as="style"]';
  nextDocument.querySelectorAll(stylesheetSelector).forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    const absoluteHref = new URL(href, window.location.origin).href;
    const exists = Array.from(document.head.querySelectorAll(stylesheetSelector))
      .some((current) => {
        const currentHref = current.getAttribute('href');
        return currentHref && new URL(currentHref, window.location.origin).href === absoluteHref;
      });

    if (!exists) {
      document.head.appendChild(link.cloneNode(true));
    }
  });

  nextDocument.querySelectorAll('style').forEach((style, index) => {
    const key = `sbi-public-shell-inline-${pageId}-${index}`;
    let targetStyle = document.head.querySelector(`style[data-sbi-public-shell-style="${key}"]`);

    if (!targetStyle) {
      targetStyle = document.createElement('style');
      targetStyle.dataset.sbiPublicShellStyle = key;
      document.head.appendChild(targetStyle);
    }

    targetStyle.textContent = style.textContent || '';
  });
}

function sanitizeBodyFragment(nextDocument) {
  const template = document.createElement('template');
  template.innerHTML = nextDocument.body.innerHTML;
  template.content.querySelectorAll('script').forEach((script) => script.remove());
  return template.content;
}

function preservePublicLogoContainer(nextFragment) {
  const currentLogoContainer = document.querySelector('.site-header .logo-container');
  const nextLogoContainer = nextFragment.querySelector?.('.site-header .logo-container');

  if (!currentLogoContainer || !nextLogoContainer) return false;

  const hasReusableLogo = currentLogoContainer.querySelector('img, picture, svg');
  if (!hasReusableLogo) return false;

  currentLogoContainer.dataset.sbiPublicChromePreserved = 'true';
  nextLogoContainer.replaceWith(currentLogoContainer);
  return true;
}

function preservePublicPersistentNodes(nextFragment) {
  const preserved = [];

  if (preservePublicLogoContainer(nextFragment)) {
    preserved.push('.site-header .logo-container');
  }

  const currentBackground = document.querySelector('[data-sbi-background]');
  const nextBackground = nextFragment.querySelector?.('[data-sbi-background]');

  if (currentBackground && !nextBackground) {
    nextFragment.prepend(currentBackground);
    preserved.push('[data-sbi-background]');
  }

  return preserved;
}

function renderBodyFragment(nextFragment) {
  const preserved = preservePublicPersistentNodes(nextFragment);
  document.body.replaceChildren(nextFragment);

  if (preserved.length) {
    window.dispatchEvent(new CustomEvent('sbi:public-shell:chrome-preserved', {
      detail: { preserved }
    }));
  }
}

function syncBodyAttributes(nextDocument, pageId, enabled) {
  const nextClassName = nextDocument.body?.className || '';
  document.body.className = nextClassName;
  document.body.dataset.sbiPublicPage = pageId;
  document.body.dataset.sbiPublicShell = enabled ? 'enabled' : 'disabled';
}

async function runPageInitializers(pageId) {
  try {
    if (typeof window.SBI_MAIN_INIT === 'function') {
      window.SBI_MAIN_INIT(document);
    }
  } catch (error) {
    console.warn('[SBI Public Shell] Init front public indisponible :', error);
  }

  try {
    const mediaModule = await import('/js/site-index-public.js');
    const initMedia = mediaModule.initSiteIndexMedia || window.SBI_INIT_SITE_INDEX_MEDIA;
    if (typeof initMedia === 'function') await initMedia();
  } catch (error) {
    console.warn('[SBI Public Shell] Médias publics indisponibles après PJAX :', error);
  }

  if (pageId === 'login') {
    try {
      const authModule = await import('/js/auth.js');
      const initAuth = authModule.initSbiAuthPage || window.SBI_INIT_AUTH_PAGE;
      if (typeof initAuth === 'function') await initAuth();
    } catch (error) {
      console.warn('[SBI Public Shell] Auth login indisponible après PJAX :', error);
    }
  }
}

async function renderPublicPage(url, decision, { historyMode = 'push', behavior = 'smooth', source = 'click' } = {}) {
  if (pageTransitionPromise) return pageTransitionPromise;

  pageTransitionPromise = (async () => {
    const enabled = !safeReadFlag(DISABLED_FLAG);
    const targetPageId = decision.page || getPublicPageId(url.pathname);

    document.body.classList.add(LOADING_CLASS);
    document.body.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(pageFetchUrl(url), {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'X-SBI-Public-Shell': PUBLIC_SHELL_VERSION }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const nextDocument = new DOMParser().parseFromString(html, 'text/html');
      if (!nextDocument.body) throw new Error('Document HTML invalide');

      syncHeadAssets(nextDocument, targetPageId);
      document.title = nextDocument.title || document.title;

      const fragment = sanitizeBodyFragment(nextDocument);
      syncBodyAttributes(nextDocument, targetPageId, enabled);
      renderBodyFragment(fragment);
      document.documentElement.classList.add(READY_CLASS);
      document.body.dataset.sbiPublicShell = enabled ? 'enabled' : 'disabled';

      updateHistoryForUrl(url, historyMode);
      window.SBI_PUBLIC_SHELL_CURRENT_URL = url.href;

      activeObserver?.disconnect?.();
      activeObserver = null;
      await runPageInitializers(targetPageId);
      observeActiveSections();

      const target = decision.targetId ? getAnchorTarget(`#${decision.targetId}`) : null;
      scrollToTarget(target, behavior);
      setActiveLinks(decision.targetId || '', targetPageId);

      window.dispatchEvent(new CustomEvent('sbi:public-shell:navigated', {
        detail: { ...decision, source, pjax: true }
      }));

      return true;
    } catch (error) {
      console.warn('[SBI Public Shell] Fallback reload après erreur PJAX :', error);
      window.location.assign(url.href);
      return false;
    } finally {
      document.body.classList.remove(LOADING_CLASS);
      document.body.removeAttribute('aria-busy');
      pageTransitionPromise = null;
    }
  })();

  return pageTransitionPromise;
}

function navigatePublic(url, { historyMode = 'push', behavior = 'smooth', source = 'click' } = {}) {
  const decision = classifyPublicRoute(url);

  if (decision.mode !== 'public-shell') {
    return false;
  }

  const currentPageId = getPublicPageId(window.location.pathname);
  const samePage = currentPageId === decision.page;

  if (samePage) {
    const target = decision.targetId ? getAnchorTarget(`#${decision.targetId}`) : null;
    scrollToTarget(target, behavior);
    updateHistoryForUrl(url, historyMode);
    setActiveLinks(decision.targetId || '', decision.page);

    window.SBI_PUBLIC_SHELL_CURRENT_URL = url.href;
    window.dispatchEvent(new CustomEvent('sbi:public-shell:navigated', {
      detail: { ...decision, source, pjax: false }
    }));

    return true;
  }

  renderPublicPage(url, decision, { historyMode, behavior, source });
  return true;
}

function handleDocumentClick(event) {
  if (shouldIgnoreActivation(event)) return;

  const trigger = event.target?.closest?.('a[href], [data-sbi-href], [data-href]');
  const intent = getNavigationIntentFromTrigger(trigger);
  if (!intent) return;

  if (intent.placeholder) {
    event.preventDefault();
    return;
  }

  if (intent.decision.mode === 'ignore' && intent.decision.reason?.includes('ancre absente')) {
    event.preventDefault();
    return;
  }

  if (intent.decision.mode !== 'public-shell') return;

  event.preventDefault();
  navigatePublic(intent.url, { source: 'click' });
}

function handleKeyboardNavigation(event) {
  if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return;

  const trigger = event.target?.closest?.('[data-sbi-href], [data-href]');
  const intent = getNavigationIntentFromTrigger(trigger);
  if (!intent || intent.placeholder || intent.decision.mode !== 'public-shell') return;

  event.preventDefault();
  navigatePublic(intent.url, { source: 'keyboard' });
}

function handlePopState() {
  if (!isPublicShellBootPath(window.location.pathname)) return;

  const url = new URL(window.location.href);
  const decision = classifyPublicRoute(url);
  if (decision.mode !== 'public-shell') return;

  navigatePublic(url, { historyMode: 'replace', behavior: 'auto', source: 'popstate' });
}

function getKnownSectionIds() {
  return Array.from(document.querySelectorAll('[data-sbi-public-section], .sbi-anchor-sentinel[id], footer[id]'))
    .map((element) => element.id)
    .filter(Boolean)
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

function observeActiveSections() {
  activeObserver?.disconnect?.();
  activeSectionIds = getKnownSectionIds();

  const sections = activeSectionIds
    .map((id) => document.getElementById(id))
    .filter(Boolean)
    .filter((element) => element.offsetParent !== null || element.id === 'contact');

  if (!sections.length || !('IntersectionObserver' in window)) {
    setActiveLinks(decodeHash(window.location.hash));
    return;
  }

  const visible = new Map();

  activeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
    });

    const active = Array.from(visible.entries())
      .sort((a, b) => b[1] - a[1])
      .find(([, ratio]) => ratio > 0);

    if (active?.[0]) setActiveLinks(active[0]);
  }, {
    root: null,
    rootMargin: `-${getHeaderOffset()}px 0px -56% 0px`,
    threshold: [0, 0.18, 0.34, 0.5, 0.66]
  });

  sections.forEach((section) => activeObserver.observe(section));
}

function printStatus() {
  const currentUrl = new URL(window.location.href);
  const status = {
    version: PUBLIC_SHELL_VERSION,
    enabled: !safeReadFlag(DISABLED_FLAG),
    page: getPublicPageId(currentUrl.pathname),
    href: currentUrl.href,
    decision: classifyPublicRoute(currentUrl),
    sections: activeSectionIds,
    disabledFlag: DISABLED_FLAG
  };

  console.table([{
    version: status.version,
    enabled: status.enabled,
    page: status.page,
    mode: status.decision.mode,
    route: status.decision.route || '-',
    reason: status.decision.reason
  }]);

  return status;
}

function printCheck(href = window.location.href) {
  const decision = classifyPublicRoute(new URL(href, window.location.href));
  console.table([{
    href: decision.href,
    page: decision.page || '-',
    mode: decision.mode,
    route: decision.route || '-',
    targetId: decision.targetId || '-',
    reason: decision.reason
  }]);
  return decision;
}

function printRoutes() {
  const routes = [
    { path: '/', mode: 'public-shell', page: 'home', reason: 'haut de l’index public' },
    { path: '/index.html#video', mode: 'public-shell', page: 'home', reason: 'ancre vidéo index conservée' },
    { path: '/formations.html', mode: 'public-shell', page: 'formations', reason: 'page formations publique' },
    { path: '/parcours.html', mode: 'public-shell', page: 'parcours', reason: 'page parcours publique' },
    { path: '/a-propos.html', mode: 'public-shell', page: 'apropos', reason: 'page à propos publique' },
    { path: '/ressources.html', mode: 'public-shell', page: 'ressources', reason: 'page ressources publique' },
    { path: '/contact.html', mode: 'public-shell', page: 'contact', reason: 'page contact publique' },
    { path: '/login.html', mode: 'public-shell', page: 'login', reason: 'connexion migrée dans le shell public' },
    { path: '/admin/index.html', mode: 'reload', page: '-', reason: 'shell admin séparé' },
    { path: '/student/cours-viewer.html?id=test', mode: 'reload', page: '-', reason: 'viewer protégé' },
    { path: '/admin/formations-live.html', mode: 'reload', page: '-', reason: 'live admin protégé, aucune page live publique' }
  ];

  console.table(routes);
  return routes;
}

function printAudit() {
  const routes = printRoutes();
  const rows = routes.map((route) => {
    const decision = classifyPublicRoute(new URL(route.path, window.location.origin));
    const ok = decision.mode === route.mode && (route.page === '-' || decision.page === route.page);

    return {
      path: route.path,
      expected: route.mode,
      page: decision.page || '-',
      mode: decision.mode,
      verdict: ok ? 'OK' : 'ALERTE',
      reason: decision.reason
    };
  });

  const summary = {
    total: rows.length,
    ok: rows.filter((row) => row.verdict === 'OK').length,
    alerts: rows.filter((row) => row.verdict === 'ALERTE').length,
    publicPagesEnabled: ['/formations.html', '/parcours.html', '/a-propos.html', '/ressources.html', '/contact.html']
      .every((path) => classifyPublicRoute(new URL(path, window.location.origin)).mode === 'public-shell'),
    loginPjaxEnabled: classifyPublicRoute(new URL('/login.html', window.location.origin)).mode === 'public-shell',
    livePublicRemoved: classifyPublicRoute(new URL('/live.html', window.location.origin)).mode === 'reload',
    persistentLogoEnabled: Boolean(document.querySelector('.site-header .logo-container')),
    viewerReloadProtected: classifyPublicRoute(new URL('/student/cours-viewer.html?id=test', window.location.origin)).mode === 'reload'
  };

  console.info('[SBI PUBLIC SHELL] Audit routes publiques');
  console.table(rows);
  console.table([summary]);

  return { rows, summary, routes };
}

function installApi() {
  const api = {
    version: PUBLIC_SHELL_VERSION,
    enabled: !safeReadFlag(DISABLED_FLAG),
    disabledFlag: DISABLED_FLAG,
    navigate: (href, options = {}) => navigatePublic(new URL(href, window.location.href), { source: 'api', ...options }),
    routeStatus: (href = window.location.href) => classifyPublicRoute(new URL(href, window.location.href)),
    status: printStatus,
    check: printCheck,
    routes: printRoutes,
    audit: printAudit,
    refreshSections: observeActiveSections
  };

  window.SBI_PUBLIC_SHELL = api;
  window.SBI_PUBLIC_SHELL_STATUS = printStatus;
  window.SBI_PUBLIC_SHELL_CHECK = printCheck;
  window.SBI_PUBLIC_SHELL_ROUTES = printRoutes;
  window.SBI_PUBLIC_SHELL_AUDIT = printAudit;
  window.SBI_DISABLE_PUBLIC_SHELL = () => {
    safeSetFlag(DISABLED_FLAG, true);
    window.location.reload();
  };
  window.SBI_ENABLE_PUBLIC_SHELL = () => {
    safeSetFlag(DISABLED_FLAG, false);
    window.location.reload();
  };

  return api;
}

function attachListeners() {
  if (activeClickCleanup || activeKeyboardCleanup || activePopCleanup) return;

  const onClick = (event) => handleDocumentClick(event);
  const onKeydown = (event) => handleKeyboardNavigation(event);
  const onPop = () => handlePopState();

  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('popstate', onPop);

  activeClickCleanup = () => document.removeEventListener('click', onClick, true);
  activeKeyboardCleanup = () => document.removeEventListener('keydown', onKeydown, true);
  activePopCleanup = () => window.removeEventListener('popstate', onPop);
}

function initSbiPublicAppShell() {
  if (window.__SBI_PUBLIC_SHELL_INIT_DONE__ && window.SBI_PUBLIC_SHELL) return window.SBI_PUBLIC_SHELL;
  if (initialized) return apiInstance;
  initialized = true;
  window.__SBI_PUBLIC_SHELL_INIT_DONE__ = true;

  const enabled = !safeReadFlag(DISABLED_FLAG);
  apiInstance = installApi();

  document.documentElement.classList.add(READY_CLASS);
  document.body.dataset.sbiPublicShell = enabled ? 'enabled' : 'disabled';
  document.body.dataset.sbiPublicPage = document.body.dataset.sbiPublicPage || getPublicPageId(window.location.pathname);
  window.SBI_PUBLIC_SHELL_CURRENT_URL = window.location.href;

  if (!enabled || !isPublicShellBootPath(window.location.pathname)) {
    window.dispatchEvent(new CustomEvent('sbi:public-shell:disabled', {
      detail: { enabled, reason: enabled ? 'hors route publique migrée' : 'kill switch actif' }
    }));
    return apiInstance;
  }

  attachListeners();
  observeActiveSections();

  if (window.location.hash) {
    const initialUrl = new URL(window.location.href);
    const decision = classifyPublicRoute(initialUrl);
    if (decision.mode === 'public-shell') {
      window.requestAnimationFrame(() => navigatePublic(initialUrl, {
        historyMode: 'replace',
        behavior: 'auto',
        source: 'initial-hash'
      }));
    }
  } else {
    setActiveLinks('', getPublicPageId(window.location.pathname));
  }

  window.dispatchEvent(new CustomEvent('sbi:public-shell:ready', {
    detail: { version: PUBLIC_SHELL_VERSION, page: getPublicPageId(window.location.pathname), sections: activeSectionIds }
  }));

  return apiInstance;
}

function destroySbiPublicAppShell() {
  activeObserver?.disconnect?.();
  activeObserver = null;
  activeClickCleanup?.();
  activeKeyboardCleanup?.();
  activePopCleanup?.();
  activeClickCleanup = null;
  activeKeyboardCleanup = null;
  activePopCleanup = null;
  initialized = false;
  window.__SBI_PUBLIC_SHELL_INIT_DONE__ = false;
}

window.initSbiPublicAppShell = initSbiPublicAppShell;
window.destroySbiPublicAppShell = destroySbiPublicAppShell;

function bootSbiPublicShellOnce() {
  try {
    if (!isPublicShellBootPath(window.location.pathname)) return;
    initSbiPublicAppShell();
  } catch (error) {
    console.warn('[SBI Public Shell] Boot classique indisponible, navigation classique conservée :', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootSbiPublicShellOnce, { once: true });
} else {
  bootSbiPublicShellOnce();
}
