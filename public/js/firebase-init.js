/**
 * =======================================================================
 * 1. CONFIGURATION & INITIALISATION FIREBASE (V9 Modulaire - Vanilla JS)
 * =======================================================================
 * Note: Intègre Firestore Local Cache et Analytics. (App Check temporairement désactivé)
 */

// Importation native depuis le CDN Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
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
const analytics = getAnalytics(app);

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

console.log("🔥 Firebase SBI initialisé avec succès : Cache & Analytics Actifs");

/* --- 1.6 EXPORTATION DES SERVICES --- */
// Permet d'utiliser ces variables dans main.js, admin.js, auth.js, etc.
export { app, auth, db, storage, analytics };
