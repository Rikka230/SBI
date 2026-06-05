/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.334',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : carte Comptes propre (nom enroulé → badge complétude visible) + grilles TABLE desktop gardées ≥1025px (fin du conflit double-source) — harnais FIDÈLE prouve 0 débordement',
  stage: 'Harnais headless FIDÈLE (vraie page admin-accounts.html + TOUS les CSS dont sbi-bottom-nav.css/sbi-admin-single-scroll.css + classes body réelles + lignes riches) : la page Comptes déployée NE déborde PAS (0px à 360/390/414/768/1024), la carte fait 278-332px et tient, le rendu est propre (cf. capture). Donc le « toujours trop large » vient très probablement du CACHE de l\'appareil (session ouverte / PJAX ne recharge pas le CSS statique). Corrections au passage : admin-accounts.css avait DEUX grilles TABLE 6-col en !important SANS media query (L337/L441) qui polluaient le mobile (contain/content-visibility/min-height) → gardées ≥1025px ; le nom de la carte passe en white-space:normal (au lieu de nowrap qui tronquait nom+badge) → badge complétude ✗ enfin visible. À confirmer : screenshot ?diagwidth sur appareil RÉEL (full reload) pour valider 0 débordement chez le client.',
  updatedAt: '2026-06-05',
  label: 'SBI 8.0P.167.334 - Admin mobile : carte Comptes propre (nom enroulé + badge visible) + grilles desktop gardées ≥1025px'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
