/**
 * =======================================================================
 * BACKEND FIREBASE (Cloud Functions) - VERSION V2 (La bonne architecture)
 * =======================================================================
 */

// Importation spécifique pour la V2
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
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


/* =======================================================================
 * SBI 8.0P.47 - CONTACT PUBLIC -> BREVO
 * -----------------------------------------------------------------------
 * Endpoint appelé par /api/sendSbiContact via Firebase Hosting rewrite.
 * La clé Brevo reste dans Secret Manager : BREVO_API_KEY.
 * ======================================================================= */

const BREVO_API_KEY = defineSecret("BREVO_API_KEY");
const BREVO_LIST_ID = 77;
const SBI_CONTACT_EMAIL = "contact@spigroup.fr";
const SBI_CONTACT_PHONE = "06 68 60 30 01";
const SBI_SENDER_NAME = "SBI Contact";
const SBI_SENDER_EMAIL = "contact@spigroup.fr";

function cleanString(value, maxLength = 1000) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMultiline(value, maxLength = 1200) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, maxLength);
}

function normalizeFrenchPhone(value) {
    const raw = cleanString(value, 40);
    if (!raw) return "";

    let compact = raw.replace(/[^\d+]/g, "");
    if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
    if (compact.startsWith("+")) return compact;
    if (/^0[1-9]\d{8}$/.test(compact)) return `+33${compact.slice(1)}`;
    return compact;
}

function escapeHtml(value) {
    return cleanString(value, 5000)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeHtmlMultiline(value) {
    return escapeHtml(value).replace(/\n/g, "<br>");
}

function parseContactRequest(body = {}) {
    const attributes = body.attributes || {};
    const consent = body.consent || {};
    const email = cleanString(body.email || attributes.EMAIL, 180).toLowerCase();
    const phone = cleanString(attributes.TELEPHONE || attributes.SMS, 40);
    const normalizedPhone = normalizeFrenchPhone(phone);

    return {
        email,
        firstname: cleanString(attributes.PRENOM, 80),
        lastname: cleanString(attributes.NOM, 80),
        phone,
        normalizedPhone,
        profile: cleanString(attributes.PROFIL, 80),
        interest: cleanString(attributes.BESOIN, 120),
        message: cleanMultiline(attributes.MESSAGE, 1200),
        source: cleanString(attributes.SOURCE, 120) || "SBI public contact",
        page: cleanString(attributes.PAGE, 180) || "/contact.html",
        consentRequest: consent.requestProcessingAccepted === true,
        consentEmail: consent.emailCampaigns === true,
        consentMobile: consent.mobileCampaigns === true,
        capturedAt: cleanString(consent.capturedAt, 80) || new Date().toISOString()
    };
}

function validateContactRequest(data) {
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return "L'adresse email n'est pas valide.";
    }
    if (!data.firstname) return "Vous avez oublié de remplir le prénom.";
    if (!data.lastname) return "Vous avez oublié de remplir le nom.";
    if (!data.phone) return "Vous avez oublié de remplir le téléphone.";
    if (!data.profile) return "Vous avez oublié de sélectionner votre profil.";
    if (!data.interest) return "Vous avez oublié de choisir un sujet.";
    if (!data.message) return "Vous avez oublié de remplir le message.";
    if (!data.consentRequest) return "Veuillez accepter le traitement des données pour envoyer la demande.";
    return "";
}

function getContactAttributes(data) {
    return {
        PRENOM: data.firstname,
        NOM: data.lastname,
        TELEPHONE: data.phone,
        SMS: data.normalizedPhone || data.phone,
        PROFIL: data.profile,
        BESOIN: data.interest,
        MESSAGE: data.message,
        SOURCE: data.source,
        PAGE: data.page,
        CONSENT_REPONSE: data.consentRequest ? "oui" : "non",
        CONSENT_EMAIL: data.consentEmail ? "oui" : "non",
        CONSENT_MOBILE: data.consentMobile ? "oui" : "non",
        CAPTURED_AT: data.capturedAt
    };
}

