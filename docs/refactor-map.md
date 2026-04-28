# SBI Refactor Map

Version chantier : 8.0D.1
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

- Routeur désactivé par défaut.
- Activation locale via `localStorage.setItem('sbiPjaxEnabled', 'true')`.
- Fallback reload complet pour toute route non migrée.
- Première route sûre limitée aux onglets admin déjà montés.

### 8.0B - Admin shell : Gestion Accueil

Statut : validé.

- Route PJAX pour `/admin/site-index-settings.html`.
- Refactor `site-index-settings.js` en fonction montable avec cleanup.
- Retour vers `/admin/index.html?tab=...`.

### 8.0C - Version badge centralisé

Statut : validé.

- `public/js/sbi-version.js`.
- `public/js/sbi-version-badge.js`.
- Badge version fiable pour Firebase Preview.

### 8.0D - Admin shell : Mon Profil

Statut : validé avec remarque performance retour Utilisateurs.

- Route PJAX pour `/admin/admin-profile.html`.
- `profile-core.js` compatible `mountProfileCore()`.
- Cleanup présence/auth profil.
- CropperJS chargé si nécessaire.

### 8.0D.1 - Cache retour Utilisateurs

Statut : patch préparé.

Objectif : corriger le retour lent vers l'onglet Utilisateurs après Profil ou Gestion Accueil.

Changements :

- Cache du DOM réel de `#main-content` quand l'utilisateur quitte `/admin/index.html`.
- Restauration de ce DOM au retour vers `/admin/index.html`.
- Conservation des cartes utilisateurs déjà rendues et de leurs listeners.
- Version centralisée passée en `8.0D.1`.

Pages encore hors PJAX :

- éditeur cours ;
- viewer ;
- Quill ;
- quiz ;
- pages student / teacher.
