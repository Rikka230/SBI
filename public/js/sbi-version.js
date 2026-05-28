/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.235',
  branch: 'main',
  channel: 'STUDENT LIVE TITLES',
  stage: 'STUDENT LIVES CURSUS TITLES',
  updatedAt: '2026-05-28',
  label: 'SBI 8.0P.167.235 - student live titles from cursus'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
