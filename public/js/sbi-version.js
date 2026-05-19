/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.104-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 PROMOTIONS CURSUS SELECTOR FIX + GPT2 PRESERVED',
  stage: 'PROMOTIONS CURRICULUM TEMPLATES SELECTOR RECOVERY',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.104-GPT2.1 - PROMOTIONS CURSUS SELECTOR FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
