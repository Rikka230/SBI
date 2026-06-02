/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.280',
  branch: 'main',
  channel: 'Refonte des notifications internes (cloche/bulle) : creation serveur + registre de types',
  stage: 'toutes les notifications internes sont desormais creees cote SERVEUR via une fabrique unique (Cloud Functions, ids deterministes, zero creation client => regles canCreateNotification:false). Le consommateur (admin-notifications.js) utilise un registre de types unique (rendu/icone/routage), avec fallback sur type inconnu ; fin du monkey-patch des alertes documents. Nouvelles notifs : devoir corrige -> eleve, depot -> profs, devoir en validation -> admin, replay dispo -> eleves. Notifs cours (validation/publication/refus/suppression) routees vers la CF emitCourseWorkflowNotifications + new_course_for_teacher cote serveur.',
  updatedAt: '2026-06-02',
  label: 'SBI 8.0P.167.280 - refonte notifications internes (creation serveur unique + registre + Devoirs/Live)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
