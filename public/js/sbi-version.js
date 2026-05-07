/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.21',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Restore direct Firebase media boot for hero video and HD logos',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.21 - RESTORE FIREBASE MEDIA BOOT'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
