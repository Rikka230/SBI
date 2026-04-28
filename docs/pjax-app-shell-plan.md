# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## Principe

Le PJAX complet ne doit pas être appliqué en bloc. Cette branche pose un app shell progressif avec fallback reload.

## État 8.0I

Le PJAX est activé par défaut sur la branche labo.

## Interrupteurs de secours

Désactiver PJAX :

```js
window.SBI_DISABLE_PJAX()
```

Ou :

```js
localStorage.setItem('sbiPjaxDisabled', 'true')
location.reload()
```

Réactiver PJAX :

```js
window.SBI_ENABLE_PJAX()
```

Ou :

```js
localStorage.removeItem('sbiPjaxDisabled')
location.reload()
```

## Diagnostics

Savoir si une URL passe en PJAX ou reload :

```js
window.SBI_PJAX_STATUS('/student/mes-cours.html')
window.SBI_PJAX_STATUS('/student/cours-viewer.html?id=xxx')
```

Lister les routes :

```js
window.SBI_PJAX_ROUTES()
```

Activer les logs :

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

## 8.0I

- Ajout de `public/js/app-shell/route-guards.js`.
- Ajout d'un diagnostic `window.SBI_PJAX_STATUS()`.
- Ajout d'un listing `window.SBI_PJAX_ROUTES()`.
- Le routeur émet `sbi:app-shell:fallback` quand une route reste en reload classique.
- Les zones sensibles sont protégées explicitement.
- Version actuelle : `SBI 8.0I - PJAX APP SHELL TEST`.

## Règles de sécurité

- Ne pas réactiver `sbi-internal-shell.js`.
- Chaque route migrée doit fournir un démontage propre.
- Une erreur routeur doit retomber en reload classique.
- Les listeners Firestore doivent être enregistrés dans un listener bag.
- Les pages éditeur, viewer, quiz et Quill restent en reload classique tant qu’elles n’ont pas leur lifecycle dédié.
