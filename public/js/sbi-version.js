/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.151',
  branch: 'main',
  channel: 'P2I.39 STUDENT VIEWER DIRECT GET PASS',
  stage: 'STUDENT COURSE VIEWER ACCESS FIX',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.151 - Student viewer access fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
