/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.163',
  branch: 'main',
  channel: 'P2J.3A COURSE EDITOR V2 SHELL PANEL FIX',
  stage: 'COURSE EDITOR V2 PANEL SCRIPTS AND SHELL SAFETY',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.163 - Course editor V2 shell panel fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
