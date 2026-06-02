/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.283',
  branch: 'main',
  channel: 'Documents de formation : acces eleve depuis le coffre du profil',
  stage: 'ajustement : l acces eleve aux Documents de formation passe par un bouton dans le bloc coffre de documents perso de la fiche profil (#student-visible-documents) au lieu d une entree dans le panneau de navigation (entree nav eleve retiree). La feature Documents de formation (livret/reglement/planning/referentiel + autres, gestion admin + lecture eleve/prof par formation, planning par promotion) reste inchangee par ailleurs.',
  updatedAt: '2026-06-02',
  label: 'SBI 8.0P.167.283 - Documents de formation : acces eleve depuis le coffre du profil (hors panel)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
