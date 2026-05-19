/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.107.1-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 CURSUS HARDENING HOTFIX + GPT2 PRESERVED',
  stage: 'CURSUS HARDENING FREEZE HOTFIX',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.107.1-GPT2.1 - CURSUS HARDENING FREEZE HOTFIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
