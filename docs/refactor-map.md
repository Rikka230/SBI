# SBI Refactor Map

Version chantier : 8.0M.2
Branche de travail : `pjax-app-shell-test`

## 8.0M.2 - Access recovery & formation modal guard

Statut : patch préparé.

Objectif : corriger deux régressions constatées après les derniers tests :

1. Élève qui ne voit qu'une partie de ses cours.
2. Panel d'assignation formation qui clique dans le vide côté admin.

## Changements

### `public/js/learning-access.js`

- Ajout `fetchCoursesByScalarField()`.
- Ajout `fetchCoursesByClientScan()`.
- `fetchCoursesByFormationKeys()` couvre désormais les champs legacy/scalaires.
- `loadCoursesForUser()` ajoute un fallback client-side quand les champs de formation des anciens cours ne matchent pas les requêtes modernes.

### `public/js/app-shell/route-registry.js`

- `#formation-modal` est réinjecté via `replaceRouteNodeFromDocument()` pour :
  - `mountAdminCourses()`
  - `mountTeacherCourses()`

### `public/admin/js/courses/course-formations-ui.js`

- Les boutons `Modifier les accès` utilisent `e.currentTarget`.
- Warning explicite si `#formation-modal` manque.

## Points à tester

- Élève → Mes Cours :
  - vérifier toutes les formations/cours attendus.
- Admin → Formations & Cours :
  - bouton Modifier les accès ouvre bien le modal.
  - assigner/désassigner un élève.
  - sauvegarder.
- Revenir côté élève :
  - vérifier que les cours sont visibles.
- Console :
  - pas d'erreur silencieuse.
  - warning uniquement si modal absent.

## Note

Le viewer n'est pas modifié par ce patch.
