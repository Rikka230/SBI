# SBI Refactor Map

Version chantier : 8.0K.4
Branche de travail : `pjax-app-shell-test`
Branche stable : `main`

## Étapes PJAX validées

- 8.0A : foundation.
- 8.0B : Gestion Accueil admin.
- 8.0C : badge version centralisé.
- 8.0D : profil admin.
- 8.0D.1 : cache retour utilisateurs.
- 8.0E : PJAX activé par défaut.
- 8.0F : student dashboard / mes cours.
- 8.0F.2 : inline style guard.
- 8.0G : teacher dashboard / profil.
- 8.0G.1 : active nav sync.
- 8.0H : profil étudiant.
- 8.0H.1 : polish profil.
- 8.0I.1 : diagnostics clean.
- 8.0J : foundation éditeur cours montable.
- 8.0K : teacher course editor PJAX.
- 8.0K.1 : labels Quill.
- 8.0K.2 : styled tooltips Quill.
- 8.0K.3 : tooltip portal.

## 8.0K.4 - Quill tooltip single bottom

Statut : patch préparé.

Objectif : corriger le double affichage haut/bas des tooltips Quill.

Changements :

- Réinjection forcée du style tooltip pour écraser les anciens styles.
- Neutralisation des pseudo-tooltips sur `.sbi-quill-tooltip-anchor`.
- Positionnement toujours sous l'outil.
- Suppression du placement automatique au-dessus.
- Retrait des `title` natifs à chaque montage.
- Aucun changement logique sur les contenus, uploads, sauvegardes ou publication.

Pages encore hors PJAX :

- éditeur cours admin ;
- viewer étudiant/prof/admin ;
- progression viewer ;
- quiz runtime.
