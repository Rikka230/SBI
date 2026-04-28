# SBI Refactor Map

Version chantier : 8.0H
Branche de travail : `pjax-app-shell-test`
Branche stable : `main`

## Objectif

Réorganiser progressivement SBI sans casser les espaces validés.

Priorités :

1. aucune page blanche ;
2. aucun accès formation/cours cassé ;
3. pas d'emoji dans les interfaces ;
4. fichiers lisibles et segmentés ;
5. refonte visuelle cohérente par rôle ;
6. médias lourds hors repo, pilotés par Storage/Firestore ;
7. navigation PJAX progressive avec fallback reload.

## Étapes PJAX

### 8.0A - App shell foundation

Statut : validé.

- Routeur expérimental.
- Fallback reload complet pour toute route non migrée.

### 8.0B - Admin shell : Gestion Accueil

Statut : validé.

- Route PJAX pour `/admin/site-index-settings.html`.

### 8.0C - Version badge centralisé

Statut : validé.

- Badge version fiable pour Firebase Preview.

### 8.0D - Admin shell : Mon Profil

Statut : validé.

- Route PJAX pour `/admin/admin-profile.html`.
- `profile-core.js` compatible `mountProfileCore()`.

### 8.0D.1 - Cache retour Utilisateurs

Statut : validé.

- Cache du DOM réel de `#main-content` quand l'utilisateur quitte `/admin/index.html`.

### 8.0E - PJAX activé par défaut

Statut : validé.

- PJAX activé par défaut sur `pjax-app-shell-test`.
- Kill switch `window.SBI_DISABLE_PJAX()`.

### 8.0F - Student shell

Statut : validé.

- Routes PJAX pour `/student/dashboard.html` et `/student/mes-cours.html`.
- Viewer de cours laissé hors PJAX.

### 8.0F.2 - Inline style guard PJAX

Statut : validé.

- Injection des blocs `<style>` du document cible.

### 8.0G - Teacher shell léger

Statut : validé.

- Routes PJAX pour `/teacher/dashboard.html` et `/teacher/mon-profil.html`.
- `teacher/mes-cours.html` reste hors PJAX.

### 8.0G.1 - Active nav sync PJAX

Statut : validé.

- Synchronisation active globale admin / student / teacher après navigation PJAX.

### 8.0H - Student profile shell

Statut : patch préparé.

Objectif : raccorder le profil élève au shell.

Changements :

- Route PJAX pour `/student/mon-profil.html`.
- Profil étudiant monté via `profile-core.js`.
- CropperJS chargé si nécessaire.
- Modal cropper injecté et nettoyé au changement de route.
- Onglets internes du profil rebondés côté shell pour éviter la dépendance au script inline.
- Version centralisée passée en `8.0H`.

Pages encore hors PJAX :

- éditeur cours admin/prof ;
- viewer ;
- Quill ;
- quiz.
