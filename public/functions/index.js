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
 * SBI 8.0P.51 - CONTACT PUBLIC -> BREVO
 * -----------------------------------------------------------------------
 * Endpoint appelé par /api/sendSbiContact via Firebase Hosting rewrite.
 * La clé Brevo reste dans Secret Manager : BREVO_API_KEY.
 * Emails transactionnels rendus avec le template responsive SBI fourni.
 *
 * Mapping adapté aux attributs Brevo existants :
 * - FIRSTNAME / LASTNAME / TEL
 * - PROFESSION / PROFILE_TYPE / PROFILE_LABEL / CONTACT_SOURCE
 * - PHONE_SMS_OPTIN
 *
 * IMPORTANT : l'attribut SMS Brevo est volontairement exclu.
 * Brevo le traite comme identifiant unique et refuse la mise à jour si
 * le même numéro est déjà associé à un autre contact.
 *
 * BESOIN et MESSAGE restent uniquement dans l'email interne, pas dans la
 * fiche contact Brevo.
 * ======================================================================= */

const BREVO_API_KEY = defineSecret("BREVO_API_KEY");
const BREVO_LIST_ID = 77;
const SBI_CONTACT_EMAIL = "contact@sbigroup.fr";
const SBI_CONTACT_PHONE = "06 68 60 30 01";
const SBI_SENDER_NAME = "SBI Contact";
const SBI_SENDER_EMAIL = "contact@sbigroup.fr";

const PROFILE_LABELS = {
    etudiant: "Étudiant",
    professeur: "Professeur",
    professionnel: "Professionnel",
    entreprise: "Entreprise",
    club: "Club",
    autre: "Autre"
};

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

function normalizeProfile(value) {
    return cleanString(value, 80).toLowerCase();
}

