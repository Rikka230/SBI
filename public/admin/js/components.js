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
 * 8.0P.158 : cache-bust Comptes & accès après suivi activation.
 */

(function bootstrapSbiComponents(){
  const releasePreload = () => {
    document.body?.classList?.remove('preload');
    document.body?.classList?.add('sbi-preload-timeout');
  };

  const notifyReady = () => {
    window.__SBI_COMPONENTS_READY = true;
    window.dispatchEvent(new CustomEvent('sbi:components-ready'));
  };

  const loadAccountsModule = () => {
    const isAdminIndex = window.location.pathname.endsWith('/admin/')
      || window.location.pathname.endsWith('/admin/index.html');

    if (!isAdminIndex) return Promise.resolve(false);

    return import('/admin/js/admin-accounts-dashboard.js?v=8.0P.158')
      .then((module) => {
        module?.mountAdminAccountsDashboard?.();
        return true;
      })
      .catch((error) => {
        console.warn('[SBI Accounts] Module comptes non chargé :', error);
        return false;
      });
  };

  const failSafe = window.setTimeout(() => {
    notifyReady();
    releasePreload();
  }, 2200);

  window.SBI_COMPONENTS_READY = import('/admin/js/components/index.js')
    .then(async (module) => {
      if (module?.waitForExpectedComponents) {
        await module.waitForExpectedComponents(1800);
      }

      await loadAccountsModule();

      await new Promise((resolve) => requestAnimationFrame(resolve));
      window.clearTimeout(failSafe);
      notifyReady();
      releasePreload();
      return true;
    })
    .catch((error) => {
      console.error('[SBI Components] Chargement modulaire impossible :', error);
      window.clearTimeout(failSafe);
      notifyReady();
      releasePreload();
      return false;
    });
})();
