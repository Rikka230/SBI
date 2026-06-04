/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.329',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : carte Comptes — fin du scroll horizontal (minmax(0,1fr) + ellipsis nom/email)',
  stage: 'Correctif scroll horizontal page Comptes. Cause : les colonnes 1fr de la carte valent minmax(auto,1fr) ; auto = largeur min-content de la cellule, donc un email long et insécable empêchait la colonne de rétrécir → la grille débordait la largeur d\'écran (révélé par le passage en overflow:visible du scroll naturel .328, qui auparavant masquait le débordement via overflow-x:hidden). Fix (admin-responsive.css) : grid-template-columns 44px minmax(0,1fr) minmax(0,1fr) + max-width:100% sur la carte + ellipsis (overflow/text-overflow/nowrap) sur nom et email → les cellules rétrécissent et tronquent proprement au lieu de pousser la largeur. Filet : html { overflow-x:hidden } (.328) reste en secours. Carte Comptes : optimisation visuelle plus poussée encore possible (Candidat C).',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.329 - Admin mobile : carte Comptes sans scroll horizontal (minmax(0,1fr) + ellipsis)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
