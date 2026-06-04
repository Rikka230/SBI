/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.317',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile (1/3) : bottom-nav flottante sombre + feuille « Plus » cockpit (recherche/profil/cache/déco)',
  stage: 'Adaptation mobile de l\'espace ADMIN — chrome. La bottom-nav flottante (jusqu\'ici réservée élève/prof/tuteur) couvre désormais l\'admin (rôle ajouté au manifeste) : 4 onglets directs (Tableau de Bord · Comptes · Promotions · Cursus) ; le reste (Formations, Élèves en retard, Journal, Serveur&Vidéos) + le cockpit (recherche globale, Mon Profil, Rafraîchir le cache, Déconnexion) dans la feuille « Plus ». Notifications via l\'assistant (déjà monté, remonté haut-gauche par .315). En ≤1024px les DEUX panneaux (nav gauche + cockpit droit) sont masqués ; capsule + feuille en verre SOMBRE (variante admin). isActive étendu pour les vues SPA (?tab=). Desktop ≥1025px inchangé (2 panneaux). Cache : sbi-bottom-nav.css?v=317 + nav-manifest/bottom-nav → index.js?v=317 (components.js).',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.317 - Admin mobile (1/3) : bottom-nav sombre + feuille Plus (cockpit)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
