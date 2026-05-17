# SBI 8.0P.167.57 — Patch admin Comptes & accès

## Objectif

Corriger le lag progressif de l’onglet Comptes et sortir Comptes & accès de `public/admin/index.html` vers une page dédiée PJAX, comme le Journal admin.

## Cause prioritaire corrigée

`public/admin/js/admin-accounts-dashboard.js` relançait `requestAnimationFrame` en boucle infinie dans `scheduleEnhanceRenderedAccountRows()` au lieu d’exécuter l’enhancement des lignes une fois par rendu.

## Modifications principales

- Nouvelle page dédiée : `public/admin/admin-accounts.html`.
- Retrait du bloc `view-users` et du modal édition de `public/admin/index.html`.
- Redirection legacy `/admin/index.html?tab=view-users` vers `/admin/admin-accounts.html`.
- Route PJAX dédiée `admin-accounts` dans `route-registry.js`.
- Navigation gauche “Comptes” pointée vers `/admin/admin-accounts.html`.
- Correction du scheduler RAF infini.
- Suppression du `MutationObserver` global de `components.js` pour les comptes.
- Cache-bust `components.js`, `admin-core.js`, `admin-accounts-dashboard.js`, `admin-accounts.css` en `8.0P.167.57`.
- Ajout cleanup PJAX pour déconnecter le listener users quand on quitte la page Comptes.
- Version centrale : `8.0P.167.57`.

## Tests rapides effectués

- `node --check` OK sur les fichiers JS modifiés.
- Vérification simple HTML : `index.html` ne contient plus `view-users` ni `edit-user-modal`; `admin-accounts.html` contient bien les deux.
- Recherche : plus de `admin-accounts-dashboard.js?v=8.0P.167.56`, `components.js?v=8.0P.167.56`, ni `admin-core.js?v=8.0P.167.28` dans les fichiers patchés.

## Tests à faire en preview Firebase

1. Ouvrir `/admin/admin-accounts.html` directement.
2. Depuis le dashboard admin, cliquer “Comptes” et vérifier navigation PJAX.
3. Depuis Comptes, ouvrir un profil puis revenir via breadcrumb “Comptes”.
4. Rester 3 à 5 minutes sur Comptes : vérifier que le lag ne monte plus.
5. Créer, éditer, supprimer un compte test.
6. Vérifier les états : Email rejeté, Email invalide, Email suspect, Contact direct requis, Activité détectée, Mot de passe attendu.
7. Vérifier `/admin/index.html?tab=view-users` redirige vers `/admin/admin-accounts.html`.
