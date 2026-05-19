/**
 * SBI 8.0P.167.99-GPT2.1
 * Cursus PJAX guard.
 *
 * But : enregistrer le cleanup de la page Cursus même lors d'un chargement direct.
 * Sans ça, le module admin-cursus.js peut rester mounted=true après une sortie PJAX,
 * puis refuser de remonter correctement quand on revient sur /admin/admin-cursus.html.
 */

import { registerCleanup } from '/js/app-shell/view-lifecycle.js';

let cleanupRegistered = false;
let unregisterCleanup = null;

function runCursusCleanup(meta = {}) {
  if (typeof window.SBI_ADMIN_CURSUS_UNMOUNT === 'function') {
    window.SBI_ADMIN_CURSUS_UNMOUNT({
      reason: meta?.reason || 'admin-cursus-pjax-cleanup'
    });
  }

  if (typeof unregisterCleanup === 'function') {
    unregisterCleanup();
    unregisterCleanup = null;
  }

  cleanupRegistered = false;
}

function registerDirectLoadCleanup() {
  if (cleanupRegistered) return;
  if (!document.getElementById('view-cursus')) return;

  unregisterCleanup = registerCleanup(runCursusCleanup, 'admin-cursus-direct-load');
  cleanupRegistered = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', registerDirectLoadCleanup, { once: true });
} else {
  registerDirectLoadCleanup();
}

window.addEventListener('sbi:app-shell:ready', registerDirectLoadCleanup);
