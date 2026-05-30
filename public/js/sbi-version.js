/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.255',
  branch: 'main',
  channel: 'LIVE - AUTO-RECORD CLIENT + MASQUAGE BOUTONS MANUELS',
  stage: 'live-room: startRecording auto a joined-meeting, boutons record retires; token start_cloud_recording retire',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.255 - live auto-record client + hide manual buttons'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
