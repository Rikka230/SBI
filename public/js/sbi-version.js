/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.96',
  branch: 'main',
  channel: 'P2I.5-F SHARED COURSES CROSS ACCESS PREP',
  stage: 'PROMOTION PLANNING SHARED COURSES SOURCE DISPLAY CONTEXT',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.96 - SHARED COURSES CROSS ACCESS PREP'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
