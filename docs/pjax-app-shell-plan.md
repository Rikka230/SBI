# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0L.2

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

## Routes PJAX actuellement actives

Admin :

- `/admin/index.html?tab=...`
- `/admin/site-index-settings.html`
- `/admin/formations-cours.html`
- `/admin/admin-profile.html`

Student :

- `/student/dashboard.html`
- `/student/mes-cours.html`
- `/student/mon-profil.html`

Teacher :

- `/teacher/dashboard.html`
- `/teacher/mes-cours.html`
- `/teacher/mon-profil.html`

## 8.0L.2

- Harmonisation du chrome admin.
- Le style des panneaux gauche/droit/topbar n'est plus réservé au dashboard.
- Formations & Cours admin récupère le même look cockpit que Dashboard / Profil.
- Gestion médias / Stockage dans l'index admin garde aussi le chrome admin.
- `theme.js` lit maintenant l'URL effective du shell PJAX quand disponible.
- Ajout de `/admin/css/sbi-admin-chrome-harmonization.css`.
- Version actuelle : `SBI 8.0L.2 - PJAX APP SHELL TEST`.

## Routes encore protégées

- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`
- `/admin/formations-live.html`
