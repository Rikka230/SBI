/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.1',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Public shell foundation - anchor navigation only, internal spaces protected',
  updatedAt: '2026-05-02',
  label: 'SBI 8.0P.1 - PUBLIC PJAX APP SHELL'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
