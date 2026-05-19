/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.103.1-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 CURSUS PURE WEEK CONTROLS + MARGIN DROP GUARD + GPT2 PRESERVED',
  stage: 'CURSUS WEEKS WITHOUT MARGIN ITEMS AND NO COURSE ON MARGIN',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.103.1-GPT2.1 - CURSUS PURE WEEK CONTROLS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
