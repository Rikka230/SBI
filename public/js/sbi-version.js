/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.275',
  branch: 'main',
  channel: 'Devoirs & Evaluations (depot eleve + correction prof)',
  stage: 'theme : adaptation du module Devoirs au thème SOMBRE admin (override scopé .sbi-admin-surface : fonds var(--bg-card/--bg-panel), texte var(--text-main), bordures var(--border-color)) ; les espaces prof/eleve restent en thème clair. Suite aux correctifs .274 (acces admin, bloc onglet Formations, icones prof/eleve).',
  updatedAt: '2026-06-01',
  label: 'SBI 8.0P.167.275 - module Devoirs adapte au theme sombre admin (override .sbi-admin-surface)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
