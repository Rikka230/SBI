/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.13',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Mobile diagonal bridge recovery and founder shards foreground pass',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.13 - MOBILE DIAGONAL BRIDGE + FOUNDER SHARDS FOREGROUND'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
