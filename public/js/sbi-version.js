/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.299',
  branch: 'main',
  channel: 'Livret : rappel debut de periode (notif+mail) + UX tuteur (logout reduit, recherche apprenti)',
  stage: 'NOUVEAU : rappel automatique en DEBUT de periode (cron notifyOverdueBookletPeriods etendu) -> notification cloche (type booklet_period_start) a eleve/tuteur/profs/admin + EMAIL Brevo eleve+tuteur, une seule fois (period.startNotifiedAt). UX tuteur : (a) panneau reduit -> icone de deconnexion/retour visible (CSS left-collapsed centre les boutons du bas) ; (b) barre de recherche tuteur ouvre uniquement le livret d un apprenti LIE (filtre loadBookletsForTutor -> /tutor/livret.html?id=). Type notif booklet_period_start ajoute au registre client.',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.299 - Livret : rappel debut periode (notif+mail) + UX tuteur (logout reduit / recherche apprenti lie)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
