/**
 * =======================================================================
 * CONFIGURATION & INITIALISATION FIREBASE (V9 Modulaire - Vanilla JS)
 * =======================================================================
 * Note :
 * - Firestore Local Cache actif
 * - Analytics désactivé par défaut pour éviter les erreurs console
 *   ERR_BLOCKED_BY_CLIENT quand un bloqueur pub/anti-tracking est présent.
 * - Pour tester Analytics manuellement :
 *   localStorage.setItem('SBI_ENABLE_ANALYTICS', '1') puis recharger la page.
 */

// Importation native depuis le CDN Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// L'import de AppCheck est commenté pour l'instant
// import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app-check.js";

/* --- 1.1 VARIABLES D'ENVIRONNEMENT SBI --- */
const firebaseConfig = {
  apiKey: "AIzaSyBCBY51kkexg7jJgEpVYlKCNbZemrtdaiY",
  authDomain: "sbi-web-4f6b4.firebaseapp.com",
  projectId: "sbi-web-4f6b4",
  storageBucket: "sbi-web-4f6b4.firebasestorage.app",
  messagingSenderId: "311486959439",
  appId: "1:311486959439:web:fc9be1d8f07f51cf24bf3a",
  measurementId: "G-18FFEP69N9"
};

/* --- 1.2 INITIALISATION DE L'APPLICATION --- */
const app = initializeApp(firebaseConfig);

/* --- 1.3 BOUCLIER ANTI-BOT (APP CHECK avec reCAPTCHA v3) --- */
// DESACTIVE POUR LES TESTS : À réactiver quand la vraie clé Google reCAPTCHA sera générée
/*
const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('TA_CLE_PUBLIQUE_RECAPTCHA_V3_ICI'),
    isTokenAutoRefreshEnabled: true
});
*/

/* --- 1.4 INITIALISATION DE FIRESTORE AVEC MISE EN CACHE --- */
// Forçage du cache local pour limiter les requêtes de lecture facturables
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

/* --- 1.5 INITIALISATION AUTH & STORAGE --- */
const auth = getAuth(app);
const storage = getStorage(app);

/* --- 1.6 ANALYTICS OPTIONNEL --- */
let analytics = null;

const shouldEnableAnalytics = () => {
    try {
        return window.localStorage.getItem('SBI_ENABLE_ANALYTICS') === '1';
    } catch (error) {
        return false;
    }
};

if (shouldEnableAnalytics()) {
    import("https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js")
        .then(async ({ getAnalytics, isSupported }) => {
            const supported = typeof isSupported === 'function'
                ? await isSupported()
                : true;

            if (!supported) {
                console.warn('[SBI Firebase] Analytics non supporté par ce navigateur.');
                return;
            }

            analytics = getAnalytics(app);
            console.log('Firebase Analytics SBI activé manuellement.');
        })
        .catch((error) => {
            console.warn('[SBI Firebase] Analytics désactivé :', error);
        });
}

/* --- 1.7 MÉDIAS DYNAMIQUES INDEX PUBLIC --- */
const path = window.location.pathname.toLowerCase();
const isPublicIndex = path === '/' || path.endsWith('/index.html') || path === '/index.html';

if (isPublicIndex) {
    import('/js/site-index-public.js').catch((error) => {
        console.warn('[SBI Index] Configuration médias dynamique indisponible :', error);
    });
}

console.log("Firebase SBI initialisé avec succès : Cache actif");

/* --- 1.8 EXPORTATION DES SERVICES --- */
// Permet d'utiliser ces variables dans main.js, admin.js, auth.js, etc.
export { app, auth, db, storage, analytics };
