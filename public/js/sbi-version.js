/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.126',
  branch: 'main',
  channel: 'P2I.14 FINALIZATION LINKS NO FIREBASE FALLBACK',
  stage: 'DURABLE FINALIZATION LINKS BLOCK SHORT FIREBASE FALLBACK',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.126 - Durable finalization blocks short Firebase fallback'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
