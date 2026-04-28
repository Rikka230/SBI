# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0J

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

```js
window.SBI_PJAX_CHECK('/student/mes-cours.html')
window.SBI_PJAX_CHECK('/teacher/mes-cours.html')
window.SBI_PJAX_ROUTES()
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

## 8.0J

- Préparation de l'éditeur de cours pour une future migration PJAX.
- `admin-courses.js` expose désormais `mountAdminCourses()`.
- Le montage classique au chargement de page est conservé.
- Ajout de `public/js/app-shell/course-editor-bridge.js`.
- Les routes éditeur restent protégées en reload classique dans ce patch.
- Version actuelle : `SBI 8.0J - PJAX APP SHELL TEST`.

## Routes encore protégées

- `/admin/formations-cours.html`
- `/teacher/mes-cours.html`
- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`

## Règles de sécurité

- Ne pas réactiver `sbi-internal-shell.js`.
- Chaque route migrée doit fournir un démontage propre.
- Les pages éditeur, viewer, quiz et Quill restent en reload classique tant qu’elles n’ont pas leur lifecycle dédié.
