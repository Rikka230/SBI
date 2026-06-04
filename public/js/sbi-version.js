/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.332',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : page Comptes — fin du scroll horizontal (en-tête qui passe à la ligne + grille 2-col → 1 col), MESURÉ au harnais headless',
  stage: 'Diagnostic déterministe (harnais headless Edge, viewport 375px) : le débordement horizontal (~113px) ne venait PAS de la carte (son override 44px/1fr/1fr s\'appliquait bien) mais de l\'EN-TÊTE de la page Comptes (titre « Gestion des Utilisateurs » + champ recherche + select 120px en flex sans wrap) et de la grille 2-colonnes repeat(auto-fit, minmax(300px,1fr)). Le scroll naturel (.328, overflow:visible) ne faisait que RÉVÉLER ce débordement intrinsèque préexistant (avant, overflow-x:hidden le masquait en coupant la carte à droite). Fix (admin-responsive.css, ≤1024px) : en-tête en flex-wrap (recherche pleine largeur, champs min-width:0) + grille passée à 1 colonne. Vérifié au harnais : débordement = 0px de 360 à 1280px ; desktop ≥1025px inchangé. Méthode : on MESURE, on ne devine plus.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.332 - Admin mobile : page Comptes sans scroll horizontal (en-tête wrap + grille 1 colonne)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
