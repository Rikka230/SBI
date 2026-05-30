/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.260',
  branch: 'main',
  channel: 'SECURITE - functions/ exclu du hosting (anti-exposition source serveur)',
  stage: 'firebase.json hosting.ignore += functions/** (public/functions/index.js ne doit plus etre servi en statique)',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.260 - security: stop serving functions source via hosting'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
