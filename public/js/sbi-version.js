/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.214',
  branch: 'main',
  channel: 'LIVE ROOM',
  stage: 'INLINE REPLAY + ATTENDANCE',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.214 - inline replay, refresh-safe live room and attendance checks'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
