/**
 * SBI 8.0G.1 - Navigation progressive + synchronisation active PJAX
 *
 * Ce module garde les transitions légères des navigations classiques
 * et recalcule l'état actif des panels après chaque navigation PJAX.
 */

const NAV_DELAY_MS = 110;
const READY_CLASS = 'sbi-page-transitions-ready';
const LEAVING_CLASS = 'sbi-navigating-out';

let initialized = false;
let navigating = false;
let syncScheduled = false;

function injectNavigationStyles() {
  if (document.getElementById('sbi-navigation-transition-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-navigation-transition-style';
  style.textContent = `
    html.${READY_CLASS} body:not(.preload) #main-content,
    html.${READY_CLASS} body:not(.preload) .content-wrapper {
      transition: opacity 180ms ease, transform 180ms ease, filter 180ms ease;
    }

    body.${LEAVING_CLASS} {
      cursor: progress;
    }

    body.${LEAVING_CLASS} #main-content,
    body.${LEAVING_CLASS} .content-wrapper {
      opacity: 0.58;
      transform: translateY(4px);
      filter: saturate(0.94);
      pointer-events: none;
    }

    body.${LEAVING_CLASS}::after {
      content: 'Chargement';
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 5000;
      padding: 0.72rem 0.95rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: rgba(15, 23, 42, 0.82);
      color: #fff;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.2);
      backdrop-filter: blur(14px);
    }

    body.sbi-student-surface.${LEAVING_CLASS}::after {
      background: rgba(42, 87, 255, 0.9);
      border-color: rgba(42, 87, 255, 0.18);
    }

    body.sbi-teacher-surface.${LEAVING_CLASS}::after {
      background: rgba(245, 158, 11, 0.92);
      border-color: rgba(245, 158, 11, 0.22);
    }

    #left-panel .nav-item[aria-current="page"],
    #left-panel .admin-return-link[aria-current="page"] {
      cursor: default;
    }

    @media (prefers-reduced-motion: reduce) {
      html.${READY_CLASS} body:not(.preload) #main-content,
      html.${READY_CLASS} body:not(.preload) .content-wrapper {
        transition: none;
      }

      body.${LEAVING_CLASS} #main-content,
      body.${LEAVING_CLASS} .content-wrapper {
        transform: none;
        filter: none;
      }
    }
  `;

  document.head.appendChild(style);
}

function getEffectiveUrl() {
  try {
    return new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
  } catch {
    return new URL(window.location.href);
  }
}

function normalizeHref(rawHref) {
  if (!rawHref || typeof rawHref !== 'string') return null;
  const href = rawHref.trim();
  if (!href || href === '#') return null;
  if (/^(javascript:|mailto:|tel:)/i.test(href)) return null;

  try {
    return new URL(href, window.location.href);
  } catch {
    return null;
  }
}

function getRawHref(trigger) {
  if (!trigger) return null;
  return trigger.getAttribute('data-sbi-href')
    || trigger.getAttribute('data-href')
    || trigger.getAttribute('href');
}

function normalizePath(pathname) {
  if (!pathname) return '/';
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (cleanPath === '/admin') return '/admin/index.html';
  if (cleanPath === '/student') return '/student/dashboard.html';
  if (cleanPath === '/teacher') return '/teacher/dashboard.html';
  return cleanPath;
}

function isAdminIndexPath(pathname = getEffectiveUrl().pathname) {
  const path = normalizePath(pathname).toLowerCase();
  return path === '/admin/index.html' || path === '/admin/';
}

function getActiveAdminTab() {
  const effectiveUrl = getEffectiveUrl();
  const tabFromUrl = effectiveUrl.searchParams.get('tab');
  return tabFromUrl || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';
}

function getAdminExternalMatchId(pathname = getEffectiveUrl().pathname) {
  const path = normalizePath(pathname).toLowerCase();

  if (path.endsWith('/admin/admin-profile.html')) return 'nav-users';
  if (path.endsWith('/admin/formations-cours.html')) return 'nav-formations';
  if (path.endsWith('/admin/formations-live.html')) return 'nav-formations';
  if (path.endsWith('/admin/site-index-settings.html')) return 'nav-site-index';
  if (path.endsWith('/admin/repair-access.html')) return 'nav-users';

  return null;
}

function isSameDocumentHashNavigation(url) {
  const current = getEffectiveUrl();
  return url.origin === current.origin
    && url.pathname === current.pathname
    && url.search === current.search
    && url.hash
    && url.hash !== current.hash;
}

function isEquivalentCurrentUrl(url) {
  if (!url || url.origin !== window.location.origin) return false;

  const current = getEffectiveUrl();
  const currentPath = normalizePath(current.pathname);
  const targetPath = normalizePath(url.pathname);

  if (currentPath !== targetPath) return false;

  const targetTab = url.searchParams?.get('tab');
  if (isAdminIndexPath(currentPath) && targetTab) {
    return getActiveAdminTab() === targetTab;
  }

  return url.search === current.search || !url.search;
}

function isEligibleInternalUrl(url) {
  if (!url || url.origin !== window.location.origin) return false;
  if (isEquivalentCurrentUrl(url)) return false;
  if (isSameDocumentHashNavigation(url)) return false;
  return true;
}

function getNavigationIntent(event) {
  const trigger = event.target?.closest?.('a[href], [data-sbi-href], [data-href]');
  if (!trigger) return null;
  if (trigger.closest('[data-sbi-no-transition="true"]')) return null;
  if (trigger.matches('a[download]')) return null;
  if (trigger.matches('a[target]') && trigger.getAttribute('target') !== '_self') return null;

  const rawHref = getRawHref(trigger);
  const url = normalizeHref(rawHref);
  if (!isEligibleInternalUrl(url)) return null;

  return { trigger, url };
}

function shouldIgnoreClick(event) {
  return event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey;
}

function closeMobilePanels() {
  const app = document.getElementById('app-container');
  app?.classList.remove('left-open');
  app?.classList.remove('right-open');
}

function markNavigationStart(url) {
  navigating = true;
  const current = getEffectiveUrl();
  sessionStorage.setItem('sbi:lastNavigationSource', current.pathname + current.search + current.hash);
  sessionStorage.setItem('sbi:lastNavigationTarget', url.pathname + url.search + url.hash);
  document.body.classList.add(LEAVING_CLASS);
  document.body.setAttribute('aria-busy', 'true');
  closeMobilePanels();
  window.dispatchEvent(new CustomEvent('sbi:navigation-start', {
    detail: { href: url.href }
  }));
}

function navigateWithTransition(url) {
  markNavigationStart(url);

  window.setTimeout(() => {
    window.location.assign(url.href);
  }, NAV_DELAY_MS);
}

function handleDocumentClick(event) {
  if (navigating || shouldIgnoreClick(event)) return;

  const intent = getNavigationIntent(event);
  if (!intent) return;

  event.preventDefault();
  navigateWithTransition(intent.url);
}

function handleKeyboardNavigation(event) {
  if (navigating || event.defaultPrevented) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;

  const trigger = event.target?.closest?.('[data-sbi-href], [data-href]');
  if (!trigger || trigger.closest('[data-sbi-no-transition="true"]')) return;

  const url = normalizeHref(getRawHref(trigger));
  if (!isEligibleInternalUrl(url)) return;

  event.preventDefault();
  navigateWithTransition(url);
}

function setCurrentState(element, isCurrent) {
  element.classList.toggle('active', isCurrent);
  if (isCurrent) {
    element.setAttribute('aria-current', 'page');
  } else {
    element.removeAttribute('aria-current');
  }
}

function navItemMatchesCurrent(item) {
  const effectiveUrl = getEffectiveUrl();
  const currentPath = normalizePath(effectiveUrl.pathname);
  const externalMatchId = getAdminExternalMatchId(currentPath);

  if (externalMatchId) {
    return item.id === externalMatchId;
  }

  const target = item.getAttribute('data-target');
  if (target && isAdminIndexPath(currentPath)) {
    return getActiveAdminTab() === target;
  }

  const rawHref = getRawHref(item);
  const url = normalizeHref(rawHref);
  if (!url || url.origin !== window.location.origin) return false;

  const targetPath = normalizePath(url.pathname);

  if (targetPath !== currentPath) return false;

  const targetTab = url.searchParams.get('tab');
  if (targetTab && isAdminIndexPath(currentPath)) {
    return getActiveAdminTab() === targetTab;
  }

  return true;
}

function syncNavigationStateNow() {
  syncScheduled = false;

  const navItems = document.querySelectorAll(
    '#left-panel .nav-item[data-sbi-href], #left-panel .nav-item[data-href], #left-panel .nav-item[data-target], #left-panel .admin-return-link[data-sbi-href]'
  );

  navItems.forEach((item) => {
    setCurrentState(item, navItemMatchesCurrent(item));
  });

  const title = document.querySelector('#left-panel .nav-item.active .nav-text')?.textContent?.trim();
  if (title) {
    document.body.dataset.sbiActiveSection = title;
  }
}

function scheduleNavigationSync() {
  if (syncScheduled) return;
  syncScheduled = true;
  window.requestAnimationFrame(syncNavigationStateNow);
}

function markPageReady() {
  window.requestAnimationFrame(() => {
    document.documentElement.classList.add(READY_CLASS);
    document.body.classList.remove(LEAVING_CLASS);
    document.body.removeAttribute('aria-busy');
    scheduleNavigationSync();
  });
}

function handleAppShellNavigated() {
  navigating = false;
  document.body.classList.remove(LEAVING_CLASS);
  document.body.removeAttribute('aria-busy');

  window.requestAnimationFrame(() => {
    scheduleNavigationSync();
  });
}

export function initSbiNavigationTransitions() {
  if (initialized) return;
  initialized = true;

  injectNavigationStyles();
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleKeyboardNavigation);
  window.addEventListener('sbi:component-mounted', scheduleNavigationSync);
  window.addEventListener('sbi:navigation-mutated', scheduleNavigationSync);
  window.addEventListener('sbi:admin-tab-changed', scheduleNavigationSync);
  window.addEventListener('sbi:app-shell:navigated', handleAppShellNavigated);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markPageReady, { once: true });
  } else {
    markPageReady();
  }

  window.addEventListener('pageshow', () => {
    navigating = false;
    document.body.classList.remove(LEAVING_CLASS);
    document.body.removeAttribute('aria-busy');
    scheduleNavigationSync();
  });
}
