# SBI Refactor Map

Version chantier : 8.0I
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

### 8.0F.2 - Inline style guard PJAX

Statut : validé.

- Injection des blocs `<style>` du document cible.

### 8.0G - Teacher shell léger

Statut : validé.

- Routes PJAX pour `/teacher/dashboard.html` et `/teacher/mon-profil.html`.

### 8.0G.1 - Active nav sync PJAX

Statut : validé.

- Synchronisation active globale admin / student / teacher après navigation PJAX.

### 8.0H - Student profile shell

Statut : validé.

- Route PJAX pour `/student/mon-profil.html`.

### 8.0H.1 - Profile PJAX polish

Statut : validé.

- Données privées révélées plus tôt.
- Avatar topbar rafraîchi après modification.

### 8.0I - Route guard & diagnostics

Statut : patch préparé.

Objectif : consolider les routes avant d'approcher les zones sensibles.

Changements :

- Ajout de `public/js/app-shell/route-guards.js`.
- Protection explicite des routes sensibles en reload classique.
- Diagnostic console :
  - `window.SBI_PJAX_STATUS('/url')`
  - `window.SBI_PJAX_ROUTES()`
- Événement fallback : `sbi:app-shell:fallback`.
- Version centralisée passée en `8.0I`.

Pages encore hors PJAX :

- éditeur cours admin/prof ;
- viewer ;
- Quill ;
- quiz.