async function callBrevo(path, payload, apiKey) {
    const response = await fetch(`https://api.brevo.com/v3${path}`, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "api-key": apiKey
        },
        body: JSON.stringify(payload)
    });

    const raw = await response.text();
    let parsed = null;
    try {
        parsed = raw ? JSON.parse(raw) : null;
    } catch (_) {
        parsed = raw ? { message: raw } : null;
    }

    if (!response.ok) {
        const message = parsed?.message || parsed?.code || `Erreur Brevo ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.payload = parsed;
        throw error;
    }

    return parsed || { ok: true };
}

async function upsertBrevoContact(data, apiKey) {
    return callBrevo("/contacts", {
        email: data.email,
        attributes: getContactAttributes(data),
        listIds: [BREVO_LIST_ID],
        updateEnabled: true
    }, apiKey);
}

function buildNotificationHtml(data) {
    const rows = [
        ["Prénom", data.firstname],
        ["Nom", data.lastname],
        ["Email", data.email],
        ["Téléphone", data.phone],
        ["Téléphone normalisé", data.normalizedPhone || data.phone],
        ["Profil", data.profile],
        ["Sujet", data.interest],
        ["Opt-in email", data.consentEmail ? "oui" : "non"],
        ["Opt-in téléphone/SMS", data.consentMobile ? "oui" : "non"],
        ["Source", data.source],
        ["Page", data.page],
        ["Date", data.capturedAt]
    ].map(([label, value]) => `
        <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #1c2740;color:#8fb1ff;font-weight:700;">${escapeHtml(label)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #1c2740;color:#ffffff;">${escapeHtml(value)}</td>
        </tr>`).join("");

    return `
        <div style="margin:0;padding:24px;background:#05070c;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
            <div style="max-width:720px;margin:0 auto;border:1px solid #1d3f82;background:#080d18;padding:24px;">
                <p style="margin:0 0 8px;color:#0051ff;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">SBI Contact</p>
                <h1 style="margin:0 0 18px;font-size:28px;line-height:1.1;">Nouvelle demande depuis le site SBI</h1>
                <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">${rows}</table>
                <h2 style="font-size:16px;margin:18px 0 8px;color:#8fb1ff;">Message</h2>
                <div style="padding:14px;border:1px solid #1c2740;background:#03060d;color:#ffffff;line-height:1.6;">${escapeHtmlMultiline(data.message)}</div>
                <p style="margin:18px 0 0;color:#9fb0c9;font-size:12px;">Contact SBI : ${escapeHtml(SBI_CONTACT_PHONE)} · ${escapeHtml(SBI_CONTACT_EMAIL)}</p>
            </div>
        </div>`;
}

function buildNotificationText(data) {
    return [
        "Nouvelle demande depuis le site SBI",
        "",
        `Prénom : ${data.firstname}`,
        `Nom : ${data.lastname}`,
        `Email : ${data.email}`,
        `Téléphone : ${data.phone}`,
        `Profil : ${data.profile}`,
        `Sujet : ${data.interest}`,
        `Opt-in email : ${data.consentEmail ? "oui" : "non"}`,
        `Opt-in téléphone/SMS : ${data.consentMobile ? "oui" : "non"}`,
        `Source : ${data.source}`,
        `Page : ${data.page}`,
        `Date : ${data.capturedAt}`,
        "",
        "Message :",
        data.message
    ].join("\n");
}

async function sendBrevoNotification(data, apiKey) {
    return callBrevo("/smtp/email", {
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        }],
        replyTo: {
            email: data.email,
            name: `${data.firstname} ${data.lastname}`.trim()
        },
        subject: `Nouvelle demande SBI - ${data.interest || "Contact"}`,
        htmlContent: buildNotificationHtml(data),
        textContent: buildNotificationText(data)
    }, apiKey);
}

exports.sendSbiContact = onRequest({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 20,
    memory: "256MiB"
}, async (req, res) => {
    res.set("Cache-Control", "no-store");

    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", req.get("origin") || "*");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        return res.status(204).send("");
    }

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Méthode non autorisée."
        });
    }

    const apiKey = BREVO_API_KEY.value();
    if (!apiKey) {
        console.error("BREVO_API_KEY manquant dans Secret Manager.");
        return res.status(500).json({
            success: false,
            message: "Configuration Brevo manquante côté serveur."
        });
    }

    const data = parseContactRequest(req.body || {});
    const validationMessage = validateContactRequest(data);

    if (validationMessage) {
        return res.status(400).json({
            success: false,
            message: validationMessage
        });
    }

    try {
        const contactResult = await upsertBrevoContact(data, apiKey);
        let notificationWarning = "";

        try {
            await sendBrevoNotification(data, apiKey);
        } catch (notificationError) {
            notificationWarning = "Contact enregistré, mais l'email interne n'a pas pu être envoyé.";
            console.error("Erreur notification Brevo SBI :", notificationError.message, notificationError.payload || "");
        }

        return res.status(200).json({
            success: true,
            mode: "sent",
            message: "Votre message a bien été envoyé. L’équipe SBI revient vers vous rapidement.",
            warning: notificationWarning,
            brevo: {
                listId: BREVO_LIST_ID,
                contact: contactResult?.id || contactResult?.ok || "updated"
            }
        });
    } catch (error) {
        console.error("Erreur Brevo contact SBI :", error.message, error.payload || "");
        return res.status(502).json({
            success: false,
            message: "Brevo n'a pas accepté la demande. Vérifie la liste #77 et les attributs contact SBI."
        });
    }
});
