/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.171',
  branch: 'main',
  channel: 'P2J.3D COURSE EDITOR V2 PJAX VISUAL FIX',
  stage: 'EDITOR V2 PJAX BODY CLASSES RESTORED',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.171 - Course editor V2 PJAX visual shell fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
