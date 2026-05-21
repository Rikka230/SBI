/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.157',
  branch: 'main',
  channel: 'P2J.1 MODULAR COURSE AUTHORING FOUNDATION',
  stage: 'COURSE ACTIVITY REGISTRY AND QUIZ SCHEMA FOUNDATION',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.157 - Modular course authoring foundation'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
