/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.323',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : nav fluide (onglets ?tab sans saut) + dégagement bas global + carte Comptes repensée',
  stage: 'Trois points QA admin mobile : (1) NAV — plus de « saut » en revenant sur Tableau de bord/Formations/Serveur : si on est déjà sur index.html, la bottom-nav bascule l\'onglet EN PLACE (délégation à l\'item de nav gauche correspondant via data-target → switchToTab du shell), pas de rechargement ; (2) DÉGAGEMENT — le bas de page reste toujours au-dessus de la capsule (#main-content padding-bottom ~112px) pour ne plus bloquer les derniers éléments ; (3) COMPTES — vraie carte de gestion mobile (avatar + nom titre, email/activité, badges statut en pastilles, actions Voir/Éditer tactiles ≥44px), repensée selon ui-ux-pro-max. CSS + bottom-nav.js ; cache index.js?v=323 → bottom-nav.js?v=323 + sbi-bottom-nav.css?v=323 + admin-responsive.css?v=323.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.323 - Admin mobile : nav onglets sans saut + dégagement bas + carte Comptes repensée'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
