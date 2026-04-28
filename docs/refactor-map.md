# SBI Refactor Map

Version chantier : 8.0F.2
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

## Module à ne pas réactiver sans test

- `public/admin/js/sbi-internal-shell.js`
  - tentative shell/PJAX partielle.
  - statut : désactivé.
  - raison : probable contribution à une page blanche étudiant.

## Étapes PJAX

### 8.0A - App shell foundation

Statut : validé.

- Routeur expérimental.
- Fallback reload complet pour toute route non migrée.
- Première route sûre limitée aux onglets admin déjà montés.

### 8.0B - Admin shell : Gestion Accueil

Statut : validé.

- Route PJAX pour `/admin/site-index-settings.html`.
- Refactor `site-index-settings.js` en fonction montable avec cleanup.

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
- Restauration de ce DOM au retour vers `/admin/index.html`.

### 8.0E - PJAX activé par défaut

Statut : validé.

- PJAX activé par défaut sur `pjax-app-shell-test`.
- Kill switch `window.SBI_DISABLE_PJAX()`.

### 8.0F - Student shell

Statut : validé globalement.

- Routes PJAX pour `/student/dashboard.html` et `/student/mes-cours.html`.
- `student-hub.js` montable via `mountStudentHub()`.
- `mes-cours.js` montable via `mountStudentCourses()`.
- Viewer de cours laissé hors PJAX.

### 8.0F.1 - CSS guard PJAX

Statut : insuffisant.

- Attendait les fichiers CSS `<link>`.
- Ne couvrait pas les styles inline `<style>` dans le `<head>`.

### 8.0F.2 - Inline style guard PJAX

Statut : patch préparé.

Objectif : corriger le style incomplet sur le premier passage vers Mes Cours.

Changements :

- `ensureDocumentStyles()` injecte maintenant les blocs `<style>` du document cible.
- Les styles inline sont dédupliqués via clé de hash.
- Corrige notamment `.formation-folder`, `.course-item`, `.progress-bar-bg`.
- Version centralisée passée en `8.0F.2`.

Pages encore hors PJAX :

- éditeur cours ;
- viewer ;
- Quill ;
- quiz ;
- teacher.
