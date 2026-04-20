/**
 * =======================================================================
 * BACKEND FIREBASE (Cloud Functions) - VERSION BLINDÉE (TOKEN MANUEL)
 * =======================================================================
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
    console.log("🚀 --- NOUVELLE TENTATIVE DE SUPPRESSION ---");

    let callerUid = null;

    // 1. PLAN A : Le système automatique de Firebase
    if (context.auth && context.auth.uid) {
        callerUid = context.auth.uid;
        console.log("✅ Badge reçu automatiquement :", callerUid);
    } 
    // 2. PLAN B (INFAILLIBLE) : Décodage du jeton manuel envoyé par le site
    else if (data.token) {
        try {
            const decodedToken = await admin.auth().verifyIdToken(data.token);
            callerUid = decodedToken.uid;
            console.log("✅ Badge manuel décodé avec succès :", callerUid);
        } catch (error) {
            console.error("🛑 ÉCHEC : Jeton manuel invalide ou expiré.", error);
            throw new functions.https.HttpsError('unauthenticated', 'Jeton de sécurité invalide.');
        }
    } 
    // 3. Echec total
    else {
        console.error("🛑 ÉCHEC TOTAL : Aucun jeton reçu.");
        throw new functions.https.HttpsError('unauthenticated', 'Vous devez être connecté (Aucun badge reçu).');
    }

    const targetUid = data.uid;
    const db = admin.firestore();

    try {
        // 4. Vérification du rôle de l'expéditeur
        const callerDoc = await db.collection('users').doc(callerUid).get();
        const callerData = callerDoc.data();

        if (!callerData || callerData.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Seuls les administrateurs peuvent supprimer des comptes.');
        }

        // 5. Vérification de la cible
        const targetDoc = await db.collection('users').doc(targetUid).get();
        if (!targetDoc.exists) {
            await admin.auth().deleteUser(targetUid);
            return { success: true, message: 'Nettoyage Auth forcé.' };
        }

        const targetData = targetDoc.data();

        // 6. Règles de protection Suprêmes
        if (targetData.isGod) {
            throw new functions.https.HttpsError('permission-denied', 'Sacrilège : Impossible de supprimer le compte Suprême.');
        }

        if (targetData.role === 'admin' && !callerData.isGod) {
            throw new functions.https.HttpsError('permission-denied', 'Un administrateur normal ne peut pas supprimer un autre administrateur.');
        }

        // 7. Suppression
        await admin.auth().deleteUser(targetUid);
        await db.collection('users').doc(targetUid).delete();

        return { success: true, message: 'Compte intégralement annihilé.' };

    } catch (error) {
        console.error("🔥 ERREUR CRITIQUE DU SERVEUR :", error);
        throw new functions.https.HttpsError('internal', "Erreur interne: " + error.message);
    }
});
