/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.271',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'temps de connexion: utilise users.totalConnectionTime (auto-tracke par tracker.js, secondes) au lieu d un champ manuel ; correction god-only via adminUpdateUserAccount ; affiche en heures sur fiche/CSV/registre + lien direct profil eleve (admin-profile.html?id=) depuis retard',
  updatedAt: '2026-06-01',
  label: 'SBI 8.0P.167.271 - temps connexion auto (totalConnectionTime) + lien profil eleve depuis retard'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
