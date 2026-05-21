/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.153',
  branch: 'main',
  channel: 'P2I.40 STUDENT VIEWER DIRECT COURSE GET',
  stage: 'STUDENT VIEWER FIRESTORE DIRECT ACCESS FIX',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.153 - Student viewer direct course access fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
