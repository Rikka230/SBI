/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.313',
  branch: 'refonte-mobile-308-311',
  channel: 'Mobile : panneau info post-connexion allégé (retrait de la liste « nouveautés / patch notes »)',
  stage: 'Suite QA : le panneau d\'information post-connexion (« site en construction ») restait trop haut sur mobile. Retrait de la liste « Dernières nouveautés côté étudiant » (5 items patch notes) qui faisait l\'essentiel de la hauteur ; on garde l\'en-tête + les 3 conseils (ordinateur recommandé / mobile à éviter / important) + le bouton de validation (toujours rendu collant par le fix responsive de tracker.js). Propagation cache : first-login-gate.js?v=8.0P.167.313 dans tracker.js + tracker.js?v=8.0P.167.313 sur les 32 pages.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.313 - Mobile : panneau info post-connexion allégé (retrait des patch notes)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
