/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.272',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'temps de connexion affiche en duree lisible (45 min / 1 h 30) sur fiche eleve + registre PDF (leve l ambiguite minutes/heures sous 1 h) ; CSV garde la valeur numerique en heures',
  updatedAt: '2026-06-01',
  label: 'SBI 8.0P.167.272 - temps connexion en duree lisible (min/heures) sur fiche + PDF'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
