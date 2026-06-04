/**
 * =======================================================================
 * WEB COMPONENTS - Bootstrap compatibilité legacy
 * =======================================================================
 *
 * Les pages existantes chargent encore ce fichier avec une balise script
 * classique. On garde ce point d'entrée non-module, puis on charge les
 * vrais composants depuis /admin/js/components/index.js.
 *
 * 6.7E : le signal ready attend DOMContentLoaded + définition des tags + présence réelle des panels/topbars attendus pour la page courante.
 * 8.0P.151 : suppression des bridges conformité, intégration directe dans public-formations-admin.js et sbi-public-pages.js.
 * 8.0P.166.4 : chargement rapide panel profil droit.
 * 8.0P.167.24 : surface admin claire homogène sans grille.
 * 8.0P.167.25 : alertes admin légères pour escalades après 3 relances.
 * 8.0P.167.28 : cache-bust admin-core après correction refresh création compte.
 * 8.0P.167.29 : tentative scroll interne liste comptes rejetée visuellement.
 * 8.0P.167.30 : tentative hauteur fixe commune, rejetée car bloc création tronqué.
 * 8.0P.167.32 : hauteur saine sans tronquer le formulaire de création.
 * 8.0P.167.33 : scroll liste comptes optimisé 60fps CSS-only.
 * 8.0P.167.34 : vue Journal admin globale.
 * 8.0P.167.52 : surface admin canonique réinjectée après les anciens effets dynamiques.
 * 8.0P.167.58 : ajout navigation Promotions / Cohortes.
 * 8.0P.167.59 : icône Promotions distincte et cache-bust ergonomie promotions.
 * 8.0P.167.60 : navigation Profil depuis Comptes stabilisée + rebinding édition après PJAX.
 * 8.0P.167.62 : profil admin PJAX sans fallback reload parasite + verrou UID cible.
 * 8.0P.167.125 : chargement léger des dates issues de promotions.coursePlan sur les pages cours élève/prof.
 */

