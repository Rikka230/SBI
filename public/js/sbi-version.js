/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.203',
  branch: 'main',
  channel: 'LIVE PLATFORM',
  stage: 'LIVE SCHEDULING V1',
  updatedAt: '2026-05-27',
  label: 'SBI 8.0P.167.203 - live scheduling and editor persistence'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