function getProfileLabel(profile) {
    const normalizedProfile = normalizeProfile(profile);
    return PROFILE_LABELS[normalizedProfile] || cleanString(profile, 80) || "Non précisé";
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
    const phone = cleanString(attributes.TELEPHONE || attributes.TEL || attributes.SMS, 40);
    const normalizedPhone = normalizeFrenchPhone(phone);
    const profile = normalizeProfile(attributes.PROFIL || attributes.PROFILE_TYPE || attributes.PROFESSION);
    const profileLabel = getProfileLabel(profile);

    return {
        email,
        firstname: cleanString(attributes.PRENOM || attributes.FIRSTNAME, 80),
        lastname: cleanString(attributes.NOM || attributes.LASTNAME, 80),
        phone,
        normalizedPhone,
        profile,
        profileLabel,
        interest: cleanString(attributes.BESOIN, 120),
        message: cleanMultiline(attributes.MESSAGE, 1200),
        source: cleanString(attributes.SOURCE || attributes.CONTACT_SOURCE, 120) || "SBI public contact",
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
        FIRSTNAME: data.firstname,
        LASTNAME: data.lastname,
        TEL: data.phone,
        PROFESSION: data.profileLabel,
        PROFILE_TYPE: data.profile,
        PROFILE_LABEL: data.profileLabel,
        CONTACT_SOURCE: data.source,
        PHONE_SMS_OPTIN: data.consentMobile === true
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

const SBI_SITE_URL = "https://www.sbigroup.fr";
const SBI_TEMPLATE_PHONE_TEL = "tel:+33668603001";
const SBI_EMAIL_TEMPLATE = "<!DOCTYPE html>\n<html lang=\"fr\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">\n  <meta name=\"x-apple-disable-message-reformatting\">\n  <title>SBI - Email générique</title>\n\n  <!--\n    TEMPLATE EMAIL GÉNÉRIQUE SBI - RESPONSIVE\n    Usage : email de contact, réponse prospect, suivi, envoi de document, prise de rendez-vous.\n    Remplace les variables entre doubles accolades avant envoi.\n  -->\n\n  <style>\n    body, table, td, a {\n      -webkit-text-size-adjust: 100%;\n      -ms-text-size-adjust: 100%;\n    }\n\n    table, td {\n      mso-table-lspace: 0pt;\n      mso-table-rspace: 0pt;\n    }\n\n    img {\n      -ms-interpolation-mode: bicubic;\n      border: 0;\n      outline: none;\n      text-decoration: none;\n    }\n\n    body {\n      margin: 0 !important;\n      padding: 0 !important;\n      width: 100% !important;\n      background-color: #f3f5f9;\n    }\n\n    a {\n      text-decoration: none;\n    }\n\n    @media only screen and (max-width: 640px) {\n      .sbi-wrapper {\n        padding: 0 !important;\n      }\n\n      .sbi-container {\n        width: 100% !important;\n        max-width: 100% !important;\n        border-radius: 0 !important;\n        border-left: 0 !important;\n        border-right: 0 !important;\n      }\n\n      .sbi-padding {\n        padding-left: 22px !important;\n        padding-right: 22px !important;\n      }\n\n      .sbi-header {\n        padding-top: 22px !important;\n        padding-bottom: 22px !important;\n      }\n\n      .sbi-header-logo-cell,\n      .sbi-header-brand-cell {\n        display: block !important;\n        width: 100% !important;\n        text-align: center !important;\n      }\n\n      .sbi-logo {\n        width: 56px !important;\n        max-width: 56px !important;\n        margin: 0 auto 12px auto !important;\n      }\n\n      .sbi-brand {\n        width: 190px !important;\n        max-width: 190px !important;\n        margin: 0 auto !important;\n      }\n\n      .sbi-tagline {\n        text-align: center !important;\n      }\n\n      .sbi-message {\n        padding-top: 28px !important;\n        padding-bottom: 18px !important;\n      }\n\n      .sbi-message-text,\n      .sbi-message-text p {\n        font-size: 16px !important;\n        line-height: 27px !important;\n      }\n\n      .sbi-signature-card {\n        padding: 18px !important;\n      }\n\n      .sbi-contact-column,\n      .sbi-info-column {\n        display: block !important;\n        width: 100% !important;\n      }\n\n      .sbi-info-column {\n        padding-top: 16px !important;\n      }\n\n      .sbi-social-table {\n        width: 100% !important;\n      }\n\n      .sbi-social-item {\n        display: inline-block !important;\n        padding: 6px 12px 6px 0 !important;\n      }\n\n      .sbi-footer {\n        padding-left: 22px !important;\n        padding-right: 22px !important;\n      }\n    }\n\n    @media only screen and (max-width: 420px) {\n      .sbi-padding {\n        padding-left: 18px !important;\n        padding-right: 18px !important;\n      }\n\n      .sbi-message-text,\n      .sbi-message-text p {\n        font-size: 15px !important;\n        line-height: 26px !important;\n      }\n\n      .sbi-brand {\n        width: 170px !important;\n        max-width: 170px !important;\n      }\n    }\n  </style>\n</head>\n\n<body style=\"margin:0; padding:0; background-color:#f3f5f9; font-family:Arial, Helvetica, sans-serif; color:#101828;\">\n\n  <!-- Preheader caché -->\n  <div style=\"display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; mso-hide:all;\">\n    Message de Sport Business Institute.\n  </div>\n\n  <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%; margin:0; padding:0; background-color:#f3f5f9;\">\n    <tr>\n      <td align=\"center\" class=\"sbi-wrapper\" style=\"padding:28px 14px;\">\n\n        <table role=\"presentation\" width=\"620\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"sbi-container\" style=\"width:620px; max-width:620px; background-color:#ffffff; border-radius:18px; overflow:hidden; border:1px solid #d9e1ee;\">\n\n          <!-- Header -->\n          <tr>\n            <td class=\"sbi-header sbi-padding\" style=\"background-color:#050913; padding:24px 30px; border-bottom:4px solid #0051ff;\">\n\n              <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\">\n                <tr>\n                  <td class=\"sbi-header-logo-cell\" align=\"left\" valign=\"middle\" width=\"74\" style=\"width:74px;\">\n                    <img\n                      src=\"https://firebasestorage.googleapis.com/v0/b/sbi-web-4f6b4.firebasestorage.app/o/site%2Findex%2Flogos%2FLogo_SBI_Tome.png?alt=media\"\n                      width=\"56\"\n                      alt=\"SBI\"\n                      class=\"sbi-logo\"\n                      style=\"display:block; width:56px; max-width:56px; height:auto; border:0;\"\n                    >\n                  </td>\n\n                  <td class=\"sbi-header-brand-cell\" align=\"left\" valign=\"middle\">\n                    <img\n                      src=\"https://firebasestorage.googleapis.com/v0/b/sbi-web-4f6b4.firebasestorage.app/o/site%2Findex%2Flogos%2Fsbi_brand.png?alt=media\"\n                      width=\"214\"\n                      alt=\"Sport Business Institute\"\n                      class=\"sbi-brand\"\n                      style=\"display:block; width:214px; max-width:214px; height:auto; border:0;\"\n                    >\n\n                    <div class=\"sbi-tagline\" style=\"font-size:12px; line-height:18px; color:#8a93a6; font-style:italic; margin-top:8px;\">\n                      Apprendre. Progresser. <span style=\"color:#0051ff;\">Performer.</span>\n                    </div>\n                  </td>\n                </tr>\n              </table>\n\n            </td>\n          </tr>\n\n          <!-- Message principal -->\n          <tr>\n            <td class=\"sbi-message sbi-padding\" style=\"padding:34px 34px 20px 34px; background-color:#ffffff;\">\n\n              <p style=\"margin:0 0 18px 0; font-size:16px; line-height:26px; color:#101828;\">\n                Bonjour {PRENOM},\n              </p>\n\n              <div class=\"sbi-message-text\" style=\"font-size:16px; line-height:27px; color:#253047;\">\n                {MESSAGE_HTML}\n              </div>\n\n              <p style=\"margin:24px 0 0 0; font-size:16px; line-height:26px; color:#101828;\">\n                Bien cordialement,\n              </p>\n\n              <p style=\"margin:4px 0 0 0; font-size:16px; line-height:26px; color:#101828; font-weight:bold;\">\n                {NOM_EXPEDITEUR}\n              </p>\n\n              <p style=\"margin:0; font-size:14px; line-height:22px; color:#667085;\">\n                {POSTE_EXPEDITEUR} · Sport Business Institute\n              </p>\n\n            </td>\n          </tr>\n\n          <!-- Carte signature -->\n          <tr>\n            <td class=\"sbi-padding\" style=\"padding:8px 34px 34px 34px; background-color:#ffffff;\">\n\n              <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"background-color:#f7f9fd; border:1px solid #dce4f2; border-radius:14px;\">\n                <tr>\n                  <td class=\"sbi-signature-card\" style=\"padding:22px;\">\n\n                    <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\">\n                      <tr>\n                        <td style=\"padding-bottom:15px;\">\n                          <div style=\"font-size:13px; line-height:19px; color:#0051ff; font-weight:bold; text-transform:uppercase; letter-spacing:0.8px; font-style:italic;\">\n                            SBI · Sport Business Institute\n                          </div>\n\n                          <div style=\"font-size:14px; line-height:23px; color:#344054; margin-top:8px;\">\n                            Centre de formation dédié aux métiers du football et du sport business.\n                          </div>\n                        </td>\n                      </tr>\n\n                      <tr>\n                        <td style=\"border-top:1px solid #dce4f2; padding-top:16px;\">\n\n                          <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\">\n                            <tr>\n                              <td class=\"sbi-contact-column\" valign=\"top\" width=\"55%\" style=\"width:55%; font-size:14px; line-height:24px; color:#344054;\">\n                                <strong style=\"color:#101828;\">Contact</strong><br>\n\n                                <span style=\"color:#667085;\">Email :</span>\n                                <a href=\"mailto:contact@sbigroup.fr\" style=\"color:#0051ff; text-decoration:none;\">contact@sbigroup.fr</a><br>\n\n                                <span style=\"color:#667085;\">Téléphone :</span>\n                                <a href=\"tel:+33492909025\" style=\"color:#0051ff; text-decoration:none;\">04.92.90.90.25</a><br>\n\n                                <span style=\"color:#667085;\">Site :</span>\n                                <a href=\"https://www.sbigroup.fr\" style=\"color:#0051ff; text-decoration:none;\">www.sbigroup.fr</a>\n                              </td>\n\n                              <td class=\"sbi-info-column\" valign=\"top\" width=\"45%\" style=\"width:45%; font-size:14px; line-height:24px; color:#344054;\">\n                                <strong style=\"color:#101828;\">Formations</strong><br>\n                                <span style=\"color:#667085;\">100% en ligne</span><br>\n                                <span style=\"color:#667085;\">Vidéo, live et à la demande</span><br>\n                                <span style=\"color:#667085;\">Certifications professionnelles</span>\n                              </td>\n                            </tr>\n                          </table>\n\n                        </td>\n                      </tr>\n\n                      <!-- Réseaux sociaux -->\n                      <tr>\n                        <td style=\"padding-top:18px;\">\n                          <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"sbi-social-table\">\n                            <tr>\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{LINKEDIN_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">LinkedIn</a>\n                              </td>\n\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{INSTAGRAM_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">Instagram</a>\n                              </td>\n\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{FACEBOOK_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">Facebook</a>\n                              </td>\n\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{YOUTUBE_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">YouTube</a>\n                              </td>\n\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{X_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">X</a>\n                              </td>\n                            </tr>\n                          </table>\n                        </td>\n                      </tr>\n\n                    </table>\n\n                  </td>\n                </tr>\n              </table>\n\n            </td>\n          </tr>\n\n          <!-- Footer légal discret -->\n          <tr>\n            <td class=\"sbi-footer\" style=\"background-color:#050913; padding:18px 30px;\">\n              <p style=\"margin:0; font-size:11px; line-height:18px; color:#8a93a6;\">\n                Ce message et ses éventuelles pièces jointes sont destinés exclusivement à leur destinataire.\n                Si vous l’avez reçu par erreur, merci d’en informer l’expéditeur et de le supprimer.\n              </p>\n            </td>\n          </tr>\n\n        </table>\n\n      </td>\n    </tr>\n  </table>\n\n</body>\n</html>\n";

function renderSbiEmailTemplate({
    prenom = "",
    messageHtml = "",
    nomExpediteur = "L’équipe SBI",
    posteExpediteur = "Contact",
    preheader = "Message de Sport Business Institute."
}) {
    return SBI_EMAIL_TEMPLATE
        .replace("Message de Sport Business Institute.", escapeHtml(preheader))
        .replaceAll("{PRENOM}", escapeHtml(prenom))
        .replaceAll("{MESSAGE_HTML}", messageHtml)
        .replaceAll("{NOM_EXPEDITEUR}", escapeHtml(nomExpediteur))
        .replaceAll("{POSTE_EXPEDITEUR}", escapeHtml(posteExpediteur))
        .replaceAll("{LINKEDIN_URL}", SBI_SITE_URL)
        .replaceAll("{INSTAGRAM_URL}", SBI_SITE_URL)
        .replaceAll("{FACEBOOK_URL}", SBI_SITE_URL)
        .replaceAll("{YOUTUBE_URL}", SBI_SITE_URL)
        .replaceAll("{X_URL}", SBI_SITE_URL)
        .replaceAll("contact@spigroup.fr", SBI_CONTACT_EMAIL)
        .replaceAll("contact@sbigroup.fr", SBI_CONTACT_EMAIL)
        .replaceAll("04.92.90.90.25", SBI_CONTACT_PHONE)
        .replaceAll("tel:+33492909025", SBI_TEMPLATE_PHONE_TEL);
}

function buildContactDetailsTable(data) {
    const rows = [
        ["Prénom", data.firstname],
        ["Nom", data.lastname],
        ["Email", data.email],
        ["Téléphone", data.phone],
        ["Téléphone normalisé", data.normalizedPhone || data.phone],
        ["Profil", data.profileLabel],
        ["Profil technique", data.profile],
        ["Sujet", data.interest],
        ["Opt-in email", data.consentEmail ? "oui" : "non"],
        ["Opt-in téléphone/SMS", data.consentMobile ? "oui" : "non"],
        ["Source", data.source],
        ["Page", data.page],
        ["Date", data.capturedAt]
    ];

    const tableRows = rows.map(([label, value]) => `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#0051ff;font-weight:bold;width:38%;">${escapeHtml(label)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#101828;">${escapeHtml(value)}</td>
        </tr>`).join("");

    return `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #dce4f2;border-radius:12px;overflow:hidden;">
            ${tableRows}
        </table>`;
}

function buildInternalMessageHtml(data) {
    return `
        <p style="margin:0 0 16px 0;">Une nouvelle demande vient d’être envoyée depuis le formulaire contact SBI.</p>
        ${buildContactDetailsTable(data)}
        <p style="margin:20px 0 8px 0;font-weight:bold;color:#101828;">Message du prospect</p>
        <div style="padding:14px 16px;border:1px solid #dce4f2;background:#f7f9fd;border-radius:12px;color:#253047;line-height:1.7;">${escapeHtmlMultiline(data.message)}</div>
        <p style="margin:18px 0 0 0;color:#667085;font-size:14px;line-height:22px;">Réponds directement à cet email : le Reply-To est configuré sur l’adresse du prospect.</p>`;
}

function buildConfirmationMessageHtml(data) {
    return `
        <p style="margin:0 0 16px 0;">Nous avons bien reçu ta demande depuis le site SBI.</p>
        <p style="margin:0 0 16px 0;">Notre équipe va l’étudier et revenir vers toi rapidement avec une réponse adaptée à ton profil.</p>
        <div style="padding:14px 16px;border:1px solid #dce4f2;background:#f7f9fd;border-radius:12px;color:#253047;line-height:1.7;">
            <strong style="color:#101828;">Récapitulatif</strong><br>
            Sujet : ${escapeHtml(data.interest || "Contact")}<br>
            Profil : ${escapeHtml(data.profileLabel)}<br>
            Téléphone : ${escapeHtml(data.phone)}
        </div>
        <p style="margin:18px 0 0 0;">À très vite,</p>`;
}

function buildInternalNotificationHtml(data) {
    return renderSbiEmailTemplate({
        prenom: "l’équipe SBI",
        messageHtml: buildInternalMessageHtml(data),
        nomExpediteur: "Formulaire SBI",
        posteExpediteur: "Notification contact",
        preheader: `Nouvelle demande SBI - ${data.interest || "Contact"}`
    });
}

function buildConfirmationHtml(data) {
    return renderSbiEmailTemplate({
        prenom: data.firstname || "",
        messageHtml: buildConfirmationMessageHtml(data),
        nomExpediteur: "L’équipe SBI",
        posteExpediteur: "Contact",
        preheader: "Ta demande SBI a bien été reçue."
    });
}

function buildNotificationText(data) {
    return [
        "Nouvelle demande depuis le site SBI",
        "",
        `Prénom : ${data.firstname}`,
        `Nom : ${data.lastname}`,
        `Email : ${data.email}`,
        `Téléphone : ${data.phone}`,
        `Profil : ${data.profileLabel}`,
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

function buildConfirmationText(data) {
    return [
        `Bonjour ${data.firstname},`,
        "",
        "Nous avons bien reçu ta demande depuis le site SBI.",
        "Notre équipe va l’étudier et revenir vers toi rapidement.",
        "",
        `Sujet : ${data.interest || "Contact"}`,
        `Profil : ${data.profileLabel}`,
        `Téléphone : ${data.phone}`,
        "",
        "Bien cordialement,",
        "L’équipe SBI"
    ].join("\n");
}

async function sendBrevoEmail(payload, apiKey) {
    return callBrevo("/smtp/email", payload, apiKey);
}

async function sendBrevoNotification(data, apiKey) {
    return sendBrevoEmail({
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
        htmlContent: buildInternalNotificationHtml(data),
        textContent: buildNotificationText(data)
    }, apiKey);
}

async function sendBrevoConfirmation(data, apiKey) {
    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: data.email,
            name: `${data.firstname} ${data.lastname}`.trim() || data.email
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Nous avons bien reçu ta demande",
        htmlContent: buildConfirmationHtml(data),
        textContent: buildConfirmationText(data)
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
            console.error("Erreur notification interne Brevo SBI :", notificationError.message, notificationError.payload || "");
        }

        try {
            await sendBrevoConfirmation(data, apiKey);
        } catch (confirmationError) {
            notificationWarning = notificationWarning
                ? `${notificationWarning} L'email de confirmation prospect n'a pas pu être envoyé.`
                : "Contact enregistré, mais l'email de confirmation prospect n'a pas pu être envoyé.";
            console.error("Erreur confirmation Brevo SBI :", confirmationError.message, confirmationError.payload || "");
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
