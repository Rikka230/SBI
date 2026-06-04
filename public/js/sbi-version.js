/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.320',
  branch: 'adapt-admin-mobile',
  channel: 'Fix admin mobile : les liens de la bottom-nav (capsule + feuille « Plus ») naviguent enfin (navigation classique forcée)',
  stage: 'Correctif : sur l\'admin, les liens de la bottom-nav (onglets directs ET feuille « Plus ») ne chargeaient pas — le routeur PJAX avalait le clic (URL jugée équivalente / route non migrée), notamment pour les vues `?tab=`. Les liens admin de la barre sont désormais marqués data-sbi-no-pjax → navigation classique (rechargement complet), fiable partout (index.html relit le ?tab). Les espaces élève/prof/tuteur gardent le PJAX. Cache : index.js?v=320 (components.js) → bottom-nav.js?v=320.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.320 - Fix admin : navigation bottom-nav (capsule + Plus) fonctionnelle'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
