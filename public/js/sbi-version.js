/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.52',
  branch: 'main',
  channel: 'ADMIN CANONICAL SURFACE LOAD ORDER',
  stage: 'REINJECT CANONICAL SURFACE AFTER DYNAMIC EFFECTS',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.52 - REINJECT CANONICAL SURFACE AFTER DYNAMIC EFFECTS'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
