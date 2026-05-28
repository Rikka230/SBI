/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.215',
  branch: 'main',
  channel: 'LIVE ROOM',
  stage: 'JOIN GATE + INLINE REPLAY + REFRESH FIX',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.215 - live join gating, inline replay player and refresh fixes'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
