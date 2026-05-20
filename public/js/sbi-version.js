/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.118',
  branch: 'main',
  channel: 'P2I.8 DURABLE ACCOUNT FINALIZATION LINKS',
  stage: 'DURABLE FINALIZATION TOKEN UNTIL PASSWORD CREATED',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.118 - DURABLE ACCOUNT FINALIZATION LINKS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
