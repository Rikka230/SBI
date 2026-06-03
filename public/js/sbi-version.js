/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.296',
  branch: 'main',
  channel: 'Livret apprentissage : fix pagedjs + dates periodes prorata + cron retard',
  stage: 'FIX dossier PDF (suite) : pagedjs charge par chemin absolu (son champ exports ne publie pas de sous-chemin -> require.resolve echouait) + pagination EXPLICITE via Paged.Previewer().preview() (plus fiable que l auto-run apres setContent). Combine au fix Chromium .default (.294), le sommaire pagine + annexes hybrides fonctionnent. NOUVEAU : dates des 6 periodes calculees AU PRORATA des dates de contrat (sinon promotion) a la generation + callable admin recomputeApprenticeshipBookletPeriodDates (bouton "Calculer les dates au prorata") ; CRON quotidien notifyOverdueBookletPeriods qui notifie eleve/tuteur/profs/admin quand une periode est en retard et vide (type notif booklet_period_overdue). serverTimestamp jamais dans un array (Timestamp.now).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.296 - Livret : fix pagedjs (sommaire/annexes) + dates periodes prorata + cron retard'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
