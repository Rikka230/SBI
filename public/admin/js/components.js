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
 * 8.0P.167.3 : background admin global léger attaché au contenu scrollable.
 */

(function bootstrapSbiComponents(){
  let accountsModulePromise = null;
  let adminIndexModulesPromise = null;
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

  const injectAdminBackgroundScrollFix = () => {
    const href = '/admin/css/sbi-admin-background-scroll.css?v=8.0P.167.3';
    const absoluteHref = new URL(href, window.location.origin).href;

    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .some((link) => new URL(link.getAttribute('href'), window.location.origin).href === absoluteHref);

    if (exists) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  };

  injectAdminBackgroundScrollFix();


  import('/admin/js/admin-profile-panel-fast.js?v=8.0P.166.4')
    .catch((error) => {
      if (window.localStorage?.getItem('sbiDebugAccess') === 'true') {
        console.warn('[SBI Profile Panel] Chargement rapide indisponible :', error);
      }
    });

  const shouldMountAccountsModule = () => Boolean(document.getElementById('view-users'))
    || window.location.pathname.endsWith('/admin/')
    || window.location.pathname.endsWith('/admin/index.html');

  const shouldBootAdminIndexModules = () => Boolean(document.getElementById('main-content'))
    && Boolean(document.getElementById('view-dashboard') || document.getElementById('view-users'))
    && !window.location.pathname.includes('admin-profile.html');

  const bootAdminIndexModules = () => {
    if (!shouldBootAdminIndexModules()) return Promise.resolve(false);

    if (!adminIndexModulesPromise) {
      adminIndexModulesPromise = Promise.allSettled([
        import('/admin/js/admin-core.js?v=8.0P.167.0'),
        import('/admin/js/admin-dashboard.js?v=8.0P.167.0')
      ]).then((results) => {
        const failed = results.filter((result) => result.status === 'rejected');

        if (failed.length) {
          console.warn('[SBI Admin] Boot index partiel :', failed.map((item) => item.reason));
          adminIndexModulesPromise = null;
          return false;
        }

        window.SBI_ADMIN_CORE_REINIT?.();
        window.SBI_ADMIN_DASHBOARD_REINIT?.();
        window.dispatchEvent(new CustomEvent('sbi:admin-index-modules-booted'));
        return true;
      });
    }

    return adminIndexModulesPromise;
  };

  const loadAccountsModule = () => {
    if (!shouldMountAccountsModule()) return Promise.resolve(false);

    bootAdminIndexModules();

    if (!accountsModulePromise) {
      accountsModulePromise = import('/admin/js/admin-accounts-dashboard.js?v=8.0P.166.4')
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
      bootAdminIndexModules();
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
    window.addEventListener('pageshow', scheduleAccountsMount);
    window.addEventListener('focus', scheduleAccountsMount);
    window.addEventListener('sbi:components-ready', scheduleAccountsMount);
    window.addEventListener('sbi:app-shell-rendered', scheduleAccountsMount);
    window.addEventListener('sbi:accounts-rendered', scheduleAccountsMount);
    window.addEventListener('sbi:admin-index-dom-present', scheduleAccountsMount);
    window.addEventListener('sbi:admin-tab-changed', scheduleAccountsMount);
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

      await bootAdminIndexModules();
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
