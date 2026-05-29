/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.238',
  branch: 'main',
  channel: 'LIVE V2 STABILIZATION',
  stage: 'CANONICAL TEACHER LIVE V2 REPORT MAILS AND TEST ROOM',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.238 - live v2 stabilization and transactional report mails'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
