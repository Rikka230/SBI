/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.98-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 CURRICULUM TIMELINE REDESIGN + GPT2 PRESERVED',
  stage: 'CURSUS PAGE HORIZONTAL MULTITRACK MOCKUP BASE',
  updatedAt: '2026-05-18',
  label: 'SBI 8.0P.167.98-GPT2.1 - CURSUS TIMELINE REDESIGN'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
