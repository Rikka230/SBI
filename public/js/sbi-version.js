/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.164',
  branch: 'main',
  channel: 'P2J.3A COURSE EDITOR V2 STRUCTURE FIX',
  stage: 'COURSE EDITOR V2 SINGLE ADD AND DRAG DROP',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.164 - Course editor V2 single add and drag drop fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
