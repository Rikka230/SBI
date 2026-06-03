/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.303',
  branch: 'main',
  channel: 'Complétude de compte : checklist + jauge (panel profil) + badge croix global',
  stage: 'NOUVEAU : complétude de compte calculée serveur (CF recomputeAccountCompleteness -> users.completeness {percent,complete,missing,items}, init à la création + champ protégé). Refonte ÉPURÉE du panel « Actions compte » du profil élève : carte « Complétude du compte » (jauge + checklist des critères profil/finalisation/formation/promotion+coursePlan/livret avec liens « Compléter ») en haut, actions avancées/notes repliées. Module partagé /js/account-completeness.js (badge + jauge + checklist). Badge croix ✗ derrière le nom des comptes <100% PARTOUT (roster promo, élèves en retard, recherche globale admin, liste comptes admin) -> redirige vers /admin/admin-profile.html?id=&tab=account. Accessibilité : glyphe ✗ + aria-label (pas couleur seule).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.303 - Complétude compte : checklist+jauge profil + badge croix global (incomplet)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
