/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.263',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'ecran "eleves en retard" v1 + fix: remontage PJAX apres F5 (mountedView au lieu du seul flag mounted, donnees rechargees au retour)',
  updatedAt: '2026-05-31',
  label: 'SBI 8.0P.167.263 - eleves en retard : fix rechargement au retour PJAX (F5)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
