/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.301',
  branch: 'main',
  channel: 'Espace interne : suppression du badge de dev fige (6.2-bis) ; badge version = dynamique',
  stage: 'FIX badge : l ancien badge CSS fige « SBI UI 6.2-bis · avatar-profile-test » (body.sbi-internal-ui::after dans sbi-ui-polish.css) etait encore visible cote tuteur (l override du badge dynamique ne gagnait pas toujours). Neutralise a la source (content:none) -> seul le badge de version REEL (#sbi-version-badge, lit sbi-version.js) s affiche, sur tous les espaces. Suite des fix tuteur .300 (sbi-tutor-space lime + recherche apprenti isolee).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.301 - Suppression badge dev fige (6.2-bis) ; badge version dynamique seul'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
