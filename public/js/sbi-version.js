/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.310',
  branch: 'refonte-mobile-308-311',
  channel: 'Refonte mobile (C) : page livret (élève + tuteur) responsive ≤640px',
  stage: 'Workstream C de la refonte mobile : le livret d\'apprentissage (rempli au doigt — élève : identité/périodes ; tuteur : absences) devient lisible ≤640px : tables planning/absences avec cellules compactes + scroll de secours, badges de statut qui retournent à la ligne dans les cellules étroites, padding de page réduit. CSS-only (booklet.css), appliqué aux pages student/livret, tutor/livret, tutor/dashboard et teacher/livrets (admin desktop inchangé).',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.310 - Mobile : page livret (élève + tuteur) responsive (tables + badges + padding)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
