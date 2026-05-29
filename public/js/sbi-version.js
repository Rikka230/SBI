/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.247',
  branch: 'main',
  channel: 'LIVE V2 STANDALONE PJAX EXIT REPAIR',
  stage: 'ENABLE APPSHELL AFTER F5 AND GUARD SAME ROUTE',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.247 - repair pjax after teacher lives f5'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
