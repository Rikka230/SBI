# SBI Refactor Map

Version chantier : 8.0I.1
Branche de travail : `pjax-app-shell-test`
Branche stable : `main`

## Nettoyage manuel recommandé

Le ZIP reçu contient un dossier parasite à la racine :

```txt
SBI-8.0F-pjax-student-shell-patch/
```

À supprimer de la branche si visible sur GitHub. Ce dossier vient d'un ancien patch dézippé et ne fait pas partie du site.

## Étapes PJAX

### 8.0A à 8.0H.1

Statut : validé.

- Admin shell : index tabs, Gestion Accueil, profil.
- Student shell : dashboard, mes cours, profil.
- Teacher shell : dashboard, profil.
- PJAX activé par défaut.
- Active nav sync.
- Inline style guard.
- Profile polish.

### 8.0I - Route guard & diagnostics

Statut : retour utilisateur mitigé.

- Routes sensibles protégées.
- Diagnostics présents mais pas assez visibles.
- Impression de reloads parasites sur les routes volontairement protégées.

### 8.0I.1 - Diagnostics cleanup

Statut : patch préparé.

Objectif : garder la sécurité sans confusion.

Changements :

- Le routeur ne touche plus aux clics non PJAX.
- Les routes non migrées restent entièrement en navigation classique.
- Diagnostic lisible :
  - `window.SBI_PJAX_CHECK('/url')`
  - `window.SBI_PJAX_ROUTES()`
  - `window.SBI_PJAX_HELP()`
- Version centralisée passée en `8.0I.1`.

Pages encore hors PJAX :

- éditeur cours admin/prof ;
- viewer ;
- Quill ;
- quiz.
