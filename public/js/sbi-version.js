/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.101-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 CURSUS TIMELINE DRAG DROP + GPT2 PRESERVED',
  stage: 'CURSUS TIMELINE HORIZONTAL WEEK DRAG DROP',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.101-GPT2.1 - CURSUS TIMELINE DRAG DROP'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
