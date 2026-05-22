/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.182',
  branch: 'main',
  channel: 'COURSE EDITOR V2 DURATION MEDIA FIX',
  stage: 'AUTO TOTAL DURATION AND STORAGE MEDIA PERMISSIONS',
  updatedAt: '2026-05-22',
  label: 'SBI 8.0P.167.182 - Course duration auto total and media upload permissions'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
