/**
 * SBI 8.0I.1 - Router expérimental
 *
 * Le routeur ne traite que les routes explicitement migrées.
 * Les routes non PJAX sont laissées à la navigation classique.
 */

import { runViewCleanups, setActiveViewKey } from './view-lifecycle.js';
import { startShellTransition, endShellTransition } from './transitions.js';
import { getRouteDecision } from './route-guards.js';

function normalizeHref(rawHref) {
  if (!rawHref || typeof rawHref !== 'string') return null;
  const href = rawHref.trim();
  if (!href || href === '#') return null;
  if (/^(javascript:|mailto:|tel:)/i.test(href)) return null;
  try { return new URL(href, window.location.href); }
  catch { return null; }
}

function getRawHref(trigger) {
  return trigger?.getAttribute('data-sbi-href')
    || trigger?.getAttribute('data-href')
    || trigger?.getAttribute('href')
    || null;
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

export function createRouter({ registry, debug = false } = {}) {
  let navigating = false;

  function routeStatus(url) {
    return getRouteDecision(url, registry);
  }

  function canHandle(url) {
    return routeStatus(url).mode === 'pjax';
  }

  function emitFallback(decision, source = 'unknown') {
    window.dispatchEvent(new CustomEvent('sbi:app-shell:fallback', {
      detail: { ...decision, source }
    }));

    if (debug) {
      console.info('[SBI AppShell] Navigation classique:', decision.reason, decision.href);
    }
  }

  async function navigate(url, { historyMode = 'push', source = 'programmatic' } = {}) {
    const decision = routeStatus(url);

    if (decision.mode !== 'pjax') {
      emitFallback(decision, source);
      return false;
    }

    const route = registry?.find?.(url);
    if (!route || navigating) return false;

    navigating = true;
    startShellTransition();
    closeMobilePanels();

    try {
      await runViewCleanups(`navigate:${source}`);
      const result = await route.mount({ url, source });

      if (historyMode === 'replace') {
        window.history.replaceState({ sbiAppShell: true, route: route.id }, '', url.href);
      } else if (historyMode !== 'none') {
        window.history.pushState({ sbiAppShell: true, route: route.id }, '', url.href);
      }

      setActiveViewKey(result?.viewKey || route.id);
      window.dispatchEvent(new CustomEvent('sbi:app-shell:navigated', {
        detail: { route: route.id, href: url.href, source }
      }));

      if (debug) console.info('[SBI AppShell] Navigation PJAX:', route.id, url.href);
      return true;
    } catch (error) {
      console.warn('[SBI AppShell] Navigation échouée, fallback reload:', error);
      window.location.assign(url.href);
      return true;
    } finally {
      window.setTimeout(() => {
        navigating = false;
        endShellTransition();
      }, 90);
    }
  }

  function handleClick(event) {
    if (shouldIgnoreClick(event) || navigating) return;

    const trigger = event.target?.closest?.('a[href], [data-sbi-href], [data-href]');
    if (!trigger) return;
    if (trigger.closest('[data-sbi-no-pjax="true"], [data-sbi-no-transition="true"]')) return;
    if (trigger.matches('a[download]')) return;
    if (trigger.matches('a[target]') && trigger.getAttribute('target') !== '_self') return;

    const url = normalizeHref(getRawHref(trigger));
    const decision = routeStatus(url);

    /**
     * 8.0I.1 :
     * Si la route n'est pas migrée, le routeur ne touche pas au clic.
     * La navigation classique ou la transition legacy fait le travail.
     */
    if (decision.mode !== 'pjax') {
      if (debug) emitFallback(decision, 'click');
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    navigate(url, { historyMode: 'push', source: 'click' });
  }

  function handleKeydown(event) {
    if (event.defaultPrevented || navigating) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const trigger = event.target?.closest?.('[data-sbi-href], [data-href]');
    if (!trigger || trigger.closest('[data-sbi-no-pjax="true"]')) return;

    const url = normalizeHref(getRawHref(trigger));
    const decision = routeStatus(url);

    if (decision.mode !== 'pjax') {
      if (debug) emitFallback(decision, 'keyboard');
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    navigate(url, { historyMode: 'push', source: 'keyboard' });
  }

  function handlePopState(event) {
    const url = new URL(window.location.href);
    const decision = routeStatus(url);

    if (decision.mode !== 'pjax') {
      emitFallback(decision, 'popstate');
      if (event.state?.sbiAppShell || document.body.dataset.sbiPjax === 'enabled') {
        window.location.assign(url.href);
      }
      return;
    }

    navigate(url, { historyMode: 'none', source: 'popstate' });
  }

  function attach() {
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('popstate', handlePopState);
  }

  return { attach, navigate, canHandle, routeStatus };
}
