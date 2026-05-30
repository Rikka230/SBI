/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.257',
  branch: 'main',
  channel: 'LIVE - FIX VISIBILITE BOUTON ANNULATION ADMIN',
  stage: 'bouton annuler base sur statut session (isLiveSessionClosed/replay/past) au lieu de row.status planning',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.257 - fix admin cancel button visibility'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
