/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.19',
  branch: 'public-pjax-app-shell',
  channel: 'PUBLIC PJAX APP SHELL',
  stage: 'Desktop light layer moved below into Qualiopi-newsletter underlay',
  updatedAt: '2026-05-07',
  label: 'SBI 8.0P.19 - QUALIOPI/NEWSLETTER UNDERLAY LIGHT FIX'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
