/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.264',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'fix remontage PJAX apres F5 (mountedView) generalise a admin-cursus + admin-promotions (meme defaut latent que eleves-en-retard .263)',
  updatedAt: '2026-05-31',
  label: 'SBI 8.0P.167.264 - fix remontage PJAX (F5) sur cursus + promotions'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
