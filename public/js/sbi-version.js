/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.331',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : CSS responsive en <link> STATIQUE no-cache (fin du FOUC + carte Comptes à la bonne largeur) + modulepreload de la version',
  stage: 'Correctif des deux symptômes (carte trop large + FOUC « icônes par défaut » ~1s au 1er chargement), même cause racine : admin-responsive.css livré trop tard. .330 (retrait des <link> statiques) était une ERREUR — il ne restait que l\'injection JS, tardive (après le fetch de version de l\'amorce async), donc la carte gardait sa grille desktop inline (large) et le contenu flashait non stylé. Vraie solution (Candidat B) : admin-responsive.css redevient un <link> STATIQUE dans le <head> des 17 pages, mais TOKENLESS + no-cache (firebase.json) → chargé avant le paint (pas de FOUC, carte à la bonne largeur dès le 1er rendu) ET toujours frais (plus de conflit ?v=325 périmé). Injection JS retirée de bottom-nav.js. + <link rel=modulepreload href=/js/sbi-version.js> avant components.js sur les 17 pages → annule le délai d\'amorçage introduit par l\'await du sceau (le fetch de version est déjà prêt → composants rendus aussi vite qu\'avant). Convergence A→B : livraison CSS unifiée sur la voie statique <head>, fraîcheur via no-cache (même mécanisme que le sceau).',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.331 - Admin mobile : admin-responsive.css en <link> statique no-cache (fin FOUC + largeur carte) + modulepreload version'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