(function bootstrapSbiComponents(){
  let accountsModulePromise = null;
  let adminIndexModulesPromise = null;
  let accountEscalationsModulePromise = null;
  let accountsWatchStarted = false;
  let studentCoursePlanEnhancementPromise = null;
  let teacherCoursePlanEnhancementPromise = null;

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

  const moveOrCreateStylesheet = (href, markerName = '') => {
    const absoluteHref = new URL(href, window.location.origin).href;
    const markerSelector = markerName ? `link[rel="stylesheet"][data-sbi-style="${markerName}"]` : '';

    const existingByMarker = markerSelector
      ? document.querySelector(markerSelector)
      : null;

    const existingByHref = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find((link) => new URL(link.getAttribute('href'), window.location.origin).href === absoluteHref);

    const existingLink = existingByMarker || existingByHref;

    if (existingLink) {
      existingLink.href = href;
      if (markerName) existingLink.dataset.sbiStyle = markerName;
      document.head.appendChild(existingLink);
      return existingLink;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (markerName) link.dataset.sbiStyle = markerName;
    document.head.appendChild(link);
    return link;
  };

  const injectAdminSingleScrollFix = () => {
    moveOrCreateStylesheet('/admin/css/sbi-admin-single-scroll.css?v=8.0P.167.24', 'admin-single-scroll');
  };

  const injectAdminCanonicalSurface = () => {
    moveOrCreateStylesheet('/admin/css/admin-surface-unified.css?v=8.0P.167.52', 'admin-surface-unified');
  };

  const injectAdminSurfaceStack = () => {
    injectAdminSingleScrollFix();
    injectAdminCanonicalSurface();
  };

  injectAdminSurfaceStack();
  window.setTimeout(injectAdminSurfaceStack, 250);
  window.setTimeout(injectAdminSurfaceStack, 900);
  window.setTimeout(injectAdminSurfaceStack, 1400);
  window.addEventListener('sbi:components-ready', injectAdminSurfaceStack);
  window.addEventListener('sbi:app-shell-rendered', injectAdminSurfaceStack);


  import('/admin/js/admin-profile-panel-fast.js?v=8.0P.166.4')
    .catch((error) => {
      if (window.localStorage?.getItem('sbiDebugAccess') === 'true') {
        console.warn('[SBI Profile Panel] Chargement rapide indisponible :', error);
      }
    });

  const getCurrentPathname = () => {
    try {
      return new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin).pathname;
    } catch {
      return window.location.pathname || '';
    }
  };

  const loadCoursePlanDateEnhancements = () => {
    const path = getCurrentPathname();

    if (path.endsWith('/student/mes-cours.html')) {
      if (!studentCoursePlanEnhancementPromise) {
        studentCoursePlanEnhancementPromise = import('/student/js/student-course-plan-dates.js?v=8.0P.167.125')
          .catch((error) => {
            studentCoursePlanEnhancementPromise = null;
            if (window.localStorage?.getItem('sbiDebugAccess') === 'true') {
              console.warn('[SBI Student CoursePlan] Dates promotion non chargées :', error);
            }
            return null;
          });
      }

      studentCoursePlanEnhancementPromise.then((module) => {
        module?.mountStudentCoursePlanDates?.({ source: 'components' });
      });
    }

    if (path.endsWith('/teacher/mes-cours.html')) {
      if (!teacherCoursePlanEnhancementPromise) {
        teacherCoursePlanEnhancementPromise = import('/teacher/js/teacher-course-plan-dates.js?v=8.0P.167.125')
          .catch((error) => {
            teacherCoursePlanEnhancementPromise = null;
            if (window.localStorage?.getItem('sbiDebugAccess') === 'true') {
              console.warn('[SBI Teacher CoursePlan] Dates promotion non chargées :', error);
            }
            return null;
          });
      }

      teacherCoursePlanEnhancementPromise.then((module) => {
        module?.mountTeacherCoursePlanDates?.({ source: 'components' });
      });
    }
  };

  loadCoursePlanDateEnhancements();
  window.addEventListener('sbi:components-ready', loadCoursePlanDateEnhancements);
  window.addEventListener('sbi:app-shell-rendered', () => window.setTimeout(loadCoursePlanDateEnhancements, 80));

  const isAccountsPagePath = () => window.location.pathname.endsWith('/admin/admin-accounts.html');
  const hasAccountsDom = () => Boolean(document.getElementById('view-users'));
  const hasDashboardDom = () => Boolean(document.getElementById('view-dashboard'));

  const shouldMountAccountsModule = () => hasAccountsDom() || isAccountsPagePath();

  const shouldBootAdminIndexModules = () => Boolean(document.getElementById('main-content'))
    && Boolean(hasDashboardDom() || hasAccountsDom())
    && !window.location.pathname.includes('admin-profile.html');

  const bootAdminIndexModules = () => {
    if (!shouldBootAdminIndexModules()) return Promise.resolve(false);

    if (!adminIndexModulesPromise) {
      const imports = [import('/admin/js/admin-core.js?v=8.0P.167.271')];
      if (hasDashboardDom()) imports.push(import('/admin/js/admin-dashboard.js?v=8.0P.167.0'));

      adminIndexModulesPromise = Promise.allSettled(imports).then((results) => {
        const failed = results.filter((result) => result.status === 'rejected');

        if (failed.length) {
          console.warn('[SBI Admin] Boot index partiel :', failed.map((item) => item.reason));
          adminIndexModulesPromise = null;
          return false;
        }

        window.SBI_ADMIN_CORE_REINIT?.();
        if (hasDashboardDom()) window.SBI_ADMIN_DASHBOARD_REINIT?.();
        window.dispatchEvent(new CustomEvent('sbi:admin-index-modules-booted'));
        return true;
      });
    }

    return adminIndexModulesPromise;
  };

  const loadAccountEscalationsModule = () => {
    if (!shouldMountAccountsModule()) return Promise.resolve(false);

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
      accountsModulePromise = import('/admin/js/admin-accounts-dashboard.js?v=8.0P.167.62')
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

    window.addEventListener('popstate', scheduleAccountsMount);
    window.addEventListener('pageshow', scheduleAccountsMount);
    window.addEventListener('focus', scheduleAccountsMount);
    window.addEventListener('sbi:components-ready', scheduleAccountsMount);
    window.addEventListener('sbi:app-shell-rendered', scheduleAccountsMount);
    window.addEventListener('sbi:admin-index-dom-present', scheduleAccountsMount);
    window.addEventListener('sbi:admin-tab-changed', scheduleAccountsMount);
  };

  const failSafe = window.setTimeout(() => {
    notifyReady();
    releasePreload();
    startAccountsWatcher();
    scheduleAccountsMount();
  }, 900);

  window.SBI_COMPONENTS_READY = import('/admin/js/components/index.js?v=8.0P.167.317')
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
      loadCoursePlanDateEnhancements();
      return true;
    })
    .catch((error) => {
      console.error('[SBI Components] Chargement modulaire impossible :', error);
      window.clearTimeout(failSafe);
      notifyReady();
      releasePreload();
      startAccountsWatcher();
      scheduleAccountsMount();
      loadCoursePlanDateEnhancements();
      return false;
    });
})();