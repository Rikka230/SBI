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
 * 8.0P.166.4 : chargement rapide panel profil droit.
 * 8.0P.167.24 : surface admin claire homogène sans grille.
 * 8.0P.167.25 : alertes admin légères pour escalades après 3 relances.
 * 8.0P.167.28 : cache-bust admin-core après correction refresh création compte.
 * 8.0P.167.29 : tentative scroll interne liste comptes rejetée visuellement.
 * 8.0P.167.30 : tentative hauteur fixe commune, rejetée car bloc création tronqué.
 * 8.0P.167.31 : hauteur saine sans tronquer le formulaire de création.
 */

(function bootstrapSbiComponents(){
  let accountsModulePromise = null;
  let adminIndexModulesPromise = null;
  let accountEscalationsModulePromise = null;
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

  const injectAdminSingleScrollFix = () => {
    const href = '/admin/css/sbi-admin-single-scroll.css?v=8.0P.167.24';
    const absoluteHref = new URL(href, window.location.origin).href;

    const existingLink = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find((link) => new URL(link.getAttribute('href'), window.location.origin).href === absoluteHref);

    if (existingLink) {
      document.head.appendChild(existingLink);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  };

  injectAdminSingleScrollFix();
  window.setTimeout(injectAdminSingleScrollFix, 250);
  window.setTimeout(injectAdminSingleScrollFix, 900);
  window.addEventListener('sbi:components-ready', injectAdminSingleScrollFix);
  window.addEventListener('sbi:app-shell-rendered', injectAdminSingleScrollFix);


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
        import('/admin/js/admin-core.js?v=8.0P.167.28'),
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

  const loadAccountEscalationsModule = () => {
    if (!shouldBootAdminIndexModules()) return Promise.resolve(false);

    if (!accountEscalationsModulePromise) {
      accountEscalationsModulePromise = import('/admin/js/admin-account-escalations-lite.js?v=8.0P.167.25')
        .catch((error) => {
          accountEscalationsModulePromise = null;
          if (window.localStorage?.getItem('sbiDebugAccess') === 'true') {
            console.warn('[SBI Account Escalations] Module non chargé :', error);
          }
          return null;
        });
    }

    return accountEscalationsModulePromise.then(Boolean);
  };

  const loadAccountsModule = () => {
    if (!shouldMountAccountsModule()) return Promise.resolve(false);

    bootAdminIndexModules();
    loadAccountEscalationsModule();

    if (!accountsModulePromise) {
      accountsModulePromise = import('/admin/js/admin-accounts-dashboard.js?v=8.0P.167.31')
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
      loadAccountEscalationsModule();
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
      await loadAccountEscalationsModule();
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
