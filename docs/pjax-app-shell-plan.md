# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## Principe

Le PJAX complet ne doit pas être appliqué en bloc. Cette branche pose un app shell progressif avec fallback reload.

## État 8.0E

Depuis 8.0E, le PJAX est activé par défaut sur la branche labo.

## Interrupteurs de secours

Désactiver PJAX :

```js
localStorage.setItem('sbiPjaxDisabled', 'true')
location.reload()
```

Ou :

```js
window.SBI_DISABLE_PJAX()
```

Réactiver PJAX :

```js
localStorage.removeItem('sbiPjaxDisabled')
location.reload()
```

Ou :

```js
window.SBI_ENABLE_PJAX()
```

Via URL :

```txt
?sbiPjax=0  désactive
?sbiPjax=1  réactive
```

Debug :

```js
localStorage.setItem('sbiPjaxDebug', 'true')
```

## Version badge

Depuis 8.0C, l'encart de version est piloté par :

- `public/js/sbi-version.js`
- `public/js/sbi-version-badge.js`

À chaque patch, mettre à jour `SBI_VERSION` pour confirmer visuellement la build chargée dans Firebase Preview.

## Routes PJAX actuellement actives

- `/admin/index.html?tab=...`
- `/admin/site-index-settings.html`
- `/admin/admin-profile.html`

## 8.0D.1

- Cache DOM de l'index admin avant départ vers Profil ou Gestion Accueil.
- Restauration du vrai DOM de l'index admin au retour.
- Objectif : retour instantané sur l'onglet Utilisateurs, sans attendre le prochain refresh Firestore.

## 8.0E

- PJAX activé par défaut.
- Suppression de l'obligation de coller `localStorage.setItem('sbiPjaxEnabled', 'true')`.
- Ajout d'un kill switch propre via `sbiPjaxDisabled`.
- Version actuelle : `SBI 8.0E - PJAX APP SHELL TEST`.

## Règles de sécurité

- Ne pas réactiver `sbi-internal-shell.js`.
- Chaque route migrée doit fournir un démontage propre.
- Une erreur routeur doit retomber en reload classique.
- Les listeners Firestore doivent être enregistrés dans un listener bag.
- Les pages éditeur, viewer, quiz et Quill restent en reload classique tant qu’elles n’ont pas leur lifecycle dédié.
