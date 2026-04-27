/**
 * =======================================================================
 * WEB COMPONENTS - Bootstrap compatibilité legacy
 * =======================================================================
 *
 * Les pages existantes chargent encore ce fichier avec une balise script
 * classique. On garde donc ce fichier comme point d’entrée non-module,
 * puis on charge les vrais composants depuis /admin/js/components/index.js.
 *
 * Important 6.7D.1 : les composants sont maintenant chargés en import
 * dynamique. Les scripts de page peuvent attendre window.SBI_COMPONENTS_READY.
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

  const failSafe = window.setTimeout(releasePreload, 1200);

  window.SBI_COMPONENTS_READY = import('/admin/js/components/index.js')
    .then(() => {
      window.clearTimeout(failSafe);
      notifyReady();
      releasePreload();
    })
    .catch((error) => {
      console.error('[SBI Components] Chargement modulaire impossible :', error);
      notifyReady();
      releasePreload();
    });
})();
