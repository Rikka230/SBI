/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.326',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : carte Comptes — CSS chargé aussi via le <link> statique de la page (fiable en full-load ET PJAX)',
  stage: 'Diagnostic via harnais headless (Edge/puppeteer) : la cascade CSS de la carte Comptes est CORRECTE (au 375px, .sbi-account-row calcule bien « 44px 1fr 1fr », 3 pistes, border-radius 16px → la carte gagne sur admin-accounts.css + la grille inline). Donc ce n\'était JAMAIS un bug de style : le souci était le CHARGEMENT du CSS sur l\'appareil. L\'injection JS (.325) ne s\'applique qu\'après un rechargement complet (dans une session PJAX, components.js reste figé). Fix fiable : on pointe le <link> STATIQUE admin-responsive.css?v=325 de chaque page de consultation (chargé au full-load ET re-chargé en PJAX par ensureDocumentStyles) → la carte se charge même dans une session déjà ouverte, dès la prochaine navigation vers Comptes. L\'injection JS reste en secours.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.326 - Admin mobile : carte Comptes chargée via <link> statique (full-load + PJAX)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
