/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.208',
  branch: 'main',
  channel: 'LIVE ROOM',
  stage: 'RESPONSIVE ROOM + DAILY ERRORS',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.208 - responsive live room and clearer Daily errors'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
