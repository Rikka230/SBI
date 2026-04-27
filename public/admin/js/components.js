/**
 * =======================================================================
 * WEB COMPONENTS - Bootstrap compatibilité legacy
 * =======================================================================
 *
 * Les pages existantes chargent encore ce fichier avec une balise script
 * classique. On garde donc ce fichier comme point d’entrée non-module,
 * puis on charge les vrais composants depuis /admin/js/components/index.js.
 *
 * 6.7D.2 : le signal ready attend maintenant que le DOM soit disponible.
 * Ça évite le race-condition où dashboard fonctionne, mais mes-cours/profil
 * écrivent dans une topbar qui n'est pas encore montée.
 */

(function bootstrapSbiComponents(){
  const releasePreload = () => {
    document.body?.classList?.remove('preload');
    document.body?.classList?.add('sbi-preload-timeout');
  };

  const waitDomReady = () => {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  };

  const notifyReady = () => {
    window.__SBI_COMPONENTS_READY = true;
    window.dispatchEvent(new CustomEvent('sbi:components-ready'));
  };

  const failSafe = window.setTimeout(releasePreload, 1500);

  window.SBI_COMPONENTS_READY = import('/admin/js/components/index.js')
    .then(waitDomReady)
    .then(() => new Promise((resolve) => requestAnimationFrame(resolve)))
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
