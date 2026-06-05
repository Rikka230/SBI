/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.350',
  branch: 'feature-group-conversations',
  channel: 'Messagerie : ping cloche/assistant étendu aux GROUPES (perso + salons formation) — avant, le trigger ne notifiait que les DM, donc un message de groupe ne créait aucune notif (rien sur mobile « comme si pas de nouveau message »). Notif affiche le nom du groupe. + groupes personnalisés (profs/admin).',
  stage: 'Nouvelle messagerie interne (distincte des notifications/emails). Modèle hybride : Cloud Functions (openDirectConversation / ensureGroupChannel / sendAdminAnnouncement) OUVRENT et valident la conversation, puis le client écrit les messages EN DIRECT (onSnapshot temps réel, comme le chat des lives). Règles Firestore conversations/{cid} (kind dm/group/announcement) + sous-collections messages (sender==uid + membre + non-announcement) et reads/{uid} (pointeur non-lus). Trigger onMessagingMessageCreated : dénormalise lastMessage* + ping cloche en DM. Pages : student/messagerie.html, teacher/messagerie.html (module partagé js/messaging/messaging-ui.js) + admin/admin-messagerie.html (composer d\'annonces). Nav-manifest + 2 types de notif (new_message, admin_announcement). Admin (god) lit tout (modération/Qualiopi).',
  updatedAt: '2026-06-05',
  label: 'SBI 8.0P.167.350 - Messagerie : ping cloche/assistant des groupes + nom du groupe dans la notif'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
