/**
 * =======================================================================
 * BACKEND FIREBASE (Cloud Functions) - VERSION "RAYON X"
 * =======================================================================
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
    console.log("🚀 --- NOUVELLE REQUÊTE REÇUE ---");
    // On imprime l'intégralité du colis reçu pour voir où se cachent les données
    console.log("📦 Contenu exact du colis (data) :", JSON.stringify(data));

    let callerUid = null;
    let targetUid = null;
    let theToken = null;

    // 1. Recherche du jeton (On fouille partout, même si Firebase a double-emballé le colis)
    if (data && data.token) {
        theToken = data.token;
        targetUid = data.uid;
    } else if (data && data.data && data.data.token) {
        theToken = data.data.token;
        targetUid = data.data.uid;
    }

    // 2. Identification
    if (context.auth && context.auth.uid) {
        callerUid = context.auth.uid;
        console.log("✅ Authentification automatique réussie :", callerUid);
    } else if (theToken) {
        try {
            const decodedToken = await admin.auth().verifyIdToken(theToken);
            callerUid = decodedToken.uid;
            console.log("✅ Jeton manuel décodé avec succès :", callerUid);
        } catch (error) {
            console.error("🛑 Erreur décodage jeton :", error);
            throw new functions.https.HttpsError('unauthenticated', 'Le jeton est invalide ou a expiré.');
        }
    } else {
        console.error("🛑 Impossible de trouver le jeton. Il n'est nulle part.");
        throw new functions.https.HttpsError('unauthenticated', 'Échec absolu : Aucun jeton trouvé dans le colis.');
    }

    // 3. Exécution de la suppression
    const db = admin.firestore();
    try {
        const callerDoc = await db.collection('users').doc(callerUid).get();
        const callerData = callerDoc.data();

        if (!callerData || callerData.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Seuls les administrateurs peuvent faire cela.');
        }

        const targetDoc = await db.collection('users').doc(targetUid).get();
        if (!targetDoc.exists) {
            await admin.auth().deleteUser(targetUid);
            return { success: true, message: 'Nettoyage Auth forcé.' };
        }

        const targetData = targetDoc.data();
        
        // Règles de sécurité du Suprême
        if (targetData.isGod) {
            throw new functions.https.HttpsError('permission-denied', 'Le compte Suprême est intouchable.');
        }
        if (targetData.role === 'admin' && !callerData.isGod) {
            throw new functions.https.HttpsError('permission-denied', 'Un administrateur ne peut pas en supprimer un autre.');
        }

        await admin.auth().deleteUser(targetUid);
        await db.collection('users').doc(targetUid).delete();

        console.log("✅ Compte supprimé avec succès.");
        return { success: true, message: 'Compte pulvérisé avec succès.' };
    } catch (error) {
        console.error("🔥 Erreur Serveur :", error);
        throw new functions.https.HttpsError('internal', "Erreur interne: " + error.message);
    }
});
