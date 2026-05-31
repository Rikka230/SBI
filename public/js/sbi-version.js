/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.262',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'v1 ecran admin "eleves en retard sur leur cursus" : croise promotions.coursePlan x users.learningProgress, lecture seule (page + route PJAX + menu)',
  updatedAt: '2026-05-31',
  label: 'SBI 8.0P.167.262 - eleves en retard sur leur cursus (v1 lecture seule)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
