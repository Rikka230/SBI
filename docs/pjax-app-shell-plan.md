# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0I.1

Le PJAX est activé par défaut sur la branche labo.

## Interrupteurs de secours

Désactiver PJAX :

```js
window.SBI_DISABLE_PJAX()
```

Réactiver PJAX :

```js
window.SBI_ENABLE_PJAX()
```

## Diagnostics console

Tester une URL avec affichage lisible :

```js
window.SBI_PJAX_CHECK('/student/mes-cours.html')
window.SBI_PJAX_CHECK('/student/cours-viewer.html?id=test')
```

Lister les routes :

```js
window.SBI_PJAX_ROUTES()
```

Aide :

```js
window.SBI_PJAX_HELP()
```

Activer les logs détaillés :

```js
localStorage.setItem('sbiPjaxDebug', 'true')
location.reload()
```

## Routes PJAX actuellement actives

Admin :

- `/admin/index.html?tab=...`
- `/admin/site-index-settings.html`
- `/admin/admin-profile.html`

Student :

- `/student/dashboard.html`
- `/student/mes-cours.html`
- `/student/mon-profil.html`

Teacher :

- `/teacher/dashboard.html`
- `/teacher/mon-profil.html`

## Routes protégées en reload classique

- `/admin/formations-cours.html`
- `/teacher/mes-cours.html`
- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`
- `/admin/formations-live.html`
- `/admin/repair-access.html`
- `/change-email.html`
- `/login.html`

## 8.0I.1

- Le routeur ne touche plus aux clics non PJAX.
- Les diagnostics sont plus lisibles via `SBI_PJAX_CHECK`.
- Les routes protégées restent en reload classique, sans interception parasite du routeur.
- Version actuelle : `SBI 8.0I.1 - PJAX APP SHELL TEST`.

## Nettoyage manuel recommandé

Supprimer à la racine du repo si présent :

```txt
SBI-8.0F-pjax-student-shell-patch/
```

Ce dossier vient d'un ancien ZIP patch décompressé et ne doit pas rester dans la branche.
