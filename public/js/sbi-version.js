/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.133',
  branch: 'main',
  channel: 'P2I.21 PROFILE FINALIZATION DIRECT ACTION',
  stage: 'MANUAL FINALIZATION ACTION BYPASSES CLIENT FIRESTORE REFRESH',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.133 - Manual finalization action independent from client Firestore refresh'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
