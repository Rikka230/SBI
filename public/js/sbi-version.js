/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.337',
  branch: 'adapt-admin-mobile',
  channel: 'Chantier mobile admin TERMINÉ : frame systémique + Comptes/Profil corrigés + 4 éditeurs bloqués <900px + instrumentation retirée (prêt à merger)',
  stage: 'Fin du chantier mobile admin (toutes pages), piloté par un harnais headless FIDÈLE. Acquis : (1) FRAME systémique (admin-responsive.css ≤1024px) — #main-content { min-width:0 } (gotcha flexbox = cause racine des débordements diffus), max-width:100% + box-sizing:border-box sur le contenu, scroll naturel ; (2) Comptes : carte propre (grilles TABLE desktop gardées ≥1025px, nom enroulé/badge visible) ; (3) Profil corrigé (.profile-grid → 1 colonne, onglets enroulés) ; (4) les 4 éditeurs lourds (Cursus/Promotions/Formations/course-editor) bloqués « ordinateur requis » <900px de façon homogène ; (5) instrumentation diag-width retirée. Harnais : 0 débordement sur les 14 pages de consultation à 360/768/1024 ; desktop ≥1025px inchangé. Refacto renderers→classes (Candidat C) volontairement REPORTÉ (le filet systémique a réglé les débordements sans toucher au cœur admin). Prêt à merger adapt-admin-mobile → main.',
  updatedAt: '2026-06-05',
  label: 'SBI 8.0P.167.337 - Chantier mobile admin terminé (frame systémique + Comptes/Profil + 4 éditeurs bloqués + instrumentation retirée)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
