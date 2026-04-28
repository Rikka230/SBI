/**
 * SBI 8.0A - Hover preload léger
 *
 * Pour l'instant, on ne précharge que les routes app-shell connues.
 */

const warmedRoutes = new Set();

export function initRoutePreload({ router }) {
  if (!router || typeof router.canHandle !== 'function') return;

  document.addEventListener('pointerenter', (event) => {
    const trigger = event.target?.closest?.('a[href], [data-sbi-href], [data-href]');
    if (!trigger) return;

    const rawHref = trigger.getAttribute('data-sbi-href') || trigger.getAttribute('data-href') || trigger.getAttribute('href');
    if (!rawHref) return;

    let url;
    try { url = new URL(rawHref, window.location.href); }
    catch { return; }

    const key = url.pathname + url.search;
    if (warmedRoutes.has(key) || !router.canHandle(url)) return;
    warmedRoutes.add(key);

    window.dispatchEvent(new CustomEvent('sbi:app-shell-preload', {
      detail: { href: url.href }
    }));
  }, true);
}
