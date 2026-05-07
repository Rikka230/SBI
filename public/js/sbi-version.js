/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.12',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Founder card mobile unclipping and shard cleanup',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.12 - FOUNDER CARD MOBILE UNCLIPPING + SHARD CLEANUP'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
