/**
 * SBI 7.2A - Navigation progressive légère
 *
 * Ce module ne remplace pas le routeur et ne fait pas de PJAX complet.
 * Il ajoute une transition visuelle sûre sur les navigations internes standards,
 * sans toucher à l'auth, aux notifications, à la progression ou aux viewers.
 */

const NAV_DELAY_MS = 110;
const READY_CLASS = 'sbi-page-transitions-ready';
const LEAVING_CLASS = 'sbi-navigating-out';

let initialized = false;
let navigating = false;

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

function normalizeHref(rawHref) {
  if (!rawHref || typeof rawHref !== 'string') return null;
  const href = rawHref.trim();
  if (!href || href === '#') return null;
  if (/^(javascript:|mailto:|tel:)/i.test(href)) return null;

  try {
    return new URL(href, window.location.href);
  } catch (error) {
    return null;
  }
}

function isSameDocumentHashNavigation(url) {
  const current = new URL(window.location.href);
  return url.origin === current.origin
    && url.pathname === current.pathname
    && url.search === current.search
    && url.hash
    && url.hash !== current.hash;
}

function isEligibleInternalUrl(url) {
  if (!url || url.origin !== window.location.origin) return false;
  if (url.href === window.location.href) return false;
  if (isSameDocumentHashNavigation(url)) return false;
  return true;
}

function getNavigationIntent(event) {
  const trigger = event.target?.closest?.('a[href], [data-sbi-href]');
  if (!trigger) return null;
  if (trigger.closest('[data-sbi-no-transition="true"]')) return null;
  if (trigger.matches('a[download]')) return null;
  if (trigger.matches('a[target]') && trigger.getAttribute('target') !== '_self') return null;

  const rawHref = trigger.getAttribute('data-sbi-href') || trigger.getAttribute('href');
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

  const trigger = event.target?.closest?.('[data-sbi-href]');
  if (!trigger || trigger.closest('[data-sbi-no-transition="true"]')) return;

  const url = normalizeHref(trigger.getAttribute('data-sbi-href'));
  if (!isEligibleInternalUrl(url)) return;

  event.preventDefault();
  navigateWithTransition(url);
}

function markPageReady() {
  window.requestAnimationFrame(() => {
    document.documentElement.classList.add(READY_CLASS);
    document.body.classList.remove(LEAVING_CLASS);
    document.body.removeAttribute('aria-busy');
  });
}

export function initSbiNavigationTransitions() {
  if (initialized) return;
  initialized = true;

  injectNavigationStyles();
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleKeyboardNavigation);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markPageReady, { once: true });
  } else {
    markPageReady();
  }

  window.addEventListener('pageshow', () => {
    navigating = false;
    document.body.classList.remove(LEAVING_CLASS);
    document.body.removeAttribute('aria-busy');
  });
}
