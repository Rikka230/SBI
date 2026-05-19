/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.99-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 CURSUS UX PJAX STABILIZATION + GPT2 PRESERVED',
  stage: 'CURSUS PAGE PJAX CLEANUP + INTERNAL SCROLL LAYOUT STABILIZATION',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.99-GPT2.1 - CURSUS UX/PJAX STABILIZATION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
