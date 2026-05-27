/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.205',
  branch: 'main',
  channel: 'LIVE + VIEWER',
  stage: 'TEACHER LIVE + RESOURCE DOWNLOAD HOTFIX',
  updatedAt: '2026-05-27',
  label: 'SBI 8.0P.167.205 - teacher live access, viewer downloads and public XP'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
