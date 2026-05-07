/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.42',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Public assistant signal halo emphasis',
  updatedAt: '2026-05-08',
  label: 'SBI 8.0P.42 - ASSISTANT SIGNAL FLASH HALO'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
