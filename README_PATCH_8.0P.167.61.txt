SBI 8.0P.167.61 - ADMIN PROFILE PJAX TARGET LOCK

Objectif:
- Corriger le profil admin qui se remonte/recharge sans conserver l UID cible après navigation PJAX depuis Comptes.
- Sécuriser le retour Profil -> Comptes et le bouton Editer après retour.

Fichiers modifiés:
- public/admin/admin-accounts.html
- public/admin/admin-audit-log.html
- public/admin/admin-profile.html
- public/admin/admin-promotions.html
- public/admin/formations-cours.html
- public/admin/index.html
- public/admin/site-index-settings.html
- public/js/profile-core.js
- public/js/sbi-version.js
- public/js/app-shell/app-shell.js
- public/js/app-shell/route-registry.js
- public/admin/js/admin-accounts-dashboard.js
- public/admin/js/admin-core.js
- public/admin/js/admin-ui.js
- public/admin/js/components.js

Déploiement:
firebase deploy --only hosting --project sbi-web-4f6b4
