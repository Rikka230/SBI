/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.254',
  branch: 'main',
  channel: 'LIVE REPLAY - AUTO-START CLOUD RECORDING (DAILY)',
  stage: 'joinLiveConference: token owner start_cloud_recording=true (chaque live cursus genere son replay)',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.254 - live auto-start cloud recording'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
