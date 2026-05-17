SBI 8.0P.167.62 - Admin profile PJAX target lock / no hard reload

Objectif : corriger le bug Comptes -> Profil eleve ou le profil commence a charger puis le shell PJAX saute en reload complet.

Changements :
- verrouille l'UID cible avant navigation depuis Comptes ;
- transmet explicitement targetUid / targetUrl a profile-core ;
- empeche un ancien montage async de profil de continuer apres remount ;
- rend Cropper non critique en PJAX pour eviter un fallback reload si le CDN echoue ;
- evite le fallback reload force si l'import/montage profile-core echoue apres injection DOM ;
- cache-bust admin-ui/app-shell/route-registry/profile-core/components/admin-core/admin-accounts-dashboard ;
- bump version centrale en 8.0P.167.62.

Deploy : hosting seulement.
