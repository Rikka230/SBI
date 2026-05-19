/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.103-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 CURSUS WEEKS CONTROLS + GPT2 PRESERVED',
  stage: 'CURSUS QUICK ADD REMOVE MARGIN WEEKS',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.103-GPT2.1 - CURSUS WEEKS CONTROLS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
