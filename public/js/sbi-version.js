/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.346',
  branch: 'feature-messagerie',
  channel: 'Messagerie : aperçu « dernier message » + non-lu fiables (le client dénormalise lastMessage* car le trigger eur3/europe-west1 ne se déclenchait pas) ; croix « supprimer » sur chaque notification (tous types). FOUC élève/prof : toujours en cours d\'investigation.',
  stage: 'Nouvelle messagerie interne (distincte des notifications/emails). Modèle hybride : Cloud Functions (openDirectConversation / ensureGroupChannel / sendAdminAnnouncement) OUVRENT et valident la conversation, puis le client écrit les messages EN DIRECT (onSnapshot temps réel, comme le chat des lives). Règles Firestore conversations/{cid} (kind dm/group/announcement) + sous-collections messages (sender==uid + membre + non-announcement) et reads/{uid} (pointeur non-lus). Trigger onMessagingMessageCreated : dénormalise lastMessage* + ping cloche en DM. Pages : student/messagerie.html, teacher/messagerie.html (module partagé js/messaging/messaging-ui.js) + admin/admin-messagerie.html (composer d\'annonces). Nav-manifest + 2 types de notif (new_message, admin_announcement). Admin (god) lit tout (modération/Qualiopi).',
  updatedAt: '2026-06-05',
  label: 'SBI 8.0P.167.346 - Messagerie : aperçu/non-lu fiables (bump client) + croix supprimer sur les notifications'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
