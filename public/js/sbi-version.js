/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.270',
  branch: 'main',
  channel: 'Plan B - suivi eleves / Qualiopi',
  stage: 'heures de connexion: champ users.connectionHours editable UNIQUEMENT par le compte Supreme (God) depuis la modale edition compte (adminUpdateUserAccount god-only + audit) ; affiche sur la fiche eleve, le CSV et le registre PDF',
  updatedAt: '2026-05-31',
  label: 'SBI 8.0P.167.270 - heures de connexion (god-only) + affichage ecran retard'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
