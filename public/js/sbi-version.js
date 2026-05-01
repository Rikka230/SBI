/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.4',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Public index/login PJAX bridge with persistent header logo chrome',
  updatedAt: '2026-05-02',
  label: 'SBI 8.0P.4 - PUBLIC INDEX LOGIN PERSISTENT CHROME'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
