/**
 * =======================================================================
 * WEB COMPONENTS - Bootstrap compatibilité legacy
 * =======================================================================
 *
 * Les pages existantes chargent encore ce fichier avec une balise script
 * classique. On garde donc ce fichier comme point d’entrée non-module,
 * puis on charge les vrais composants depuis /admin/js/components/index.js.
 */

(function bootstrapSbiComponents(){
  const releasePreload = () => {
    document.body?.classList?.remove('preload');
    document.body?.classList?.add('sbi-preload-timeout');
  };

  const failSafe = window.setTimeout(releasePreload, 900);

  import('/admin/js/components/index.js')
    .then(() => {
      window.clearTimeout(failSafe);
      releasePreload();
    })
    .catch((error) => {
      console.error('[SBI Components] Chargement modulaire impossible :', error);
      releasePreload();
    });
})();
