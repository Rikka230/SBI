/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.240',
  branch: 'main',
  channel: 'LIVE V2 STABILITY FIXES',
  stage: 'ASSISTANT RESTORE F5 ROOT MOUNT AND STUDENT LIVE POP',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.240 - live v2 room documents and test visibility fixes'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
