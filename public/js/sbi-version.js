/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.98.2-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 PROMOTION CURSUS SELECTION + GPT2 PRESERVED',
  stage: 'PROMOTIONS SELECT CURRICULUM TEMPLATE WITHOUT OLD PLANNING OVERLAY',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.98.2-GPT2.1 - PROMOTION CURSUS SELECTION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
