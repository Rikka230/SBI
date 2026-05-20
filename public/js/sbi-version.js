/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.115',
  branch: 'main',
  channel: 'P2I.6 ACCOUNT CREATE SERVER LOCK',
  stage: 'ACCOUNT CREATE SERVER LOCK',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.115 - ACCOUNT CREATE SERVER LOCK'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
