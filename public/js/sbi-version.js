/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0M.1',
  branch: 'pjax-app-shell-test',
  channel: 'PJAX APP SHELL TEST',
  stage: 'Viewer mountable core',
  updatedAt: '2026-04-28',
  label: 'SBI 8.0M.1 - PJAX APP SHELL TEST'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
