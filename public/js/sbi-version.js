/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.58',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'About hero like mockup and PNG-only founder hero',
  updatedAt: '2026-05-10',
  label: 'SBI 8.0P.58 - ABOUT TOP LIKE MOCKUP + NO JPG FALLBACK'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
