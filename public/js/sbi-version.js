/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.147',
  branch: 'main',
  channel: 'P2I.35 STUDENT CROSS COURSE ACCESS FIX',
  stage: 'STUDENT PROGRAM LIST SORT FIX WITHOUT TEACHER CHANGES',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.147 - Student cross-formation course access and library switch fixed'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
