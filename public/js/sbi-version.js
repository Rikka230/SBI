/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.369',
  branch: 'fix-viewer-mobile-nav-tdz',
  channel: 'Messagerie : CORRECTIF requête DM. La requête `conversations where participants array-contains uid` était refusée (règle list via canReadConversation = OR de get() que l\'analyseur Firestore rejette) → les DM ne s\'affichaient QUE depuis le cache (visibles sur PC déjà chargé, INVISIBLES sur un appareil neuf comme le tél). Règle list passée au motif CANONIQUE array-contains (vérif directe du tableau participants). + pastille nav non-lus + groupes.',
  stage: 'Nouvelle messagerie interne (distincte des notifications/emails). Modèle hybride : Cloud Functions (openDirectConversation / ensureGroupChannel / sendAdminAnnouncement) OUVRENT et valident la conversation, puis le client écrit les messages EN DIRECT (onSnapshot temps réel, comme le chat des lives). Règles Firestore conversations/{cid} (kind dm/group/announcement) + sous-collections messages (sender==uid + membre + non-announcement) et reads/{uid} (pointeur non-lus). Trigger onMessagingMessageCreated : dénormalise lastMessage* + ping cloche en DM. Pages : student/messagerie.html, teacher/messagerie.html (module partagé js/messaging/messaging-ui.js) + admin/admin-messagerie.html (composer d\'annonces). Nav-manifest + 2 types de notif (new_message, admin_announcement). Admin (god) lit tout (modération/Qualiopi).',
  updatedAt: '2026-06-14',
  label: 'SBI 8.0P.167.369 - Visualiseuse mobile : minuteur/actions dans la capsule (slot Suiv.), barre du bas masquee. CORRIGE le bug des incidents .367/.368 : la variable d etat de la capsule etait declaree (let) APRES son usage par resetViewerState appelee des l evaluation du module (autoMount) => ReferenceError TDZ qui figeait la lecon sur Preparation. Variable remontee en tete de module. Reproduit et valide en navigateur headless (login prof, rendu OK).'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
