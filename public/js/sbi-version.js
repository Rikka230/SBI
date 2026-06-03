/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.304',
  branch: 'main',
  channel: 'Complétude de compte : raffinements badge (cercle, élèves only, sur le profil)',
  stage: 'Raffinements suite QA : (1) badge ✗ = petit cercle rouge discret (au lieu d un gros carré) ; (2) badge AUSSI affiché à côté du nom sur la page profil élève (rafraîchi après recalcul) ; (3) badge réservé aux ÉLÈVES uniquement (gate role student dans renderCompletenessBadge) — plus de badge sur prof/admin/tuteur. Base : complétude serveur (CF recomputeAccountCompleteness, users.completeness) + panel profil épuré (jauge+checklist) + badge global (roster/retard/recherche/liste comptes).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.304 - Complétude : badge cercle discret, élèves only, affiché sur le profil'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
