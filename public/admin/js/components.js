/**
 * =======================================================================
 * WEB COMPONENTS - Bootstrap compatibilité legacy
 * =======================================================================
 *
 * Les pages existantes chargent encore ce fichier avec une balise script
 * classique. On garde ce point d'entrée non-module, puis on charge les
 * vrais composants depuis /admin/js/components/index.js.
 *
 * 6.7E : le signal ready attend DOMContentLoaded + définition des tags +
 * présence réelle des panels/topbars attendus pour la page courante.
 * 8.0P.151 : suppression des bridges conformité, intégration directe dans
 * public-formations-admin.js et sbi-public-pages.js.
 * 8.0P.166.3 : UX note escalade intégrée.
 */

(function bootstrapSbiComponents(){
  let accountsModulePromise = null;
  let accountsWatchStarted = false;

  const releasePreload = () => {
    document.body?.classList?.remove('preload');
    document.body?.classList?.add('sbi-preload-timeout');
  };

  const notifyReady = () => {
    window.__SBI_COMPONENTS_READY = true;
    window.dispatchEvent(new CustomEvent('sbi:components-ready'));
  };

  const scheduleEarlyDisplay = () => {
    const release = () => {
      releasePreload();
      document.documentElement?.classList?.add('sbi-admin-loader-released');
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => window.setTimeout(release, 120), { once: true });
    } else {
      window.setTimeout(release, 120);
    }

    window.setTimeout(release, 700);
  };

  scheduleEarlyDisplay();

  const shouldMountAccountsModule = () => Boolean(document.getElementById('view-users'))
    || window.location.pathname.endsWith('/admin/')
    || window.location.pathname.endsWith('/admin/index.html');

  const loadAccountsModule = () => {
    if (!shouldMountAccountsModule()) return Promise.resolve(false);

    if (!accountsModulePromise) {
      accountsModulePromise = import('/admin/js/admin-accounts-dashboard.js?v=8.0P.166.3')
        .catch((error) => {
          accountsModulePromise = null;
          console.warn('[SBI Accounts] Module comptes non chargé :', error);
          return null;
        });
    }

    return accountsModulePromise.then((module) => {
      module?.mountAdminAccountsDashboard?.();
      return Boolean(module);
    });
  };

  const scheduleAccountsMount = () => {
    window.requestAnimationFrame(() => {
      loadAccountsModule();
    });
  };

  const startAccountsWatcher = () => {
    if (accountsWatchStarted) return;
    accountsWatchStarted = true;

    const observer = new MutationObserver(() => {
      if (document.getElementById('view-users')) scheduleAccountsMount();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('popstate', scheduleAccountsMount);
    window.addEventListener('sbi:components-ready', scheduleAccountsMount);
    window.addEventListener('sbi:app-shell-rendered', scheduleAccountsMount);
    window.addEventListener('sbi:accounts-rendered', scheduleAccountsMount);
  };

  const failSafe = window.setTimeout(() => {
    notifyReady();
    releasePreload();
    startAccountsWatcher();
    scheduleAccountsMount();
  }, 900);

  window.SBI_COMPONENTS_READY = import('/admin/js/components/index.js')
    .then(async (module) => {
      if (module?.waitForExpectedComponents) {
        await module.waitForExpectedComponents(650);
      }

      await loadAccountsModule();

      await new Promise((resolve) => requestAnimationFrame(resolve));
      window.clearTimeout(failSafe);
      notifyReady();
      releasePreload();
      startAccountsWatcher();
      scheduleAccountsMount();
      return true;
    })
    .catch((error) => {
      console.error('[SBI Components] Chargement modulaire impossible :', error);
      window.clearTimeout(failSafe);
      notifyReady();
      releasePreload();
      startAccountsWatcher();
      scheduleAccountsMount();
      return false;
    });
})();
