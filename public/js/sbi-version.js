/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.57',
  branch: 'main',
  channel: 'ADMIN ACCOUNTS DEDICATED PAGE PERF FIX',
  stage: 'ACCOUNTS PJAX SPLIT RAF LOOP FIX',
  updatedAt: '2026-05-17',
  label: 'SBI 8.0P.167.57 - ACCOUNTS PJAX SPLIT RAF LOOP FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
