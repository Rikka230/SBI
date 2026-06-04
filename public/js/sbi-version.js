/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.318',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile (2/3) : notice « ordinateur requis » sur les éditeurs lourds (Cursus, Promotions, Formations)',
  stage: 'Adaptation mobile ADMIN — éditeurs lourds. Sous 900px, les 3 outils d\'autorité desktop (Cursus timeline, Promotions planning, Formations éditeur de cours) masquent leur contenu et affichent une notice plein écran « Cet écran nécessite un ordinateur » (thème sombre cockpit), comme l\'éditeur prof .308. La bottom-nav .317 reste au-dessus → l\'admin peut quand même naviguer ailleurs depuis le téléphone. CSS-only partagé (admin-mobile-block.css) + classe body.sbi-admin-editor-lock + markup notice sur les 3 pages. Aucun rebuild tactile. Desktop inchangé.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.318 - Admin mobile (2/3) : notice « ordinateur requis » Cursus/Promotions/Formations'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
