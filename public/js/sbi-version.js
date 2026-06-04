/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.325',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : carte Comptes + dégagement enfin appliqués (CSS injecté en JS, PJAX-proof) + carte ≤1024px',
  stage: 'Suite au constat « nav PJAX bonne mais carte Comptes + dégagement inchangés » : la barre du bas (sombre) s\'affichait car son CSS est INJECTÉ EN JS, alors que la carte/dégagement dépendaient d\'un <link> statique qui ne « prenait » pas en PJAX. Fix : admin-responsive.css est désormais INJECTÉ EN JS (comme la bottom-nav) → présent sur chaque page admin, PJAX-proof, posé en dernier (prime sur admin-accounts.css). En plus : (a) dégagement appliqué AUSSI au conteneur de liste interne (#users-list-container), pas seulement #main-content ; (b) carte Comptes passée en ≤1024px (= où la bottom-nav est active) pour ne pas dépendre d\'un device exactement ≤640px. Cache : bump components.js?v=325 sur les 17 pages → index.js/bottom-nav.js .325 + admin-responsive.css?v=325 injecté.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.325 - Admin mobile : carte Comptes + dégagement appliqués (CSS injecté JS, PJAX-proof)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
