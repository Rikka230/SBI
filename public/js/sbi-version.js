/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.107.4-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 CURSUS LOCK DRAG HOTFIX + GPT2 PRESERVED',
  stage: 'CURSUS LOCK DRAG PRESERVE UNLOCKED',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.107.4-GPT2.1 - CURSUS LOCK DRAG HOTFIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
