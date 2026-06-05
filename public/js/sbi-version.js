/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.336',
  branch: 'adapt-admin-mobile',
  channel: 'Chantier mobile admin : éditeur de cours (course-editor) bloqué « ordinateur requis » <900px (les 4 éditeurs homogènes désormais)',
  stage: 'Chantier mobile admin (toutes pages), piloté par un harnais headless FIDÈLE (vraie page + tous CSS + classes mobiles réelles). Triage : seule la page PROFIL débordait vraiment (586px à 360) — .profile-grid (300px 1fr) ne collapsait jamais. Fixes SYSTÉMIQUES dans admin-responsive.css (≤1024px) : (1) #main-content { min-width:0 } — gotcha flexbox : un flex-item à min-width:auto refuse de rétrécir sous la min-content de son contenu → débordement diffus ; c\'était LA cause racine du Profil et un filet pour toutes les pages ; (2) max-width:100% + box-sizing:border-box sur tout #main-content * (cape les largeurs fixes inline) ; (3) Profil : .profile-grid → 1 colonne, onglets qui s\'enroulent (admin-profile.css). Résultat harnais : 0 débordement sur les 14 pages de consultation à 360/768/1024. Reste : tester le contenu injecté en JS (listes) avec données, revue visuelle, bloc éditeurs <900px (course-editor), nettoyage instrumentation.',
  updatedAt: '2026-06-05',
  label: 'SBI 8.0P.167.335 - Chantier mobile admin : frame systémique (min-width:0 + max-width + box-sizing) + Profil corrigé'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
