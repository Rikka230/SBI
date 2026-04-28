# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0L.1

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

## 8.0L.1

- Harmonisation visuelle des sous-menus admin/profil/éditeur.
- Correction du switch `Nouveau Cours` / `Edit` côté admin.
- Le shell gère maintenant les deux modèles d'onglets :
  - `.student-sub-nav-item` / `.student-view`
  - `.sub-nav-item` / `.course-section`
- Après ouverture éditeur, la vue active remonte proprement au début de l'éditeur.
- `repair-access.html` est supprimé directement de la branche `pjax-app-shell-test`.
- `repair-access.html` est retiré des routes protégées.
- Version actuelle : `SBI 8.0L.1 - PJAX APP SHELL TEST`.

## Routes encore protégées

- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`
- `/admin/formations-live.html`
