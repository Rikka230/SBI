/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.225',
  branch: 'main',
  channel: 'STUDENT LIVES',
  stage: 'LEFT PANEL RECOVERY AFTER LIVES',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.225 - fix left panel recovery after lives'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
