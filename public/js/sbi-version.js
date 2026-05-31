/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.268',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'refonte UI/UX ecran eleves en retard : maitre-detail (selecteur promotion + liste eleves filtrable/triable/recherche + fiche eleve consolidee retard/decrochage/Qualiopi), pour passage a l echelle',
  updatedAt: '2026-05-31',
  label: 'SBI 8.0P.167.268 - refonte UI/UX eleves en retard (maitre-detail)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
