/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.149',
  branch: 'main',
  channel: 'P2I.37 STUDENT VIEWER PASS + LIBRARY LIST',
  stage: 'STUDENT CROSS-FORMATION COURSE VIEWER ACCESS AND LIBRARY TAB FALLBACK',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.149 - Student viewer pass and library list fallback'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
