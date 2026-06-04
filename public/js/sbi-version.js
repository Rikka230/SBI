/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.322',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : page Comptes — liste 6 colonnes transformée en cartes empilées (≤640px)',
  stage: 'Vraie optimisation mobile de la page Comptes (admin-accounts) : la liste dense à 6 colonnes (avatar · nom · email · statut · voir · éditer) devient des CARTES empilées lisibles ≤640px (avatar à gauche, nom/email, statut, puis les 2 actions en boutons pleine largeur). CSS-only dans admin-responsive.css (grille re-disposée, `!important` + source order battent la grille inline et admin-accounts.css). Desktop inchangé. Première page « vraie carte » ; les autres pages de consultation suivront selon les retours.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.322 - Admin mobile : page Comptes en cartes empilées (≤640px)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
