/**
 * =======================================================================
 * BACKEND FIREBASE (Cloud Functions) - VERSION V2 (La bonne architecture)
 * =======================================================================
 */

// Importation spécifique pour la V2
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

// En V2, la fonction reçoit un seul objet "request"
exports.deleteUserAccount = onCall(async (request) => {
    console.log("🚀 --- NOUVELLE TENTATIVE DE SUPPRESSION (V2) ---");

    // 1. Extraction propre des données de la requête V2
    const data = request.data;
    const auth = request.auth;

    // 2. Vérification stricte du badge de sécurité
    if (!auth || !auth.uid) {
        console.error("🛑 ÉCHEC : La requête n'est pas authentifiée.");
        throw new HttpsError('unauthenticated', 'Vous devez être connecté pour effectuer cette action.');
    }

    const callerUid = auth.uid;
    const targetUid = data.uid;

    console.log("🕵️ UID Admin (Toi) :", callerUid);
    console.log("🎯 UID Cible (À supprimer) :", targetUid);

    const db = admin.firestore();

    try {
        // 3. Vérification de tes droits (Es-tu bien Admin ?)
        const callerDoc = await db.collection('users').doc(callerUid).get();
        const callerData = callerDoc.data();

        if (!callerData || callerData.role !== 'admin') {
            console.error("🛑 ÉCHEC : Rôle Admin introuvable dans Firestore pour cet utilisateur.");
            throw new HttpsError('permission-denied', 'Action refusée : Seuls les administrateurs ont ce pouvoir.');
        }

        // 4. Vérification de la cible
        const targetDoc = await db.collection('users').doc(targetUid).get();
        
        // Si la cible n'existe déjà plus dans la BDD, on s'assure qu'elle dégage de l'Auth Firebase
        if (!targetDoc.exists) {
            console.log("⚠️ Cible introuvable dans la base, on nettoie le système d'authentification par sécurité.");
            await admin.auth().deleteUser(targetUid);
            return { success: true, message: 'Nettoyage de sécurité effectué.' };
        }

        const targetData = targetDoc.data();

        // 5. Boucliers de sécurité du Suprême
        if (targetData.isGod) {
            console.error("🛑 ÉCHEC : Tentative de suppression du compte God.");
            throw new HttpsError('permission-denied', 'Sacrilège : Le compte Suprême est indestructible.');
        }

        if (targetData.role === 'admin' && !callerData.isGod) {
            console.error("🛑 ÉCHEC : Guerre civile entre admins.");
            throw new HttpsError('permission-denied', 'Un administrateur classique ne peut pas supprimer un de ses pairs.');
        }

        // 6. Sentence finale : on supprime d'abord de l'authentification, puis de la base de données
        await admin.auth().deleteUser(targetUid);
        await db.collection('users').doc(targetUid).delete();

        console.log("✅ SUCCÈS TOTAL : Le compte a été effacé du serveur.");
        return { success: true, message: 'Le compte a été intégralement supprimé.' };

    } catch (error) {
        console.error("🔥 ERREUR SERVEUR INTERNE :", error);
        
        // On renvoie l'erreur propre à l'interface si c'est une de nos règles qui bloque
        if (error instanceof HttpsError) {
            throw error;
        }
        // Sinon c'est un crash inattendu
        throw new HttpsError('internal', "Le serveur a rencontré une erreur : " + error.message);
    }
});
