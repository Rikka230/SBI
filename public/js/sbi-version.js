/**
 * SBI - Version centralisée
 */

export const SBI_VERSION = {
  version: '8.0P.167.141',
  branch: 'main',
  channel: 'P2I.29 LIBRARY PROMOTION SWITCH FIX',
  stage: 'STUDENT PROGRAMME/LIBRARY SWITCH + TEACHER PROMOTION SELECTOR PJAX + PROMOTIONIDS COURSE ACCESS',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.141 - Bibliothèques cours contexte promotion stabilisé'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
