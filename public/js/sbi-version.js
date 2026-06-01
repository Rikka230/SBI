/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.274',
  branch: 'main',
  channel: 'Devoirs & Evaluations (depot eleve + correction prof)',
  stage: 'correctifs module Devoirs & Evaluations : fix acces admin (isSbiAdminLike attend le profil, plus l uid) ; acces admin deplace du panel vers un BLOC dans l onglet Formations (index.html?tab=view-formations) ; icones distinctes (document) pour les onglets prof/eleve au lieu de l icone Formations.',
  updatedAt: '2026-06-01',
  label: 'SBI 8.0P.167.274 - fix acces admin Devoirs + bloc onglet Formations + icones distinctes prof/eleve'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
