/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.321',
  branch: 'adapt-admin-mobile',
  channel: 'Fix admin : navigation bottom-nav fluide (PJAX pour les pages, rechargement seulement pour les vues ?tab)',
  stage: 'Affinage du correctif .320 : le rechargement complet forcé sur TOUS les liens admin provoquait un « saut » à chaque changement de page. On revient au PJAX (fluide, sans saut) pour les vraies PAGES (Comptes, Promotions, Cursus, Élèves en retard, Journal, Mon Profil) et on ne force la navigation classique (data-sbi-no-pjax) QUE pour les vues SPA d\'index.html (?tab= : Tableau de bord, Formations, Serveur&Vidéos) — un swap PJAX charge index.html mais ne relit pas le ?tab, donc la bonne vue ne s\'affichait pas. Per-entry via le champ `tab` du manifeste. Cache : index.js?v=321 → bottom-nav.js?v=321.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.321 - Fix admin : nav bottom-nav fluide (PJAX pages, reload seulement vues ?tab)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
