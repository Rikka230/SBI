/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.340',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : bottom-nav en thème ADMIN dès le 1er rendu (theme keyé sur sbi-admin-surface statique) — fin du « skin élève avant admin »',
  stage: 'Correctif FOUC (« CSS cassé / icônes dans tous les sens » au 1er chargement mobile). Cause : sur les 17 pages admin, admin-responsive.css / admin-surface-unified.css / admin-mobile-block.css étaient déclarés APRÈS le <script src=components.js>. Or components.js est parser-bloquant ET servi no-cache (Sceau) → il est re-fetché à chaque chargement et BLOQUE le téléchargement des CSS placés après lui. Sur mobile lent, la page se révèle (gate body.auth-ready de admin-layout.css qui affiche .app-container) AVANT que ces CSS soient chargés → flash non stylé ~1s. Fix : remontée de tous les <link rel=stylesheet> AVANT le script sur les 17 pages → quand .app-container se révèle, tout le CSS est prêt. Aucun changement de comportement de components.js (toujours parser-bloquant, juste précédé par le CSS).',
  updatedAt: '2026-06-05',
  label: 'SBI 8.0P.167.340 - Admin mobile : bottom-nav thème admin dès le 1er rendu (keyé sur sbi-admin-surface statique)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
