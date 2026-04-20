/**
 * =======================================================================
 * BACKEND FIREBASE (Cloud Functions)
 * =======================================================================
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialise le SDK Admin avec tous les droits suprêmes sur le projet
admin.initializeApp();

/**
 * --- 1. FONCTION DE SUPPRESSION INTEGRALE D'UN COMPTE ---
 * Supprime le compte Auth et le document Firestore.
 */
exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
    // 1.1 Sécurité : Vérifier que la requête vient d'un utilisateur connecté
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const callerUid = context.auth.uid; // L'UID de celui qui clique
    const targetUid = data.uid;         // L'UID de celui qui doit être supprimé

    if (!targetUid) {
        throw new functions.https.HttpsError('invalid-argument', 'UID cible manquant.');
    }

    const db = admin.firestore();

    try {
        // 1.2 Récupération du profil de l'Admin qui fait la demande
        const callerDoc = await db.collection('users').doc(callerUid).get();
        const callerData = callerDoc.data();

        if (!callerData || callerData.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Seuls les administrateurs peuvent supprimer des comptes.');
        }

        // 1.3 Récupération du profil de la cible
        const targetDoc = await db.collection('users').doc(targetUid).get();
        if (!targetDoc.exists) {
            // Sécurité : si la DB est vide, on nettoie quand même Auth
            await admin.auth().deleteUser(targetUid);
            return { success: true, message: 'Nettoyage Auth forcé.' };
        }

        const targetData = targetDoc.data();

        // 1.4 REGLES DE SÉCURITÉ BACKEND (Le mur infranchissable)
        if (targetData.isGod) {
            throw new functions.https.HttpsError('permission-denied', 'Sacrilège : Impossible de supprimer l\'Administrateur Suprême.');
        }

        if (targetData.role === 'admin' && !callerData.isGod) {
            throw new functions.https.HttpsError('permission-denied', 'Un administrateur normal ne peut pas supprimer un autre administrateur.');
        }

        // 1.5 Exécution : Suppression dans l'Authentification Google
        await admin.auth().deleteUser(targetUid);

        // 1.6 Exécution : Suppression dans la Base de données (Firestore)
        await db.collection('users').doc(targetUid).delete();

        return { success: true, message: 'Compte intégralement annihilé.' };

    } catch (error) {
        console.error("Erreur Backend lors de la suppression:", error);
        throw new functions.https.HttpsError('internal', "Erreur interne: " + error.message);
    }
});