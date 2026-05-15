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
 * 8.0P.147 : charge le bridge conformité des fiches formations publiques.
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

  const loadPageBridges = () => {
    const path = window.location.pathname.toLowerCase();

    if (path.endsWith('/admin/formations-cours.html') || path.endsWith('/admin/formations-cours')) {
      import('/admin/js/public-formation-compliance-admin.js?v=8.0P.147')
        .catch((error) => console.warn('[SBI Components] Bridge conformité formations publiques indisponible :', error));
    }
  };

  const failSafe = window.setTimeout(() => {
    notifyReady();
    releasePreload();
    loadPageBridges();
  }, 2200);

  window.SBI_COMPONENTS_READY = import('/admin/js/components/index.js')
    .then(async (module) => {
      if (module?.waitForExpectedComponents) {
        await module.waitForExpectedComponents(1800);
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));
      window.clearTimeout(failSafe);
      notifyReady();
      releasePreload();
      loadPageBridges();
      return true;
    })
    .catch((error) => {
      console.error('[SBI Components] Chargement modulaire impossible :', error);
      window.clearTimeout(failSafe);
      notifyReady();
      releasePreload();
      loadPageBridges();
      return false;
    });
})();
