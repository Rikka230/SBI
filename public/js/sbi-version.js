/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.357',
  branch: 'feature-live-scripts',
  channel: 'Messagerie : CORRECTIF requête DM. La requête `conversations where participants array-contains uid` était refusée (règle list via canReadConversation = OR de get() que l\'analyseur Firestore rejette) → les DM ne s\'affichaient QUE depuis le cache (visibles sur PC déjà chargé, INVISIBLES sur un appareil neuf comme le tél). Règle list passée au motif CANONIQUE array-contains (vérif directe du tableau participants). + pastille nav non-lus + groupes.',
  stage: 'Nouvelle messagerie interne (distincte des notifications/emails). Modèle hybride : Cloud Functions (openDirectConversation / ensureGroupChannel / sendAdminAnnouncement) OUVRENT et valident la conversation, puis le client écrit les messages EN DIRECT (onSnapshot temps réel, comme le chat des lives). Règles Firestore conversations/{cid} (kind dm/group/announcement) + sous-collections messages (sender==uid + membre + non-announcement) et reads/{uid} (pointeur non-lus). Trigger onMessagingMessageCreated : dénormalise lastMessage* + ping cloche en DM. Pages : student/messagerie.html, teacher/messagerie.html (module partagé js/messaging/messaging-ui.js) + admin/admin-messagerie.html (composer d\'annonces). Nav-manifest + 2 types de notif (new_message, admin_announcement). Admin (god) lit tout (modération/Qualiopi).',
  updatedAt: '2026-06-11',
  label: 'SBI 8.0P.167.357 - Scripts de live : PDF de déroulé attaché à un live du cursus (scheduler V2, profs/admins, jamais élèves) + consigne devoirs multiligne (CF)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
