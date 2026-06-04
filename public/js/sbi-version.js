/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.308',
  branch: 'refonte-mobile-308-311',
  channel: 'Refonte mobile (A) : éditeur de cours prof → notice « ordinateur requis » <900px',
  stage: 'Workstream A de la refonte mobile : l\'éditeur de cours V2 (outil d\'autorité desktop : grille 3 colonnes, glisser-déposer souris, bank fixe) affiche désormais une notice plein écran « L\'éditeur de cours nécessite un ordinateur » sous 900px, et masque l\'éditeur + la bank fixe. CSS-only (course-editor-v2.css + markup course-editor.html), aucun JS, aucun changement ≥900px. Pas de rebuild tactile (décision client).',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.308 - Mobile : éditeur de cours prof → notice « ordinateur requis » <900px'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
