/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.26',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Rebuild Qualiopi as continuous transparent section over global bottom lights',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.26 - REBUILD QUALIOPI CONTINUOUS BACKGROUND LIGHTS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
