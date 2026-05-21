/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.142',
  branch: 'main',
  channel: 'P2I.30 STUDENT SWITCH + TEACHER BACK FIX',
  stage: 'STUDENT PROGRAM/LIBRARY CORE SWITCH + TEACHER NO-DATES AND EDIT HISTORY',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.142 - Student programme/library switch and teacher edit history fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
