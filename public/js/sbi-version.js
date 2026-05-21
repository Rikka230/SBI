/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.159',
  branch: 'main',
  channel: 'P2J.3 COURSE EDITOR V2 DEDICATED PAGES',
  stage: 'MODULAR COURSE EDITOR V2 TEACHER LIGHT ADMIN DARK',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.159 - Course editor V2 dedicated pages'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
