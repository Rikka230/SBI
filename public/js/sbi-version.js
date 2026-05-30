/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.261',
  branch: 'main',
  channel: 'MEGA PATCH AUDIT - securite legere + a11y/SEO + cursus 2C + shell',
  stage: 'honeypot+rate-limit contact, a11y/SEO (skip-link, reduced-motion, focus-visible), cursus T2/T3, anti-.230 generique + cleanup listeners standalone',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.261 - mega patch audit (4 vagues)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
