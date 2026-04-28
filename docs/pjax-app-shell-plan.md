# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## Principe

Le PJAX complet ne doit pas être appliqué en bloc. Cette branche pose un app shell progressif avec fallback reload.

## État 8.0G

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

## Routes PJAX actuellement actives

Admin :

- `/admin/index.html?tab=...`
- `/admin/site-index-settings.html`
- `/admin/admin-profile.html`

Student :

- `/student/dashboard.html`
- `/student/mes-cours.html`

Teacher :

- `/teacher/dashboard.html`
- `/teacher/mon-profil.html`

## 8.0G

- Ajout du shell teacher léger.
- `teacher-dashboard.js` expose `mountTeacherDashboard()` avec cleanup.
- Navigation fluide entre Mon Espace et Mon Profil.
- `teacher/mes-cours.html` reste volontairement hors PJAX car il contient Quill + éditeur + `admin-courses.js`.
- Version actuelle : `SBI 8.0G - PJAX APP SHELL TEST`.

## Règles de sécurité

- Ne pas réactiver `sbi-internal-shell.js`.
- Chaque route migrée doit fournir un démontage propre.
- Une erreur routeur doit retomber en reload classique.
- Les listeners Firestore doivent être enregistrés dans un listener bag.
- Les pages éditeur, viewer, quiz et Quill restent en reload classique tant qu’elles n’ont pas leur lifecycle dédié.
