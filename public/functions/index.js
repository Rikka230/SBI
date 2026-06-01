/**
 * =======================================================================
 * BACKEND FIREBASE (Cloud Functions) - VERSION V2 (La bonne architecture)
 * =======================================================================
 */

// Importation spécifique pour la V2
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { Readable } = require("stream");

admin.initializeApp();

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
const BREVO_WEBHOOK_TOKEN = defineSecret("BREVO_WEBHOOK_TOKEN");
const DAILY_API_KEY = defineSecret("DAILY_API_KEY");
const BREVO_LIST_ID = 77;
const BREVO_NEWSLETTER_LIST_ID = 77;
const SBI_CONTACT_EMAIL = "contact@sbigroup.fr";
const SBI_CONTACT_PHONE = "06 68 60 30 01";
const SBI_SENDER_NAME = "Contact";
const SBI_SENDER_EMAIL = "contact@sbigroup.fr";
const SBI_STORAGE_BUCKET = "sbi-web-4f6b4.firebasestorage.app";

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
        // Honeypot anti-spam : champ invisible cote client (doit rester vide).
        honeypot: cleanString(body.website || body.company || body.url || body.hp || attributes.WEBSITE || attributes.HP, 200),
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

async function callBrevo(path, payload, apiKey, options = {}) {
    const method = options.method || "POST";
    const requestOptions = {
        method,
        headers: {
            "Accept": "application/json",
            "api-key": apiKey
        }
    };

    if (method !== "GET" && payload !== undefined) {
        requestOptions.headers["Content-Type"] = "application/json";
        requestOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(`https://api.brevo.com/v3${path}`, requestOptions);

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
const SBI_PASSWORD_RESET_URL = "https://www.sbigroup.fr/password-reset.html";
const SBI_AUTH_ACTION_SETTINGS = {
    url: SBI_PASSWORD_RESET_URL,
    handleCodeInApp: true
};

const SBI_FINALIZATION_REMINDER_MAX_COUNT = 3;
const SBI_FINALIZATION_REMINDER_DELAY_MS = 48 * 60 * 60 * 1000;
const SBI_ACCOUNT_CREATION_LOCK_TTL_MS = 5 * 60 * 1000;
const SBI_ACCOUNT_CREATION_LOCK_ACTIVE_GRACE_MS = 8 * 1000;
const SBI_FINALIZATION_TOKEN_COLLECTION = "accountFinalizationTokens";
const SBI_FINALIZATION_TOKEN_PURPOSE = "initial_password";
const SBI_FINALIZATION_TOKEN_MODE = "finalizeAccount";
const SBI_FINALIZATION_PROCESSING_TTL_MS = 10 * 60 * 1000;
const SBI_MIN_PASSWORD_LENGTH = 8;

function readActionParamsFromUrl(rawUrl) {
    const parsed = new URL(rawUrl);
    const params = new URLSearchParams(parsed.search);

    if (parsed.hash) {
        const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
        hashParams.forEach((value, key) => {
            if (!params.has(key)) params.set(key, value);
        });
    }

    return params;
}

function extractPasswordResetParams(firebaseLink) {
    const urlsToInspect = [firebaseLink];
    const inspectedUrls = new Set();

    while (urlsToInspect.length > 0) {
        const currentUrl = urlsToInspect.shift();
        if (!currentUrl || inspectedUrls.has(currentUrl)) continue;
        inspectedUrls.add(currentUrl);

        const params = readActionParamsFromUrl(currentUrl);
        const oobCode = params.get("oobCode");
        const apiKey = params.get("apiKey");
        const mode = params.get("mode") || "resetPassword";
        const lang = params.get("lang") || "fr";

        if (oobCode) {
            return { oobCode, apiKey, mode, lang };
        }

        ["link", "continueUrl", "continueURL"].forEach((key) => {
            const nestedUrl = params.get(key);
            if (nestedUrl) urlsToInspect.push(nestedUrl);
        });
    }

    return null;
}

function buildSbiPasswordResetLink(firebaseLink) {
    try {
        const actionParams = extractPasswordResetParams(firebaseLink);
        if (!actionParams?.oobCode) return firebaseLink;

        const sbiLink = new URL(SBI_PASSWORD_RESET_URL);
        sbiLink.searchParams.set("mode", actionParams.mode || "resetPassword");
        sbiLink.searchParams.set("oobCode", actionParams.oobCode);
        if (actionParams.apiKey) sbiLink.searchParams.set("apiKey", actionParams.apiKey);
        if (actionParams.lang) sbiLink.searchParams.set("lang", actionParams.lang);

        return sbiLink.toString();
    } catch (error) {
        console.error("Erreur reconstruction lien reset SBI :", error);
        return firebaseLink;
    }
}
const SBI_TEMPLATE_PHONE_TEL = "tel:+33668603001";
const SBI_SOCIAL_LINKS = {
    linkedin: "https://www.linkedin.com/company/sport-business-institute",
    instagram: "https://www.instagram.com/sportbusinessinstitute",
    facebook: "https://www.facebook.com/people/SBI-Sport-Business-Institute/61581987031214",
    youtube: "https://www.youtube.com/@sbisportbusinessinstitute",
    x: "https://x.com/sbigroupe",
    snapchat: "https://www.snapchat.com/@sbigroupe?share_id=lOOvFhpVVyk&locale=fr-FR"
};
const SBI_EMAIL_TEMPLATE = "<!DOCTYPE html>\n<html lang=\"fr\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">\n  <meta name=\"x-apple-disable-message-reformatting\">\n  <title>SBI - Email générique</title>\n\n  <!--\n    TEMPLATE EMAIL GÉNÉRIQUE SBI - RESPONSIVE\n    Usage : email de contact, réponse prospect, suivi, envoi de document, prise de rendez-vous.\n    Remplace les variables entre doubles accolades avant envoi.\n  -->\n\n  <style>\n    body, table, td, a {\n      -webkit-text-size-adjust: 100%;\n      -ms-text-size-adjust: 100%;\n    }\n\n    table, td {\n      mso-table-lspace: 0pt;\n      mso-table-rspace: 0pt;\n    }\n\n    img {\n      -ms-interpolation-mode: bicubic;\n      border: 0;\n      outline: none;\n      text-decoration: none;\n    }\n\n    body {\n      margin: 0 !important;\n      padding: 0 !important;\n      width: 100% !important;\n      background-color: #f3f5f9;\n    }\n\n    a {\n      text-decoration: none;\n    }\n\n    @media only screen and (max-width: 640px) {\n      .sbi-wrapper {\n        padding: 0 !important;\n      }\n\n      .sbi-container {\n        width: 100% !important;\n        max-width: 100% !important;\n        border-radius: 0 !important;\n        border-left: 0 !important;\n        border-right: 0 !important;\n      }\n\n      .sbi-padding {\n        padding-left: 22px !important;\n        padding-right: 22px !important;\n      }\n\n      .sbi-header {\n        padding-top: 22px !important;\n        padding-bottom: 22px !important;\n      }\n\n      .sbi-header-logo-cell,\n      .sbi-header-brand-cell {\n        display: block !important;\n        width: 100% !important;\n        text-align: center !important;\n      }\n\n      .sbi-logo {\n        width: 56px !important;\n        max-width: 56px !important;\n        margin: 0 auto 12px auto !important;\n      }\n\n      .sbi-brand {\n        width: 190px !important;\n        max-width: 190px !important;\n        margin: 0 auto !important;\n      }\n\n      .sbi-tagline {\n        text-align: center !important;\n      }\n\n      .sbi-message {\n        padding-top: 28px !important;\n        padding-bottom: 18px !important;\n      }\n\n      .sbi-message-text,\n      .sbi-message-text p {\n        font-size: 16px !important;\n        line-height: 27px !important;\n      }\n\n      .sbi-signature-card {\n        padding: 18px !important;\n      }\n\n      .sbi-contact-column,\n      .sbi-info-column {\n        display: block !important;\n        width: 100% !important;\n      }\n\n      .sbi-info-column {\n        padding-top: 16px !important;\n      }\n\n      .sbi-social-table {\n        width: 100% !important;\n      }\n\n      .sbi-social-item {\n        display: inline-block !important;\n        padding: 6px 12px 6px 0 !important;\n      }\n\n      .sbi-footer {\n        padding-left: 22px !important;\n        padding-right: 22px !important;\n      }\n    }\n\n    @media only screen and (max-width: 420px) {\n      .sbi-padding {\n        padding-left: 18px !important;\n        padding-right: 18px !important;\n      }\n\n      .sbi-message-text,\n      .sbi-message-text p {\n        font-size: 15px !important;\n        line-height: 26px !important;\n      }\n\n      .sbi-brand {\n        width: 170px !important;\n        max-width: 170px !important;\n      }\n    }\n  </style>\n</head>\n\n<body style=\"margin:0; padding:0; background-color:#f3f5f9; font-family:Arial, Helvetica, sans-serif; color:#101828;\">\n\n  <!-- Preheader caché -->\n  <div style=\"display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; mso-hide:all;\">\n    Message de Sport Business Institute.\n  </div>\n\n  <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%; margin:0; padding:0; background-color:#f3f5f9;\">\n    <tr>\n      <td align=\"center\" class=\"sbi-wrapper\" style=\"padding:28px 14px;\">\n\n        <table role=\"presentation\" width=\"620\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"sbi-container\" style=\"width:620px; max-width:620px; background-color:#ffffff; border-radius:18px; overflow:hidden; border:1px solid #d9e1ee;\">\n\n          <!-- Header -->\n          <tr>\n            <td class=\"sbi-header sbi-padding\" style=\"background-color:#050913; padding:24px 30px; border-bottom:4px solid #0051ff;\">\n\n              <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\">\n                <tr>\n                  <td class=\"sbi-header-logo-cell\" align=\"left\" valign=\"middle\" width=\"74\" style=\"width:74px;\">\n                    <img\n                      src=\"https://firebasestorage.googleapis.com/v0/b/sbi-web-4f6b4.firebasestorage.app/o/site%2Findex%2Flogos%2FLogo_SBI_Tome.png?alt=media\"\n                      width=\"56\"\n                      alt=\"SBI\"\n                      class=\"sbi-logo\"\n                      style=\"display:block; width:56px; max-width:56px; height:auto; border:0;\"\n                    >\n                  </td>\n\n                  <td class=\"sbi-header-brand-cell\" align=\"left\" valign=\"middle\">\n                    <img\n                      src=\"https://firebasestorage.googleapis.com/v0/b/sbi-web-4f6b4.firebasestorage.app/o/site%2Findex%2Flogos%2Fsbi_brand.png?alt=media\"\n                      width=\"214\"\n                      alt=\"Sport Business Institute\"\n                      class=\"sbi-brand\"\n                      style=\"display:block; width:214px; max-width:214px; height:auto; border:0;\"\n                    >\n\n                    <div class=\"sbi-tagline\" style=\"font-size:12px; line-height:18px; color:#8a93a6; font-style:italic; margin-top:8px;\">\n                      Apprendre. Progresser. <span style=\"color:#0051ff;\">Performer.</span>\n                    </div>\n                  </td>\n                </tr>\n              </table>\n\n            </td>\n          </tr>\n\n          <!-- Message principal -->\n          <tr>\n            <td class=\"sbi-message sbi-padding\" style=\"padding:34px 34px 20px 34px; background-color:#ffffff;\">\n\n              <p style=\"margin:0 0 18px 0; font-size:16px; line-height:26px; color:#101828;\">\n                Bonjour {PRENOM},\n              </p>\n\n              <div class=\"sbi-message-text\" style=\"font-size:16px; line-height:27px; color:#253047;\">\n                {MESSAGE_HTML}\n              </div>\n\n              <p style=\"margin:24px 0 0 0; font-size:16px; line-height:26px; color:#101828;\">\n                Bien cordialement,\n              </p>\n\n              <p style=\"margin:4px 0 0 0; font-size:16px; line-height:26px; color:#101828; font-weight:bold;\">\n                {NOM_EXPEDITEUR}\n              </p>\n\n              <p style=\"margin:0; font-size:14px; line-height:22px; color:#667085;\">\n                {POSTE_EXPEDITEUR} · Sport Business Institute\n              </p>\n\n            </td>\n          </tr>\n\n          <!-- Carte signature -->\n          <tr>\n            <td class=\"sbi-padding\" style=\"padding:8px 34px 34px 34px; background-color:#ffffff;\">\n\n              <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"background-color:#f7f9fd; border:1px solid #dce4f2; border-radius:14px;\">\n                <tr>\n                  <td class=\"sbi-signature-card\" style=\"padding:22px;\">\n\n                    <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\">\n                      <tr>\n                        <td style=\"padding-bottom:15px;\">\n                          <div style=\"font-size:13px; line-height:19px; color:#0051ff; font-weight:bold; text-transform:uppercase; letter-spacing:0.8px; font-style:italic;\">\n                            SBI · Sport Business Institute\n                          </div>\n\n                          <div style=\"font-size:14px; line-height:23px; color:#344054; margin-top:8px;\">\n                            Centre de formation dédié aux métiers du football et du sport business.\n                          </div>\n                        </td>\n                      </tr>\n\n                      <tr>\n                        <td style=\"border-top:1px solid #dce4f2; padding-top:16px;\">\n\n                          <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\">\n                            <tr>\n                              <td class=\"sbi-contact-column\" valign=\"top\" width=\"55%\" style=\"width:55%; font-size:14px; line-height:24px; color:#344054;\">\n                                <strong style=\"color:#101828;\">Contact</strong><br>\n\n                                <span style=\"color:#667085;\">Email :</span>\n                                <a href=\"mailto:contact@sbigroup.fr\" style=\"color:#0051ff; text-decoration:none;\">contact@sbigroup.fr</a><br>\n\n                                <span style=\"color:#667085;\">Téléphone :</span>\n                                <a href=\"tel:+33492909025\" style=\"color:#0051ff; text-decoration:none;\">04.92.90.90.25</a><br>\n\n                                <span style=\"color:#667085;\">Site :</span>\n                                <a href=\"https://www.sbigroup.fr\" style=\"color:#0051ff; text-decoration:none;\">www.sbigroup.fr</a>\n                              </td>\n\n                              <td class=\"sbi-info-column\" valign=\"top\" width=\"45%\" style=\"width:45%; font-size:14px; line-height:24px; color:#344054;\">\n                                <strong style=\"color:#101828;\">Formations</strong><br>\n                                <span style=\"color:#667085;\">100% en ligne</span><br>\n                                <span style=\"color:#667085;\">Vidéo, live et à la demande</span><br>\n                                <span style=\"color:#667085;\">Certifications professionnelles</span>\n                              </td>\n                            </tr>\n                          </table>\n\n                        </td>\n                      </tr>\n\n                      <!-- Réseaux sociaux -->\n                      <tr>\n                        <td style=\"padding-top:18px;\">\n                          <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"sbi-social-table\">\n                            <tr>\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{LINKEDIN_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">LinkedIn</a>\n                              </td>\n\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{INSTAGRAM_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">Instagram</a>\n                              </td>\n\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{FACEBOOK_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">Facebook</a>\n                              </td>\n\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{YOUTUBE_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">YouTube</a>\n                              </td>\n\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{X_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">X</a>\n                              </td>\n\n                              <td class=\"sbi-social-item\" style=\"padding-right:12px;\">\n                                <a href=\"{SNAPCHAT_URL}\" style=\"font-size:13px; line-height:20px; color:#344054; text-decoration:none; font-weight:bold;\">Snapchat</a>\n                              </td>\n                            </tr>\n                          </table>\n                        </td>\n                      </tr>\n\n                    </table>\n\n                  </td>\n                </tr>\n              </table>\n\n            </td>\n          </tr>\n\n          <!-- Footer légal discret -->\n          <tr>\n            <td class=\"sbi-footer\" style=\"background-color:#050913; padding:18px 30px;\">\n              <p style=\"margin:0; font-size:11px; line-height:18px; color:#8a93a6;\">\n                Ce message et ses éventuelles pièces jointes sont destinés exclusivement à leur destinataire.\n                Si vous l’avez reçu par erreur, merci d’en informer l’expéditeur et de le supprimer.\n              </p>\n            </td>\n          </tr>\n\n        </table>\n\n      </td>\n    </tr>\n  </table>\n\n</body>\n</html>\n";

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
        .replaceAll("{LINKEDIN_URL}", SBI_SOCIAL_LINKS.linkedin)
        .replaceAll("{INSTAGRAM_URL}", SBI_SOCIAL_LINKS.instagram)
        .replaceAll("{FACEBOOK_URL}", SBI_SOCIAL_LINKS.facebook)
        .replaceAll("{YOUTUBE_URL}", SBI_SOCIAL_LINKS.youtube)
        .replaceAll("{X_URL}", SBI_SOCIAL_LINKS.x)
        .replaceAll("{SNAPCHAT_URL}", SBI_SOCIAL_LINKS.snapchat)
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


function buildNewsletterDetailsTable(data, mode = "subscribed") {
    const rows = [
        ["Email", data.email],
        ["Statut", mode === "already_exists" ? "Déjà inscrit" : "Nouvelle inscription"],
        ["Profession Brevo", "Newsletter si la fiche n'avait aucune profession"],
        ["Consentement newsletter", data.consentNewsletter ? "oui" : "non"],
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

function buildNewsletterConfirmationMessageHtml() {
    return `
        <p style="margin:0 0 16px 0;">Ton inscription à la newsletter SBI est bien confirmée.</p>
        <p style="margin:0 0 16px 0;">Tu recevras les actualités, contenus et informations importantes de Sport Business Institute par email.</p>
        <div style="padding:14px 16px;border:1px solid #dce4f2;background:#f7f9fd;border-radius:12px;color:#253047;line-height:1.7;">
            <strong style="color:#101828;">Newsletter SBI</strong><br>
            Tu peux te désinscrire à tout moment depuis les emails reçus ou en contactant SBI.
        </div>
        <p style="margin:18px 0 0 0;">Bienvenue dans la boucle SBI.</p>`;
}

function buildNewsletterInternalMessageHtml(data, mode = "subscribed") {
    return `
        <p style="margin:0 0 16px 0;">Une nouvelle adresse vient d’être ajoutée à la newsletter SBI depuis le site public.</p>
        ${buildNewsletterDetailsTable(data, mode)}
        <p style="margin:18px 0 0 0;color:#667085;font-size:14px;line-height:22px;">Si la fiche Brevo n’avait pas encore de profession, la valeur <strong>Newsletter</strong> a été renseignée. Elle sera remplacée automatiquement si cette personne envoie ensuite une demande de contact complète.</p>`;
}

function buildNewsletterConfirmationHtml() {
    return renderSbiEmailTemplate({
        prenom: "à toi",
        messageHtml: buildNewsletterConfirmationMessageHtml(),
        nomExpediteur: "L’équipe SBI",
        posteExpediteur: "Newsletter",
        preheader: "Ton inscription à la newsletter SBI est confirmée."
    });
}

function buildNewsletterInternalNotificationHtml(data, mode = "subscribed") {
    return renderSbiEmailTemplate({
        prenom: "l’équipe SBI",
        messageHtml: buildNewsletterInternalMessageHtml(data, mode),
        nomExpediteur: "Newsletter SBI",
        posteExpediteur: "Notification inscription",
        preheader: `Nouvelle inscription newsletter SBI - ${data.email}`
    });
}

function buildNewsletterConfirmationText() {
    return [
        "Bonjour,",
        "",
        "Ton inscription à la newsletter SBI est bien confirmée.",
        "Tu recevras les actualités, contenus et informations importantes de Sport Business Institute par email.",
        "",
        "Tu peux te désinscrire à tout moment depuis les emails reçus ou en contactant SBI.",
        "",
        "Bien cordialement,",
        "L’équipe SBI"
    ].join("\n");
}

function buildNewsletterNotificationText(data, mode = "subscribed") {
    return [
        "Nouvelle inscription newsletter SBI",
        "",
        `Email : ${data.email}`,
        `Statut : ${mode === "already_exists" ? "Déjà inscrit" : "Nouvelle inscription"}`,
        "Profession Brevo : Newsletter si la fiche n'avait aucune profession",
        `Consentement newsletter : ${data.consentNewsletter ? "oui" : "non"}`,
        `Source : ${data.source}`,
        `Page : ${data.page}`,
        `Date : ${data.capturedAt}`
    ].join("\n");
}

function parseNewsletterRequest(body = {}) {
    const consent = body.consent || {};
    const attributes = body.attributes || {};
    const email = cleanString(body.email || attributes.EMAIL, 180).toLowerCase();

    return {
        email,
        consentNewsletter: body.newsletterConsent === true || consent.newsletter === true,
        source: cleanString(body.source || attributes.SOURCE || attributes.CONTACT_SOURCE, 120) || "SBI public newsletter",
        page: cleanString(body.page || attributes.PAGE, 180) || "/index.html",
        capturedAt: cleanString(body.capturedAt || consent.capturedAt, 80) || new Date().toISOString(),
        honeypot: cleanString(body.website || body.company || body.url || body.hp, 120)
    };
}

function validateNewsletterRequest(data) {
    if (data.honeypot) return "HONEYPOT";
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return "L'adresse email n'est pas valide.";
    }
    if (!data.consentNewsletter) {
        return "Veuillez accepter l'inscription à la newsletter SBI.";
    }
    return "";
}

function getNewsletterAttributes(data, existingContact = null) {
    const existingAttributes = existingContact?.attributes || {};
    const existingProfession = cleanString(existingAttributes.PROFESSION, 120);
    const attributes = {
        CONTACT_SOURCE: data.source
    };

    // Newsletter seule : on renseigne PROFESSION uniquement si la fiche
    // Brevo n'avait encore aucune profession. Le formulaire Contact
    // continuera ensuite à remplacer cette valeur par le profil réel.
    if (!existingProfession) {
        attributes.PROFESSION = "Newsletter";
    }

    return attributes;
}

async function getBrevoContactByEmail(email, apiKey) {
    try {
        return await callBrevo(`/contacts/${encodeURIComponent(email)}`, undefined, apiKey, { method: "GET" });
    } catch (error) {
        if (error.status === 404) return null;
        throw error;
    }
}

async function upsertBrevoNewsletterContact(data, apiKey, existingContact = null) {
    return callBrevo("/contacts", {
        email: data.email,
        attributes: getNewsletterAttributes(data, existingContact),
        listIds: [BREVO_NEWSLETTER_LIST_ID],
        updateEnabled: true
    }, apiKey);
}

async function sendBrevoEmail(payload, apiKey) {
    return callBrevo("/smtp/email", payload, apiKey);
}

async function sendBrevoTransactionalEmail(payload, apiKey, transactionTags = []) {
    const tags = Array.from(new Set([
        "sbi_transactional",
        ...(Array.isArray(payload?.tags) ? payload.tags : []),
        ...(Array.isArray(transactionTags) ? transactionTags : [])
    ].map((tag) => cleanString(tag, 80)).filter(Boolean)));

    return sendBrevoEmail({
        ...payload,
        tags,
        headers: {
            ...(payload?.headers || {}),
            "X-SBI-Email-Type": "transactional",
            "X-SBI-Transactional": "true"
        }
    }, apiKey);
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

async function sendBrevoNewsletterNotification(data, apiKey, mode = "subscribed") {
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
            name: data.email
        },
        subject: `Nouvelle inscription newsletter SBI - ${data.email}`,
        htmlContent: buildNewsletterInternalNotificationHtml(data, mode),
        textContent: buildNewsletterNotificationText(data, mode)
    }, apiKey);
}

async function sendBrevoNewsletterConfirmation(data, apiKey) {
    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: data.email,
            name: data.email
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Inscription newsletter confirmée",
        htmlContent: buildNewsletterConfirmationHtml(data),
        textContent: buildNewsletterConfirmationText(data)
    }, apiKey);
}


/* =======================================================================
 * SBI 8.0P.134 - ADMIN ACCOUNT MAIL WORKFLOW
 * -----------------------------------------------------------------------
 * Actions sensibles Auth déplacées côté serveur : création compte,
 * reset password, édition profil/rôle/statut et suppression enrichies
 * avec mails Brevo + audit.
 * ======================================================================= */

const ACCOUNT_ROLES = ["student", "teacher", "admin"];
const ACCOUNT_PREPARATION_STATES = ["not_prepared", "to_check", "ready", "completed"];
const ACCOUNT_PREPARATION_LABELS = {
    not_prepared: "Compte à préparer",
    to_check: "À vérifier",
    ready: "Prêt",
    completed: "Terminé"
};


function cleanEmail(value) {
    return cleanString(value, 180).toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

const ACCOUNT_EMAIL_BLOCKING_ISSUES = ["invalid_email", "email_bounced"];
const BREVO_BOUNCE_EVENTS = new Set([
    "hard_bounce",
    "hardbounce",
    "soft_bounce",
    "softbounce",
    "blocked",
    "spam",
    "complaint",
    "invalid",
    "invalid_email",
    "email_invalid"
]);

function hasBlockingFinalizationEmailIssue(accountData = {}) {
    const issueCode = cleanString(accountData.accountStatus?.finalizationIssueCode || "", 80);
    return ACCOUNT_EMAIL_BLOCKING_ISSUES.includes(issueCode);
}

function normalizeBrevoEventName(value) {
    return cleanString(value, 80)
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function isBrevoBounceEvent(value) {
    const normalized = normalizeBrevoEventName(value);
    return BREVO_BOUNCE_EVENTS.has(normalized);
}

function extractBrevoWebhookEvents(body) {
    if (!body) return [];

    if (typeof body === "string") {
        try {
            const parsed = JSON.parse(body);
            return extractBrevoWebhookEvents(parsed);
        } catch {
            return [];
        }
    }

    if (Array.isArray(body)) return body.filter(Boolean);
    if (Array.isArray(body.events)) return body.events.filter(Boolean);
    return [body];
}

function extractBrevoEventEmail(event = {}) {
    const candidate = event.email
        || event.recipient
        || event.recipientEmail
        || event.to
        || event.emailTo
        || event.contact?.email
        || "";

    if (Array.isArray(candidate)) return cleanEmail(candidate[0] || "");
    return cleanEmail(candidate);
}

function extractBrevoEventType(event = {}) {
    return event.event
        || event.eventType
        || event.type
        || event.reason
        || "";
}

function extractBrevoBounceMessage(event = {}) {
    return cleanString(
        event.reason
        || event.message
        || event.description
        || event.subject
        || "Email transactionnel rejeté par Brevo.",
        500
    );
}

function normalizeAccountRole(role) {
    const normalized = cleanString(role, 40).toLowerCase();
    return ACCOUNT_ROLES.includes(normalized) ? normalized : "student";
}

function getAccountRoleLabel(role) {
    const normalized = normalizeAccountRole(role);
    if (normalized === "teacher") return "Enseignant";
    if (normalized === "admin") return "Administrateur";
    return "Étudiant";
}

function normalizeAccountPreparationState(value) {
    const normalized = cleanString(value, 40).toLowerCase();
    return ACCOUNT_PREPARATION_STATES.includes(normalized) ? normalized : "not_prepared";
}

function getAccountPreparationLabel(value) {
    const normalized = normalizeAccountPreparationState(value);
    return ACCOUNT_PREPARATION_LABELS[normalized] || ACCOUNT_PREPARATION_LABELS.not_prepared;
}

function getNoteAuditState(value) {
    return cleanString(value, 2000) ? "renseignée" : "vide";
}

function formatAccountPrenom(value) {
    return cleanString(value, 80).toLowerCase().replace(/(^|\s|-)\S/g, letter => letter.toUpperCase());
}

function formatAccountNom(value) {
    return cleanString(value, 80).toUpperCase();
}

function getAccountDisplayName(data = {}) {
    return cleanString(`${data.prenom || ""} ${data.nom || ""}`, 160) || data.email || "Utilisateur SBI";
}

function getActorEmail(request, callerData = {}) {
    return cleanEmail(request.auth?.token?.email || callerData.email || SBI_CONTACT_EMAIL);
}

async function requireAdminCaller(request, db) {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "Vous devez être connecté pour effectuer cette action.");
    }

    const callerUid = request.auth.uid;
    const callerDoc = await db.collection("users").doc(callerUid).get();
    const callerData = callerDoc.data();

    if (!callerDoc.exists || !callerData || callerData.statut === "suspendu") {
        throw new HttpsError("permission-denied", "Action refusée : compte administrateur introuvable ou suspendu.");
    }

    if (callerData.isGod !== true && callerData.role !== "admin") {
        throw new HttpsError("permission-denied", "Action refusée : seuls les administrateurs peuvent effectuer cette action.");
    }

    return {
        uid: callerUid,
        email: getActorEmail(request, callerData),
        data: callerData,
        name: getAccountDisplayName(callerData)
    };
}

async function safeWriteAccountAuditLog(db, payload) {
    try {
        await db.collection("accountAuditLogs").add({
            ...payload,
            source: payload.source || "admin",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Erreur audit compte SBI :", error.message);
    }
}

async function requireActiveCourseCaller(request, db) {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "Vous devez être connecté pour effectuer cette action.");
    }

    const callerUid = request.auth.uid;
    const callerDoc = await db.collection("users").doc(callerUid).get();
    const callerData = callerDoc.exists ? (callerDoc.data() || {}) : null;

    if (!callerData || callerData.statut === "suspendu") {
        throw new HttpsError("permission-denied", "Action refusée : compte introuvable ou suspendu.");
    }

    return {
        uid: callerUid,
        email: getActorEmail(request, callerData),
        data: callerData,
        name: getAccountDisplayName(callerData),
        isAdmin: callerData.isGod === true || callerData.role === "admin",
        isTeacher: callerData.role === "teacher"
    };
}


function normalizeFormationIndexValues(value) {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
                .filter(Boolean)
                .map((item) => String(item).trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

function formationIndexArraysEqual(a, b) {
    const arrA = normalizeFormationIndexValues(a);
    const arrB = normalizeFormationIndexValues(b);

    if (arrA.length !== arrB.length) return false;
    return arrA.every((value, index) => value === arrB[index]);
}

function ensureFormationIndexEntry(index, uid) {
    if (!uid) return null;

    const safeUid = String(uid).trim();
    if (!safeUid) return null;

    if (!index.has(safeUid)) {
        index.set(safeUid, {
            ids: new Set(),
            titles: new Set()
        });
    }

    return index.get(safeUid);
}

function addFormationAccessToUserIndex(index, uid, formationId, formationTitle) {
    const entry = ensureFormationIndexEntry(index, uid);
    if (!entry) return;

    if (formationId) entry.ids.add(String(formationId));
    if (formationTitle) entry.titles.add(String(formationTitle).trim());
}

async function commitFormationIndexBatch(db, operations) {
    if (operations.length === 0) return;

    const batch = db.batch();
    operations.forEach(({ ref, payload }) => {
        batch.update(ref, payload);
    });
    await batch.commit();
}

exports.adminSyncUserFormationIndexes = onCall({
    region: "europe-west1",
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);

    const [formationsSnap, usersSnap] = await Promise.all([
        db.collection("formations").get(),
        db.collection("users").get()
    ]);

    const index = new Map();
    usersSnap.forEach((userDoc) => {
        ensureFormationIndexEntry(index, userDoc.id);
    });

    formationsSnap.forEach((formationDoc) => {
        const formation = formationDoc.data() || {};
        const formationId = String(formationDoc.id);
        const formationTitle = formation.titre ? String(formation.titre).trim() : "";
        const profs = Array.isArray(formation.profs) ? formation.profs : [];
        const students = Array.isArray(formation.students) ? formation.students : [];

        [...profs, ...students].forEach((uid) => {
            addFormationAccessToUserIndex(index, uid, formationId, formationTitle);
        });
    });

    let updated = 0;
    let skipped = 0;
    const pendingOperations = [];

    for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data() || {};
        const entry = index.get(String(userDoc.id)) || { ids: new Set(), titles: new Set() };
        const nextFormationIds = normalizeFormationIndexValues(Array.from(entry.ids));
        const nextFormationsAcces = normalizeFormationIndexValues(Array.from(entry.titles));

        const currentFormationIds = normalizeFormationIndexValues(userData.formationIds || []);
        const currentFormationsAcces = normalizeFormationIndexValues(userData.formationsAcces || []);

        if (
            formationIndexArraysEqual(currentFormationIds, nextFormationIds)
            && formationIndexArraysEqual(currentFormationsAcces, nextFormationsAcces)
        ) {
            skipped += 1;
            continue;
        }

        pendingOperations.push({
            ref: userDoc.ref,
            payload: {
                formationIds: nextFormationIds,
                formationsAcces: nextFormationsAcces,
                formationIndexSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
                formationIndexSyncedBy: caller.uid
            }
        });
        updated += 1;

        if (pendingOperations.length >= 450) {
            await commitFormationIndexBatch(db, pendingOperations.splice(0));
        }
    }

    await commitFormationIndexBatch(db, pendingOperations);

    await safeWriteAccountAuditLog(db, {
        type: "account.formation_indexes_synced",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: "*",
        targetEmail: "",
        targetRole: "",
        updated,
        skipped,
        formations: formationsSnap.size,
        users: usersSnap.size
    });

    return {
        success: true,
        updated,
        skipped,
        totalUsers: usersSnap.size,
        totalFormations: formationsSnap.size,
        message: updated > 0
            ? `${updated} index utilisateur synchronisé(s).`
            : "Tous les index utilisateurs étaient déjà à jour."
    };
});

function buildActionButtonHtml(url, label) {
    if (!url) return "";
    return `
        <p style="margin:22px 0;">
            <a href="${escapeHtml(url)}" style="display:inline-block;background:#0051ff;color:#ffffff;font-weight:bold;padding:13px 18px;border-radius:10px;text-decoration:none;">
                ${escapeHtml(label)}
            </a>
        </p>
        <p style="margin:0 0 18px 0;font-size:13px;line-height:20px;color:#667085;">
            Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
            <a href="${escapeHtml(url)}" style="color:#0051ff;word-break:break-all;">${escapeHtml(url)}</a>
        </p>`;
}

function buildAccountInternalHtml(eventLabel, details = {}) {
    const rows = Object.entries(details)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([label, value]) => `
            <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#0051ff;font-weight:bold;width:38%;">${escapeHtml(label)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#253047;">${escapeHtml(value)}</td>
            </tr>
        `).join("");

    return renderSbiEmailTemplate({
        prenom: "équipe SBI",
        nomExpediteur: "Automatisation SBI",
        posteExpediteur: "Notifications comptes",
        preheader: `Action compte SBI - ${eventLabel}`,
        messageHtml: `
            <p style="margin:0 0 16px 0;">Une action sensible a été effectuée dans l’administration SBI.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #dce4f2;border-radius:12px;overflow:hidden;background:#f7f9fd;">
                ${rows}
            </table>
        `
    });
}

function buildAccountInternalText(eventLabel, details = {}) {
    const lines = Object.entries(details)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([label, value]) => `${label}: ${value}`);
    return [`Action compte SBI - ${eventLabel}`, "", ...lines].join("\n");
}

async function sendAccountInternalEmail(eventLabel, details, apiKey) {
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
            email: isValidEmail(details["Admin email"]) ? details["Admin email"] : SBI_CONTACT_EMAIL,
            name: details["Admin"] || "Administration SBI"
        },
        subject: `SBI Admin - ${eventLabel}`,
        htmlContent: buildAccountInternalHtml(eventLabel, details),
        textContent: buildAccountInternalText(eventLabel, details)
    }, apiKey);
}

async function sendAccountInviteEmail(account, resetLink, apiKey) {
    const roleLabel = getAccountRoleLabel(account.role);
    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: account.email,
            name: getAccountDisplayName(account)
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Votre espace personnel est prêt",
        htmlContent: renderSbiEmailTemplate({
            prenom: account.prenom || "",
            nomExpediteur: "L’équipe SBI",
            posteExpediteur: "Administration",
            preheader: "Votre espace SBI est prêt.",
            messageHtml: `
                <p style="margin:0 0 16px 0;">Votre espace <strong>${escapeHtml(roleLabel)}</strong> vient d’être créé sur la plateforme Sport Business Institute.</p>
                <p style="margin:0 0 16px 0;">Pour sécuriser votre accès, définissez votre mot de passe via le lien ci-dessous.</p>
                ${buildActionButtonHtml(resetLink, "Définir mon mot de passe")}
                <p style="margin:0;">Si vous n’êtes pas à l’origine de cette demande, contactez l’équipe SBI.</p>
            `
        }),
        textContent: `Bonjour ${account.prenom || ""},\n\nVotre espace ${roleLabel} SBI est prêt. Définissez votre mot de passe avec ce lien :\n${resetLink}\n\nSport Business Institute`
    }, apiKey);
}

async function sendAccountResetEmail(account, resetLink, apiKey) {
    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: account.email,
            name: getAccountDisplayName(account)
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Réinitialisation de votre mot de passe",
        htmlContent: renderSbiEmailTemplate({
            prenom: account.prenom || "",
            nomExpediteur: "L’équipe SBI",
            posteExpediteur: "Administration",
            preheader: "Réinitialisation de votre mot de passe SBI.",
            messageHtml: `
                <p style="margin:0 0 16px 0;">Une réinitialisation de mot de passe a été demandée pour votre espace SBI.</p>
                <p style="margin:0 0 16px 0;">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
                ${buildActionButtonHtml(resetLink, "Réinitialiser mon mot de passe")}
                <p style="margin:0;">Si vous n’avez pas demandé cette action, contactez l’équipe SBI.</p>
            `
        }),
        textContent: `Bonjour ${account.prenom || ""},\n\nRéinitialisez votre mot de passe SBI avec ce lien :\n${resetLink}\n\nSport Business Institute`
    }, apiKey);
}

async function sendAccountFinalizationEmail(account, finalizationLink, apiKey) {
    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: account.email,
            name: getAccountDisplayName(account)
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Finalisez votre accès à la plateforme",
        htmlContent: renderSbiEmailTemplate({
            prenom: account.prenom || "",
            nomExpediteur: "L’équipe SBI",
            posteExpediteur: "Administration",
            preheader: "Finalisez votre accès à votre espace SBI.",
            messageHtml: `
                <p style="margin:0 0 16px 0;">Votre compte Sport Business Institute a été créé, mais votre accès n’a pas encore été finalisé.</p>
                <p style="margin:0 0 16px 0;">Pour activer votre espace personnel, cliquez sur le bouton ci-dessous et définissez votre mot de passe.</p>
                ${buildActionButtonHtml(finalizationLink, "Finaliser mon compte")}
                <p style="margin:0 0 16px 0;">Ce lien vous permet de finaliser votre accès à la plateforme SBI.</p>
                <p style="margin:0;">Si vous avez déjà finalisé votre compte, vous pouvez ignorer ce message.</p>
            `
        }),
        textContent: `Bonjour ${account.prenom || ""},\n\nVotre compte SBI a été créé, mais votre accès n’a pas encore été finalisé.\n\nFinalisez votre compte avec ce lien :\n${finalizationLink}\n\nSport Business Institute`
    }, apiKey);
}

async function sendAccountDeletedEmail(account, apiKey) {
    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: account.email,
            name: getAccountDisplayName(account)
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Suppression de votre accès",
        htmlContent: renderSbiEmailTemplate({
            prenom: account.prenom || "",
            nomExpediteur: "L’équipe SBI",
            posteExpediteur: "Administration",
            preheader: "Votre accès SBI a été supprimé.",
            messageHtml: `
                <p style="margin:0 0 16px 0;">Votre accès à l’espace privé Sport Business Institute a été supprimé par l’administration.</p>
                <p style="margin:0;">Si cette action vous semble anormale, contactez l’équipe SBI à <a href="mailto:${SBI_CONTACT_EMAIL}" style="color:#0051ff;">${SBI_CONTACT_EMAIL}</a>.</p>
            `
        }),
        textContent: `Bonjour ${account.prenom || ""},\n\nVotre accès à l’espace privé SBI a été supprimé par l’administration.\n\nContact : ${SBI_CONTACT_EMAIL}`
    }, apiKey);
}

async function sendAccountUpdatedEmail(account, changeLabels, apiKey) {
    const changesHtml = changeLabels.length
        ? `<ul style="margin:0 0 16px 18px;padding:0;color:#253047;line-height:1.7;">${changeLabels.map(label => `<li>${escapeHtml(label)}</li>`).join("")}</ul>`
        : "";

    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: account.email,
            name: getAccountDisplayName(account)
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Mise à jour de votre compte",
        htmlContent: renderSbiEmailTemplate({
            prenom: account.prenom || "",
            nomExpediteur: "L’équipe SBI",
            posteExpediteur: "Administration",
            preheader: "Votre compte SBI a été mis à jour.",
            messageHtml: `
                <p style="margin:0 0 16px 0;">Votre compte Sport Business Institute a été mis à jour par l’administration.</p>
                ${changesHtml}
                <p style="margin:0;">Si cette action vous semble anormale, contactez l’équipe SBI à <a href="mailto:${SBI_CONTACT_EMAIL}" style="color:#0051ff;">${SBI_CONTACT_EMAIL}</a>.</p>
            `
        }),
        textContent: `Bonjour ${account.prenom || ""},\n\nVotre compte SBI a été mis à jour.\n${changeLabels.map(label => `- ${label}`).join("\n")}\n\nContact : ${SBI_CONTACT_EMAIL}`
    }, apiKey);
}


function buildAccountEmailChangeCardHtml(rows) {
    const tableRows = rows.map(([label, value]) => `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#0051ff;font-weight:bold;width:40%;">${escapeHtml(label)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#101828;word-break:break-word;">${escapeHtml(value)}</td>
        </tr>`).join("");

    return `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #dce4f2;border-radius:12px;overflow:hidden;background:#f7f9fd;">
            ${tableRows}
        </table>`;
}

function renderAccountEmailChangedOldAddressHtml(account, oldEmail, newEmail) {
    return renderSbiEmailTemplate({
        prenom: account.prenom || "",
        nomExpediteur: "L’équipe SBI",
        posteExpediteur: "Administration",
        preheader: "Votre adresse email SBI a été modifiée.",
        messageHtml: `
            <p style="margin:0 0 16px 0;">L’adresse email associée à votre compte Sport Business Institute vient d’être modifiée par l’administration.</p>
            ${buildAccountEmailChangeCardHtml([
                ["Ancienne adresse", oldEmail],
                ["Nouvelle adresse", newEmail]
            ])}
            <p style="margin:18px 0 0 0;">Si vous n’êtes pas à l’origine de cette modification, contactez immédiatement l’équipe SBI à <a href="mailto:${SBI_CONTACT_EMAIL}" style="color:#0051ff;">${SBI_CONTACT_EMAIL}</a>.</p>
        `
    });
}

function renderAccountEmailChangedNewAddressHtml(account, oldEmail, newEmail) {
    return renderSbiEmailTemplate({
        prenom: account.prenom || "",
        nomExpediteur: "L’équipe SBI",
        posteExpediteur: "Administration",
        preheader: "Votre nouvelle adresse email SBI est active.",
        messageHtml: `
            <p style="margin:0 0 16px 0;">Cette adresse est désormais liée à votre compte Sport Business Institute.</p>
            ${buildAccountEmailChangeCardHtml([
                ["Nouvelle adresse de connexion", newEmail],
                ["Ancienne adresse", oldEmail]
            ])}
            <p style="margin:18px 0 0 0;">Votre mot de passe reste inchangé. Si vous avez un doute, demandez une réinitialisation depuis la page de connexion ou contactez l’équipe SBI.</p>
        `
    });
}

async function sendAccountEmailChangedOldAddressEmail(account, oldEmail, newEmail, apiKey) {
    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: oldEmail,
            name: getAccountDisplayName(account)
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Votre adresse email de connexion a été modifiée",
        htmlContent: renderAccountEmailChangedOldAddressHtml(account, oldEmail, newEmail)
    }, apiKey);
}

async function sendAccountEmailChangedNewAddressEmail(account, oldEmail, newEmail, apiKey) {
    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: newEmail,
            name: getAccountDisplayName(account)
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Nouvelle adresse email de connexion",
        htmlContent: renderAccountEmailChangedNewAddressHtml(account, oldEmail, newEmail)
    }, apiKey);
}

function mapAuthCreateError(error) {
    if (error?.code === "auth/email-already-exists") {
        return new HttpsError("already-exists", "Un compte Firebase Auth utilise déjà cette adresse email.");
    }
    if (error?.code === "auth/invalid-email") {
        return new HttpsError("invalid-argument", "L'adresse email n'est pas valide.");
    }
    return new HttpsError("internal", `Création Auth impossible : ${error.message}`);
}

function buildInitialAccountStatus() {
    return {
        activationState: "pending_password",
        preparationState: "not_prepared",
        invitationSentAt: null,
        passwordResetSentAt: null,
        firstLoginAt: null,
        lastLoginAt: null,
        lastAccessEmailSentAt: null,
        emailVerifiedAt: null,
        finalizationInviteSentAt: null,
        finalizationInviteCount: 0,
        finalizationReminderEnabled: true,
        reminderCount: 0,
        lastReminderSentAt: null,
        finalizationIssueCode: "",
        finalizationIssueAt: null,
        finalizationIssueMessage: "",
        finalizationIssueSource: "",
        finalizationIssueEvent: "",
        finalizationIssueResolvedAt: null,
        finalizationEscalationAt: null,
        finalizationEscalationResolvedAt: null,
        finalizationEscalationResolvedBy: ""
    };
}

function keepActiveOrPendingPassword(accountData = {}) {
    const currentActivation = accountData.accountStatus?.activationState || accountData.activationState || "";
    return currentActivation === "active" ? "active" : "pending_password";
}

function hasAccountFinalizedAccess(accountData = {}) {
    return Boolean(
        accountData.accountStatus?.firstLoginAt
        || accountData.firstLoginAt
        || accountData.accountStatus?.activationState === "active"
        || accountData.activationState === "active"
    );
}

function toAccountReminderMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

function isAccountDurableFinalizationEligible(accountData = {}) {
    if (!accountData || accountData.statut === "suspendu") return false;
    return !hasAccountFinalizedAccess(accountData);
}

function createRawFinalizationToken() {
    return crypto.randomBytes(36).toString("base64url");
}

function hashFinalizationToken(token) {
    return crypto
        .createHash("sha256")
        .update(String(token || ""), "utf8")
        .digest("hex");
}

function buildDurableFinalizationUrl(rawToken) {
    const url = new URL(SBI_PASSWORD_RESET_URL);
    url.searchParams.set("mode", SBI_FINALIZATION_TOKEN_MODE);
    url.searchParams.set("token", rawToken);
    return url.toString();
}

async function createDurableFinalizationLink(db, { uid, email, accountData = {}, userRef = null, source = "finalization" }) {
    const targetUid = cleanString(uid, 180);
    const normalizedEmail = cleanEmail(email || accountData.email || "");

    if (!targetUid) throw new HttpsError("invalid-argument", "UID utilisateur manquant pour la finalisation.");
    if (!isValidEmail(normalizedEmail)) throw new HttpsError("failed-precondition", "Email utilisateur invalide ou manquant.");
    if (!isAccountDurableFinalizationEligible(accountData)) {
        throw new HttpsError("failed-precondition", "Ce compte n’est pas éligible à une finalisation initiale.");
    }

    const finalUserRef = userRef || db.collection("users").doc(targetUid);
    const rawToken = createRawFinalizationToken();
    const tokenHash = hashFinalizationToken(rawToken);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const finalizationUrl = buildDurableFinalizationUrl(rawToken);

    await db.collection(SBI_FINALIZATION_TOKEN_COLLECTION).doc(tokenHash).set({
        uid: targetUid,
        email: normalizedEmail,
        purpose: SBI_FINALIZATION_TOKEN_PURPOSE,
        status: "active",
        source,
        createdAt: now,
        updatedAt: now,
        lastSentAt: now,
        usedAt: null,
        revokedAt: null,
        mode: SBI_FINALIZATION_TOKEN_MODE
    }, { merge: false });

    await finalUserRef.set({
        accountStatus: {
            ...(accountData.accountStatus || {}),
            activationState: "pending_password",
            finalizationLinkMode: "durable_token",
            finalizationTokenLastSentAt: now,
            finalizationTokenIssueCount: admin.firestore.FieldValue.increment(1)
        },
        updatedAt: now
    }, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: "account.finalization_token_created",
        actorUid: "system",
        actorEmail: source,
        targetUid,
        targetEmail: normalizedEmail,
        targetRole: accountData.role || "",
        source
    });

    return finalizationUrl;
}

async function assertDurableFinalizationTokenUsable(db, tokenRef, tokenData = {}, { transaction = null } = {}) {
    if (tokenData.purpose !== SBI_FINALIZATION_TOKEN_PURPOSE) {
        throw new HttpsError("failed-precondition", "Lien de finalisation invalide.");
    }

    const status = cleanString(tokenData.status || "", 80).toLowerCase();
    const processingAgeMs = Date.now() - toAccountReminderMillis(tokenData.processingAt);
    const processingIsStale = status === "processing" && processingAgeMs > SBI_FINALIZATION_PROCESSING_TTL_MS;

    if (!["active", "processing"].includes(status) || (status === "processing" && !processingIsStale)) {
        throw new HttpsError("failed-precondition", "Ce lien de finalisation a déjà été utilisé ou remplacé.");
    }

    const uid = cleanString(tokenData.uid || "", 180);
    const email = cleanEmail(tokenData.email || "");
    if (!uid || !isValidEmail(email)) {
        throw new HttpsError("failed-precondition", "Lien de finalisation incomplet.");
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = transaction ? await transaction.get(userRef) : await userRef.get();
    if (!userSnap.exists) throw new HttpsError("not-found", "Compte utilisateur introuvable.");

    const userData = userSnap.data() || {};
    if (userData.statut === "suspendu") {
        throw new HttpsError("permission-denied", "Compte suspendu. Contactez l’équipe SBI.");
    }

    if (hasAccountFinalizedAccess(userData)) {
        if (transaction) {
            transaction.set(tokenRef, {
                status: "revoked",
                revokedAt: admin.firestore.FieldValue.serverTimestamp(),
                revokedReason: "account_already_finalized",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        throw new HttpsError("failed-precondition", "Ce compte est déjà activé. Connectez-vous ou demandez une réinitialisation classique.");
    }

    const accountEmail = cleanEmail(userData.email || "");
    if (accountEmail && accountEmail !== email) {
        throw new HttpsError("failed-precondition", "Ce lien ne correspond plus à l’adresse email actuelle du compte.");
    }

    tokenData.userData = userData;
}

async function readDurableFinalizationToken(rawToken, { reserve = false } = {}) {
    const token = cleanString(rawToken, 500);
    if (!token) throw new HttpsError("invalid-argument", "Token de finalisation manquant.");

    const tokenHash = hashFinalizationToken(token);
    const db = admin.firestore();
    const tokenRef = db.collection(SBI_FINALIZATION_TOKEN_COLLECTION).doc(tokenHash);

    if (!reserve) {
        const tokenSnap = await tokenRef.get();
        if (!tokenSnap.exists) throw new HttpsError("not-found", "Lien de finalisation introuvable ou déjà remplacé.");
        const tokenData = tokenSnap.data() || {};
        await assertDurableFinalizationTokenUsable(db, tokenRef, tokenData);
        return { tokenRef, tokenData };
    }

    return db.runTransaction(async (transaction) => {
        const tokenSnap = await transaction.get(tokenRef);
        if (!tokenSnap.exists) throw new HttpsError("not-found", "Lien de finalisation introuvable ou déjà remplacé.");
        const tokenData = tokenSnap.data() || {};
        await assertDurableFinalizationTokenUsable(db, tokenRef, tokenData, { transaction });
        transaction.set(tokenRef, {
            status: "processing",
            processingAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return { tokenRef, tokenData };
    });
}

async function revokeSiblingFinalizationTokens(db, uid, currentTokenRef) {
    const activeSnap = await db.collection(SBI_FINALIZATION_TOKEN_COLLECTION)
        .where("uid", "==", uid)
        .where("purpose", "==", SBI_FINALIZATION_TOKEN_PURPOSE)
        .where("status", "in", ["active", "processing"])
        .limit(100)
        .get();

    if (activeSnap.empty) return;

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    activeSnap.forEach((docSnap) => {
        if (docSnap.ref.path === currentTokenRef.path) return;
        batch.set(docSnap.ref, {
            status: "revoked",
            revokedAt: now,
            revokedReason: "password_created",
            updatedAt: now
        }, { merge: true });
    });

    await batch.commit();
}

function getAccountCreationLockId(email) {
    const normalizedEmail = cleanEmail(email);
    return Buffer
        .from(normalizedEmail, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

async function assertAccountEmailAvailableInAuth(email) {
    try {
        await admin.auth().getUserByEmail(email);
        throw new HttpsError("already-exists", "Un compte Firebase Auth utilise déjà cette adresse email.");
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        if (error?.code === "auth/user-not-found") return;
        throw new HttpsError("internal", `Vérification Auth impossible : ${error.message}`);
    }
}

async function acquireAccountCreationLock(db, email, caller = {}) {
    const normalizedEmail = cleanEmail(email);
    const lockRef = db.collection("accountCreationEmailLocks").doc(getAccountCreationLockId(normalizedEmail));
    const lockOwner = `${caller.uid || "unknown"}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await db.runTransaction(async (transaction) => {
        const lockSnap = await transaction.get(lockRef);
        const nowMs = Date.now();
        const expiresAtMs = nowMs + SBI_ACCOUNT_CREATION_LOCK_TTL_MS;

        let previousLock = null;

        if (lockSnap.exists) {
            const lockData = lockSnap.data() || {};
            const lockExpiresAtMs = toAccountReminderMillis(lockData.expiresAt || lockData.expiresAtIso);
            const lockUpdatedAtMs = toAccountReminderMillis(lockData.updatedAt || lockData.createdAt || lockData.expiresAtIso);
            const lockAgeMs = lockUpdatedAtMs ? nowMs - lockUpdatedAtMs : Number.POSITIVE_INFINITY;

            if (
                lockData.status === "creating"
                && lockExpiresAtMs > nowMs
                && lockAgeMs >= 0
                && lockAgeMs < SBI_ACCOUNT_CREATION_LOCK_ACTIVE_GRACE_MS
            ) {
                throw new HttpsError(
                    "already-exists",
                    "Une création de compte est déjà en cours pour cette adresse email. Réessayez dans quelques secondes."
                );
            }

            previousLock = {
                status: lockData.status || "",
                lockOwner: lockData.lockOwner || "",
                updatedAt: lockData.updatedAt || lockData.createdAt || null,
                overriddenAt: admin.firestore.FieldValue.serverTimestamp()
            };
        }

        transaction.set(lockRef, {
            email: normalizedEmail,
            status: "creating",
            lockOwner,
            actorUid: caller.uid || "",
            actorEmail: caller.email || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
            expiresAtIso: new Date(expiresAtMs).toISOString(),
            recoveredPreviousLock: previousLock
        }, { merge: false });
    });

    return { lockRef, lockOwner };
}

async function releaseAccountCreationLock(lock, status = "released", extra = {}) {
    if (!lock?.lockRef) return;

    try {
        await lock.lockRef.set({
            status,
            lockOwner: lock.lockOwner || "",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...extra
        }, { merge: true });
    } catch (error) {
        console.error("Libération verrou création compte impossible :", error.message);
    }
}

function shouldSendFinalizationReminder(accountData = {}, nowMs = Date.now()) {
    if (accountData.statut === "suspendu") return false;
    if (hasAccountFinalizedAccess(accountData)) return false;

    const accountStatus = accountData.accountStatus || {};
    if (accountStatus.finalizationReminderEnabled === false) return false;
    if (hasBlockingFinalizationEmailIssue(accountData)) return false;

    const activationState = accountStatus.activationState || accountData.activationState || "";
    if (activationState && activationState !== "pending_password") return false;

    const reminderCount = Number(accountStatus.reminderCount || 0);
    if (reminderCount >= SBI_FINALIZATION_REMINDER_MAX_COUNT) return false;

    const lastReminderMs = toAccountReminderMillis(accountStatus.lastReminderSentAt);
    const manualInviteMs = toAccountReminderMillis(accountStatus.finalizationInviteSentAt);
    const invitationMs = toAccountReminderMillis(accountStatus.invitationSentAt);
    const passwordResetMs = toAccountReminderMillis(accountStatus.passwordResetSentAt);
    const lastAccessMs = toAccountReminderMillis(accountStatus.lastAccessEmailSentAt);
    const createdMs = toAccountReminderMillis(accountData.createdAt || accountData.dateCreation);

    const lastSignalMs = Math.max(lastReminderMs, manualInviteMs, invitationMs, passwordResetMs, lastAccessMs, createdMs);

    if (!lastSignalMs) return true;
    return nowMs - lastSignalMs >= SBI_FINALIZATION_REMINDER_DELAY_MS;
}

exports.adminCreateUserAccount = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const data = request.data || {};

    const prenom = formatAccountPrenom(data.prenom);
    const nom = formatAccountNom(data.nom);
    const email = cleanEmail(data.email);
    const role = normalizeAccountRole(data.role);

    if (!prenom) throw new HttpsError("invalid-argument", "Le prénom est obligatoire.");
    if (!nom) throw new HttpsError("invalid-argument", "Le nom est obligatoire.");
    if (!isValidEmail(email)) throw new HttpsError("invalid-argument", "L'adresse email n'est pas valide.");

    let creationLock = null;
    let createdUser = null;

    try {
        creationLock = await acquireAccountCreationLock(db, email, caller);

        const existingUserByEmail = await db.collection("users").where("email", "==", email).limit(1).get();
        if (!existingUserByEmail.empty) {
            throw new HttpsError("already-exists", "Un document utilisateur existe déjà avec cette adresse email.");
        }

        await assertAccountEmailAvailableInAuth(email);

        const accountData = {
            prenom,
            nom,
            email,
            role,
            statut: "actif",
            isGod: false,
            isOnline: false,
            lastSeenAt: null,
            dateCreation: new Date().toISOString(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: caller.uid,
            formationsAcces: [],
            accountStatus: buildInitialAccountStatus()
        };

        try {
            createdUser = await admin.auth().createUser({
                email,
                displayName: getAccountDisplayName(accountData),
                disabled: false
            });
        } catch (error) {
            throw mapAuthCreateError(error);
        }

        try {
            await db.collection("users").doc(createdUser.uid).set(accountData, { merge: false });
        } catch (error) {
            try {
                await admin.auth().deleteUser(createdUser.uid);
            } catch (rollbackError) {
                console.error("Rollback Auth impossible après échec Firestore :", rollbackError.message);
            }
            throw new HttpsError("internal", `Création Firestore impossible : ${error.message}`);
        }

        const apiKey = BREVO_API_KEY.value();
        let warning = "";

        try {
            if (!apiKey) throw new Error("BREVO_API_KEY manquant.");
            const resetLink = await createDurableFinalizationLink(db, {
                uid: createdUser.uid,
                email,
                accountData,
                userRef: db.collection("users").doc(createdUser.uid),
                source: "account-created"
            });
            await sendAccountInviteEmail({ ...accountData, uid: createdUser.uid }, resetLink, apiKey);
            await db.collection("users").doc(createdUser.uid).update({
                "accountStatus.invitationSentAt": admin.firestore.FieldValue.serverTimestamp(),
                "accountStatus.lastAccessEmailSentAt": admin.firestore.FieldValue.serverTimestamp()
            });
            await sendAccountInternalEmail("Compte créé", {
                "Admin": caller.name,
                "Admin email": caller.email,
                "Utilisateur": getAccountDisplayName(accountData),
                "Email": email,
                "Rôle": getAccountRoleLabel(role),
                "UID": createdUser.uid
            }, apiKey);
        } catch (error) {
            warning = "Compte créé, mais l’email d’invitation ou la notification interne n’a pas pu être envoyé.";
            console.error("Erreur email création compte SBI :", error.message, error.payload || "");
        }

        await safeWriteAccountAuditLog(db, {
            type: "account.created",
            actorUid: caller.uid,
            actorEmail: caller.email,
            targetUid: createdUser.uid,
            targetEmail: email,
            targetRole: role
        });

        await releaseAccountCreationLock(creationLock, "created", {
            targetUid: createdUser.uid,
            targetRole: role,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        creationLock = null;

        return {
            success: true,
            uid: createdUser.uid,
            email,
            warning,
            message: warning || "Compte créé. Email d’invitation envoyé."
        };
    } finally {
        if (creationLock) {
            await releaseAccountCreationLock(creationLock, "released");
        }
    }
});
exports.adminSendPasswordReset = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 20,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const data = request.data || {};
    const targetUid = cleanString(data.uid, 160);

    if (!targetUid) throw new HttpsError("invalid-argument", "UID utilisateur manquant.");

    const targetDoc = await db.collection("users").doc(targetUid).get();
    if (!targetDoc.exists) throw new HttpsError("not-found", "Compte utilisateur introuvable dans Firestore.");

    const targetData = targetDoc.data() || {};
    if (targetData.isGod === true && caller.data.isGod !== true) {
        throw new HttpsError("permission-denied", "Seul le compte Suprême peut envoyer un reset au compte Suprême.");
    }

    const email = cleanEmail(targetData.email);
    if (!isValidEmail(email)) throw new HttpsError("failed-precondition", "Email utilisateur invalide ou manquant.");

    const apiKey = BREVO_API_KEY.value();
    if (!apiKey) throw new HttpsError("failed-precondition", "Configuration Brevo manquante côté serveur.");

    try {
        const firebaseResetLink = await admin.auth().generatePasswordResetLink(email, SBI_AUTH_ACTION_SETTINGS);
        const resetLink = buildSbiPasswordResetLink(firebaseResetLink);
        await sendAccountResetEmail({ ...targetData, email }, resetLink, apiKey);
        await targetDoc.ref.update({
            "accountStatus.passwordResetSentAt": admin.firestore.FieldValue.serverTimestamp(),
            "accountStatus.lastAccessEmailSentAt": admin.firestore.FieldValue.serverTimestamp(),
            "accountStatus.activationState": keepActiveOrPendingPassword(targetData)
        });
        await sendAccountInternalEmail("Reset mot de passe envoyé", {
            "Admin": caller.name,
            "Admin email": caller.email,
            "Utilisateur": getAccountDisplayName(targetData),
            "Email": email,
            "Rôle": getAccountRoleLabel(targetData.role),
            "UID": targetUid
        }, apiKey);
    } catch (error) {
        console.error("Erreur reset password SBI :", error.message, error.payload || "");
        throw new HttpsError("internal", `Impossible d'envoyer l'email de réinitialisation : ${error.message}`);
    }

    await safeWriteAccountAuditLog(db, {
        type: "account.password_reset_sent",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid,
        targetEmail: email,
        targetRole: targetData.role || ""
    });

    return {
        success: true,
        message: `Email de réinitialisation envoyé à ${email}.`
    };
});



exports.adminSendFinalizationInvite = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 20,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const data = request.data || {};
    const targetUid = cleanString(data.uid, 160);

    if (!targetUid) throw new HttpsError("invalid-argument", "UID utilisateur manquant.");

    const targetDoc = await db.collection("users").doc(targetUid).get();
    if (!targetDoc.exists) throw new HttpsError("not-found", "Compte utilisateur introuvable dans Firestore.");

    const targetData = targetDoc.data() || {};
    if (targetData.isGod === true && caller.data.isGod !== true) {
        throw new HttpsError("permission-denied", "Seul le compte Suprême peut relancer le compte Suprême.");
    }

    if (targetData.statut === "suspendu") {
        throw new HttpsError("failed-precondition", "Le compte est suspendu. Réactivez-le avant de renvoyer une invitation.");
    }

    if (hasAccountFinalizedAccess(targetData)) {
        throw new HttpsError("failed-precondition", "Ce compte a déjà finalisé sa première connexion. Utilisez plutôt le reset mot de passe si nécessaire.");
    }

    const email = cleanEmail(targetData.email);
    if (!isValidEmail(email)) throw new HttpsError("failed-precondition", "Email utilisateur invalide ou manquant.");

    const apiKey = BREVO_API_KEY.value();
    if (!apiKey) throw new HttpsError("failed-precondition", "Configuration Brevo manquante côté serveur.");

    try {
        const finalizationLink = await createDurableFinalizationLink(db, {
            uid: targetUid,
            email,
            accountData: targetData,
            userRef: targetDoc.ref,
            source: "admin-manual-finalization"
        });
        await sendAccountFinalizationEmail({ ...targetData, email, uid: targetUid }, finalizationLink, apiKey);

        const accountStatus = targetData.accountStatus || {};
        const finalizationReminderEnabled = accountStatus.finalizationReminderEnabled === false ? false : true;

        await targetDoc.ref.update({
            "accountStatus.finalizationInviteSentAt": admin.firestore.FieldValue.serverTimestamp(),
            "accountStatus.lastAccessEmailSentAt": admin.firestore.FieldValue.serverTimestamp(),
            "accountStatus.activationState": "pending_password",
            "accountStatus.finalizationReminderEnabled": finalizationReminderEnabled,
            "accountStatus.finalizationInviteCount": admin.firestore.FieldValue.increment(1)
        });

        await sendAccountInternalEmail("Invitation finalisation envoyée", {
            "Admin": caller.name,
            "Admin email": caller.email,
            "Utilisateur": getAccountDisplayName(targetData),
            "Email": email,
            "Rôle": getAccountRoleLabel(targetData.role),
            "UID": targetUid
        }, apiKey);
    } catch (error) {
        console.error("Erreur invitation finalisation SBI :", error.message, error.payload || "");
        throw new HttpsError("internal", `Impossible d'envoyer l'invitation de finalisation : ${error.message}`);
    }

    await safeWriteAccountAuditLog(db, {
        type: "account.finalization_invite_sent",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid,
        targetEmail: email,
        targetRole: targetData.role || "",
        source: "admin-manual"
    });

    return {
        success: true,
        message: `Invitation de finalisation envoyée à ${email}.`
    };
});





exports.verifyInitialPasswordToken = onCall({
    region: "europe-west1",
    timeoutSeconds: 15,
    memory: "256MiB"
}, async (request) => {
    const token = cleanString(request.data?.token || "", 500);
    const { tokenData } = await readDurableFinalizationToken(token, { reserve: false });
    const userData = tokenData.userData || {};

    return {
        success: true,
        mode: SBI_FINALIZATION_TOKEN_MODE,
        email: cleanEmail(tokenData.email || userData.email || ""),
        displayName: getAccountDisplayName(userData),
        prenom: cleanString(userData.prenom || "", 80)
    };
});

exports.completeInitialPasswordWithToken = onCall({
    region: "europe-west1",
    timeoutSeconds: 25,
    memory: "256MiB"
}, async (request) => {
    const token = cleanString(request.data?.token || "", 500);
    const password = String(request.data?.password || "");

    if (password.length < SBI_MIN_PASSWORD_LENGTH) {
        throw new HttpsError("invalid-argument", "Le mot de passe doit contenir au moins 8 caractères.");
    }

    const db = admin.firestore();
    const { tokenRef, tokenData } = await readDurableFinalizationToken(token, { reserve: true });
    const uid = cleanString(tokenData.uid || "", 180);
    const email = cleanEmail(tokenData.email || "");
    const userData = tokenData.userData || {};
    const userRef = db.collection("users").doc(uid);
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
        await admin.auth().updateUser(uid, {
            password,
            emailVerified: true,
            disabled: false
        });

        await Promise.all([
            tokenRef.set({
                status: "used",
                usedAt: now,
                updatedAt: now
            }, { merge: true }),
            userRef.set({
                accountStatus: {
                    ...(userData.accountStatus || {}),
                    activationState: "active",
                    finalizationPasswordSetAt: now,
                    passwordCreatedAt: now,
                    finalizationTokenUsedAt: now,
                    finalizationReminderEnabled: false,
                    finalizationIssueCode: "",
                    finalizationIssueMessage: "",
                    finalizationIssueSource: "",
                    finalizationIssueEvent: "",
                    finalizationIssueResolvedAt: now
                },
                emailVerifiedAt: now,
                updatedAt: now
            }, { merge: true })
        ]);

        await revokeSiblingFinalizationTokens(db, uid, tokenRef).catch((error) => {
            console.error("[SBI Durable Finalization] Révocation tokens frères impossible :", error.message || error);
        });

        await safeWriteAccountAuditLog(db, {
            type: "account.initial_password_created",
            actorUid: uid,
            actorEmail: email,
            targetUid: uid,
            targetEmail: email,
            targetRole: userData.role || "",
            source: "durable-finalization-token"
        });

        return {
            success: true,
            email,
            message: "Mot de passe créé. Vous pouvez maintenant vous connecter."
        };
    } catch (error) {
        await tokenRef.set({
            status: "active",
            processingAt: null,
            lastErrorAt: admin.firestore.FieldValue.serverTimestamp(),
            lastErrorMessage: cleanString(error.message || error.code || "Erreur création mot de passe", 300),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(() => {});

        if (error instanceof HttpsError) throw error;

        console.error("[SBI Durable Finalization] Création mot de passe impossible :", error.message || error);
        throw new HttpsError("internal", "Impossible de créer le mot de passe pour le moment.");
    }
});

exports.adminResolveFinalizationEscalation = onCall({
    region: "europe-west1",
    timeoutSeconds: 20,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const data = request.data || {};
    const targetUid = cleanString(data.uid, 160);
    const resolutionNote = cleanMultiline(data.note || "", 600);

    if (!targetUid) throw new HttpsError("invalid-argument", "UID utilisateur manquant.");

    const targetDoc = await db.collection("users").doc(targetUid).get();
    if (!targetDoc.exists) throw new HttpsError("not-found", "Compte utilisateur introuvable.");

    const targetData = targetDoc.data() || {};
    if (!targetData.accountStatus?.finalizationEscalationAt) {
        throw new HttpsError("failed-precondition", "Aucune alerte de finalisation à traiter pour ce compte.");
    }

    if (targetData.accountStatus?.finalizationEscalationResolvedAt) {
        return {
            success: true,
            message: "Cette alerte était déjà traitée."
        };
    }

    const updatePayload = {
        "accountStatus.finalizationEscalationResolvedAt": admin.firestore.FieldValue.serverTimestamp(),
        "accountStatus.finalizationEscalationResolvedBy": caller.uid,
        "accountStatus.finalizationEscalationResolvedByEmail": caller.email || "",
        "accountStatus.finalizationEscalationResolutionNote": resolutionNote,
        "accountStatus.preparationState": "to_check"
    };

    await targetDoc.ref.update(updatePayload);

    await safeWriteAccountAuditLog(db, {
        type: "account.finalization_escalation_resolved",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid,
        targetEmail: targetData.email || "",
        targetRole: targetData.role || "",
        source: "admin-profile",
        note: resolutionNote
    });

    return {
        success: true,
        message: "Alerte marquée comme traitée."
    };
});


exports.runFinalizationReminders = onSchedule({
    region: "europe-west1",
    schedule: "every 24 hours",
    timeZone: "Europe/Paris",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 540,
    memory: "512MiB"
}, async () => {
    const db = admin.firestore();
    const apiKey = BREVO_API_KEY.value();

    if (!apiKey) {
        console.error("[SBI Finalization] BREVO_API_KEY manquant.");
        return;
    }

    const nowMs = Date.now();
    const usersSnap = await db.collection("users")
        .where("statut", "==", "actif")
        .limit(500)
        .get();

    let checked = 0;
    let sent = 0;
    let skipped = 0;
    let escalated = 0;
    let failed = 0;

    for (const userDoc of usersSnap.docs) {
        checked += 1;
        const userData = userDoc.data() || {};
        const uid = userDoc.id;

        if (!shouldSendFinalizationReminder(userData, nowMs)) {
            skipped += 1;
            continue;
        }

        const email = cleanEmail(userData.email);
        if (!isValidEmail(email)) {
            skipped += 1;
            await userDoc.ref.set({
                accountStatus: {
                    finalizationIssueCode: "invalid_email",
                    finalizationIssueAt: admin.firestore.FieldValue.serverTimestamp(),
                    finalizationIssueMessage: "Email utilisateur invalide ou manquant.",
                    finalizationIssueSource: "scheduler",
                    finalizationIssueEvent: "invalid_email",
                    finalizationReminderEnabled: false,
                    preparationState: "to_check"
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            await safeWriteAccountAuditLog(db, {
                type: "account.finalization_reminder_skipped",
                actorUid: "system",
                actorEmail: "scheduler",
                targetUid: uid,
                targetEmail: email,
                targetRole: userData.role || "",
                source: "auto-finalization-reminder",
                reason: "invalid-email"
            });
            continue;
        }

        const accountStatus = userData.accountStatus || {};
        const previousReminderCount = Number(accountStatus.reminderCount || 0);
        const nextReminderCount = previousReminderCount + 1;
        const isFinalReminder = nextReminderCount >= SBI_FINALIZATION_REMINDER_MAX_COUNT;

        try {
            const finalizationLink = await createDurableFinalizationLink(db, {
                uid,
                email,
                accountData: userData,
                userRef: userDoc.ref,
                source: "auto-finalization-reminder"
            });

            await sendAccountFinalizationEmail({ ...userData, email, uid }, finalizationLink, apiKey);

            const updatePayload = {
                "accountStatus.activationState": "pending_password",
                "accountStatus.finalizationReminderEnabled": accountStatus.finalizationReminderEnabled === false ? false : true,
                "accountStatus.lastReminderSentAt": admin.firestore.FieldValue.serverTimestamp(),
                "accountStatus.lastAccessEmailSentAt": admin.firestore.FieldValue.serverTimestamp(),
                "accountStatus.reminderCount": admin.firestore.FieldValue.increment(1)
            };

            if (isFinalReminder) {
                updatePayload["accountStatus.finalizationEscalationAt"] = admin.firestore.FieldValue.serverTimestamp();
                updatePayload["accountStatus.finalizationEscalationResolvedAt"] = null;
                updatePayload["accountStatus.finalizationEscalationResolvedBy"] = "";
                updatePayload["accountStatus.finalizationReminderEnabled"] = false;
            }

            await userDoc.ref.update(updatePayload);

            await safeWriteAccountAuditLog(db, {
                type: isFinalReminder ? "account.finalization_escalation_required" : "account.finalization_reminder_sent",
                actorUid: "system",
                actorEmail: "scheduler",
                targetUid: uid,
                targetEmail: email,
                targetRole: userData.role || "",
                source: "auto-finalization-reminder",
                reminderCount: nextReminderCount,
                maxReminderCount: SBI_FINALIZATION_REMINDER_MAX_COUNT
            });

            if (isFinalReminder) {
                escalated += 1;
            } else {
                sent += 1;
            }
        } catch (error) {
            failed += 1;
            console.error("[SBI Finalization] Relance impossible :", uid, email, error.message);
            await safeWriteAccountAuditLog(db, {
                type: "account.finalization_reminder_failed",
                actorUid: "system",
                actorEmail: "scheduler",
                targetUid: uid,
                targetEmail: email,
                targetRole: userData.role || "",
                source: "auto-finalization-reminder",
                errorMessage: cleanString(error.message, 300)
            });
        }
    }

    console.log("[SBI Finalization] Rapport relances", {
        checked,
        sent,
        skipped,
        escalated,
        failed
    });
});


exports.brevoTransactionalWebhook = onRequest({
    region: "europe-west1",
    secrets: [BREVO_WEBHOOK_TOKEN],
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");

    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }

    if (req.method !== "POST") {
        res.status(405).json({ success: false, message: "Méthode non autorisée." });
        return;
    }

    const expectedToken = cleanString(BREVO_WEBHOOK_TOKEN.value(), 240);
    const providedToken = cleanString(
        req.query?.token
        || req.get("x-sbi-brevo-token")
        || req.get("x-webhook-token")
        || "",
        240
    );

    if (!expectedToken || providedToken !== expectedToken) {
        res.status(403).json({ success: false, message: "Webhook non autorisé." });
        return;
    }

    const db = admin.firestore();
    const events = extractBrevoWebhookEvents(req.body);
    let received = events.length;
    let handled = 0;
    let matchedUsers = 0;

    for (const event of events) {
        const rawEventType = extractBrevoEventType(event);
        if (!isBrevoBounceEvent(rawEventType)) continue;

        const email = extractBrevoEventEmail(event);
        if (!isValidEmail(email)) continue;

        handled += 1;
        const normalizedEvent = normalizeBrevoEventName(rawEventType);
        const bounceMessage = extractBrevoBounceMessage(event);
        const usersSnap = await db.collection("users")
            .where("email", "==", email)
            .limit(10)
            .get();

        if (usersSnap.empty) {
            await safeWriteAccountAuditLog(db, {
                type: "account.email_bounce_unmatched",
                actorUid: "brevo",
                actorEmail: "webhook",
                targetUid: "",
                targetEmail: email,
                targetRole: "",
                source: "brevo-webhook",
                event: normalizedEvent,
                reason: bounceMessage
            });
            continue;
        }

        for (const userDoc of usersSnap.docs) {
            matchedUsers += 1;
            const userData = userDoc.data() || {};

            await userDoc.ref.update({
                "accountStatus.finalizationIssueCode": "email_bounced",
                "accountStatus.finalizationIssueAt": admin.firestore.FieldValue.serverTimestamp(),
                "accountStatus.finalizationIssueMessage": bounceMessage || "Email rejeté par Brevo.",
                "accountStatus.finalizationIssueSource": "brevo",
                "accountStatus.finalizationIssueEvent": normalizedEvent,
                "accountStatus.finalizationReminderEnabled": false,
                "accountStatus.preparationState": "to_check",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await safeWriteAccountAuditLog(db, {
                type: "account.email_bounced",
                actorUid: "brevo",
                actorEmail: "webhook",
                targetUid: userDoc.id,
                targetEmail: email,
                targetRole: userData.role || "",
                source: "brevo-webhook",
                event: normalizedEvent,
                reason: bounceMessage
            });
        }
    }

    res.status(200).json({
        success: true,
        received,
        handled,
        matchedUsers
    });
});


exports.requestPasswordReset = onRequest({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 20,
    memory: "256MiB"
}, async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");

    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }

    if (req.method !== "POST") {
        res.status(405).json({ success: false, message: "Méthode non autorisée." });
        return;
    }

    const genericMessage = "Si un compte existe avec cette adresse, un lien de réinitialisation vient d’être envoyé.";
    const db = admin.firestore();
    const email = cleanEmail(req.body?.email);
    const page = cleanString(req.body?.page || "login.html", 180);

    if (!isValidEmail(email)) {
        res.status(400).json({ success: false, message: "Adresse email invalide." });
        return;
    }

    let targetUid = "";
    let targetRole = "";
    let emailSent = false;
    let emailError = "";

    try {
        const authUser = await admin.auth().getUserByEmail(email);
        targetUid = authUser.uid;

        let targetData = {
            email,
            prenom: cleanString(authUser.displayName || "", 80),
            nom: "",
            role: "student",
            statut: authUser.disabled ? "suspendu" : "actif"
        };

        const targetDoc = await db.collection("users").doc(authUser.uid).get();
        if (targetDoc.exists) {
            targetData = {
                ...targetData,
                ...(targetDoc.data() || {}),
                email
            };
        }

        targetRole = targetData.role || "";

        if (targetData.statut !== "suspendu" && authUser.disabled !== true) {
            const apiKey = BREVO_API_KEY.value();
            if (!apiKey) throw new Error("BREVO_API_KEY manquant.");

            const firebaseResetLink = await admin.auth().generatePasswordResetLink(email, SBI_AUTH_ACTION_SETTINGS);
            const resetLink = buildSbiPasswordResetLink(firebaseResetLink);
            await sendAccountResetEmail({ ...targetData, email }, resetLink, apiKey);
            if (targetDoc.exists) {
                await targetDoc.ref.update({
                    "accountStatus.passwordResetSentAt": admin.firestore.FieldValue.serverTimestamp(),
                    "accountStatus.lastAccessEmailSentAt": admin.firestore.FieldValue.serverTimestamp(),
                    "accountStatus.activationState": keepActiveOrPendingPassword(targetData)
                });
            }
            emailSent = true;
        }
    } catch (error) {
        if (error?.code === "auth/user-not-found") {
            // Réponse volontairement identique : ne jamais révéler si un compte existe.
        } else {
            emailError = cleanString(error?.message || error?.code || "Erreur reset public", 300);
            console.error("Erreur requestPasswordReset SBI :", emailError, error?.payload || "");
        }
    }

    await safeWriteAccountAuditLog(db, {
        type: "account.public_password_reset_requested",
        actorUid: "public",
        actorEmail: email,
        targetUid,
        targetEmail: email,
        targetRole,
        source: "public-login",
        page,
        emailSent,
        emailError
    });

    res.status(200).json({
        success: true,
        message: genericMessage
    });
});


exports.trackAccountLogin = onCall({
    region: "europe-west1",
    timeoutSeconds: 15,
    memory: "256MiB"
}, async (request) => {
    const uid = request.auth?.uid || "";
    if (!uid) {
        throw new HttpsError("unauthenticated", "Connexion requise.");
    }

    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        throw new HttpsError("not-found", "Compte utilisateur introuvable.");
    }

    const userData = userDoc.data() || {};
    if (userData.statut === "suspendu") {
        throw new HttpsError("permission-denied", "Compte suspendu.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const hasFirstLogin = Boolean(userData.accountStatus?.firstLoginAt || userData.firstLoginAt);
    const preparationState = userData.accountStatus?.preparationState || userData.preparationState || "not_prepared";

    const payload = {
        "accountStatus.activationState": "active",
        "accountStatus.preparationState": preparationState,
        "accountStatus.lastLoginAt": now,
        lastLoginAt: now,
        updatedAt: now
    };

    if (!hasFirstLogin) {
        payload["accountStatus.firstLoginAt"] = now;
        payload.firstLoginAt = now;
    }

    await userRef.set(payload, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: "account.login_tracked",
        actorUid: uid,
        actorEmail: request.auth.token?.email || userData.email || "",
        targetUid: uid,
        targetEmail: userData.email || request.auth.token?.email || "",
        targetRole: userData.role || ""
    });

    return {
        success: true,
        firstLoginCreated: !hasFirstLogin
    };
});


exports.completeFirstLoginOnboarding = onCall({
    region: "europe-west1",
    timeoutSeconds: 20,
    memory: "256MiB"
}, async (request) => {
    const uid = request.auth?.uid || "";
    if (!uid) {
        throw new HttpsError("unauthenticated", "Connexion requise.");
    }

    const data = request.data || {};
    const checklistVersion = cleanString(data.checklistVersion, 80) || "2026-05-SBI-FIRST-LOGIN-V1";

    const requiredFlags = [
        "termsAccepted",
        "rulesAccepted",
        "importantInfoAccepted",
        "emailConfirmed"
    ];

    const missingFlag = requiredFlags.find((key) => data[key] !== true);
    if (missingFlag) {
        throw new HttpsError("invalid-argument", "Toutes les validations sont obligatoires.");
    }

    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        throw new HttpsError("not-found", "Compte utilisateur introuvable.");
    }

    const userData = userDoc.data() || {};
    if (userData.statut === "suspendu") {
        throw new HttpsError("permission-denied", "Compte suspendu.");
    }

    const role = normalizeAccountRole(userData.role || "student");
    if (userData.isGod === true || role === "admin") {
        return {
            success: true,
            skipped: true,
            reason: "admin-account"
        };
    }

    if (!["student", "teacher"].includes(role)) {
        throw new HttpsError("permission-denied", "Rôle non éligible à cette validation.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const hasFirstLogin = Boolean(userData.accountStatus?.firstLoginAt || userData.firstLoginAt);
    const previousAccountStatus = userData.accountStatus || {};

    const onboardingUpdate = {
        accountStatus: {
            ...previousAccountStatus,
            activationState: "active",
            lastLoginAt: now,
            firstLoginCompleted: true,
            firstLoginCompletedAt: now,
            firstLoginChecklistVersion: checklistVersion,
            termsAccepted: true,
            termsAcceptedAt: now,
            rulesAccepted: true,
            rulesAcceptedAt: now,
            importantInfoAccepted: true,
            importantInfoAcceptedAt: now,
            emailConfirmed: true,
            emailConfirmedAt: now
        },
        firstLoginCompleted: true,
        firstLoginCompletedAt: now,
        lastLoginAt: now,
        updatedAt: now
    };

    if (!hasFirstLogin) {
        onboardingUpdate.accountStatus.firstLoginAt = now;
        onboardingUpdate.firstLoginAt = now;
    }

    await userRef.set(onboardingUpdate, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: "account.first_login_onboarding_completed",
        actorUid: uid,
        actorEmail: request.auth.token?.email || userData.email || "",
        targetUid: uid,
        targetEmail: userData.email || request.auth.token?.email || "",
        targetRole: role,
        checklistVersion,
        source: "first-login-gate",
        activationState: "active",
        firstLoginCreated: !hasFirstLogin
    });

    return {
        success: true,
        completed: true
    };
});


/* =======================================================================
 * SBI 8.0P.137 - SELF EMAIL CHANGE WORKFLOW
 * -----------------------------------------------------------------------
 * Changement d'email depuis l'espace personnel professeur / étudiant.
 * Le client effectue une réauthentification, puis cette Function applique
 * la modification Auth + Firestore, envoie les emails SBI et écrit l'audit.
 * ======================================================================= */

async function sendSelfEmailChangeSbiEmail(apiKey, { toEmail, toName, subject, prenom, messageHtml, preheader }) {
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) return null;

    const htmlContent = renderSbiEmailTemplate({
        prenom: prenom || '',
        messageHtml,
        nomExpediteur: 'L’équipe SBI',
        posteExpediteur: 'Support comptes',
        preheader: preheader || subject
    });

    return callBrevo('/smtp/email', {
        sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
        to: [{ email: toEmail, name: toName || toEmail }],
        subject,
        htmlContent,
        replyTo: { email: SBI_CONTACT_EMAIL, name: 'SBI' }
    }, apiKey);
}

function buildSelfEmailChangeTable(oldEmail, newEmail) {
    return `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #dce4f2;border-radius:12px;overflow:hidden;">
            <tr>
                <td style="padding:12px 14px;border-bottom:1px solid #dce4f2;color:#0051ff;font-weight:bold;width:38%;">Ancienne adresse</td>
                <td style="padding:12px 14px;border-bottom:1px solid #dce4f2;color:#101828;">${escapeHtml(oldEmail)}</td>
            </tr>
            <tr>
                <td style="padding:12px 14px;color:#0051ff;font-weight:bold;width:38%;">Nouvelle adresse</td>
                <td style="padding:12px 14px;color:#101828;">${escapeHtml(newEmail)}</td>
            </tr>
        </table>`;
}

async function notifySelfEmailChange({ apiKey, actorUid, oldEmail, newEmail, userProfile }) {
    const prenom = userProfile?.prenom || '';
    const nom = userProfile?.nom || '';
    const fullName = `${prenom} ${nom}`.trim() || newEmail;
    const tableHtml = buildSelfEmailChangeTable(oldEmail, newEmail);

    const oldAddressHtml = `
        <p style="margin:0 0 16px 0;">L’adresse email de votre compte SBI vient d’être modifiée depuis votre espace personnel.</p>
        ${tableHtml}
        <p style="margin:18px 0 0 0;">Si vous êtes bien à l’origine de cette action, aucune démarche supplémentaire n’est nécessaire.</p>
        <p style="margin:12px 0 0 0;color:#667085;font-size:14px;line-height:22px;">Si vous n’avez pas demandé ce changement, contactez immédiatement SBI.</p>`;

    const newAddressHtml = `
        <p style="margin:0 0 16px 0;">Cette adresse email est désormais associée à votre compte SBI.</p>
        ${tableHtml}
        <p style="margin:18px 0 0 0;">Vous pourrez l’utiliser pour vos prochaines connexions à la plateforme.</p>`;

    const internalHtml = `
        <p style="margin:0 0 16px 0;">Un utilisateur vient de modifier son adresse email depuis son espace personnel.</p>
        ${tableHtml}
        <p style="margin:18px 0 0 0;color:#667085;font-size:14px;line-height:22px;">UID : ${escapeHtml(actorUid)}</p>`;

    const tasks = [
        sendSelfEmailChangeSbiEmail(apiKey, {
            toEmail: oldEmail,
            toName: fullName,
            subject: 'Votre adresse email SBI a été modifiée',
            prenom,
            messageHtml: oldAddressHtml,
            preheader: 'Modification de l’adresse email de votre compte SBI.'
        }),
        sendSelfEmailChangeSbiEmail(apiKey, {
            toEmail: newEmail,
            toName: fullName,
            subject: 'Nouvelle adresse email confirmée pour votre compte SBI',
            prenom,
            messageHtml: newAddressHtml,
            preheader: 'Votre nouvelle adresse email SBI est active.'
        }),
        sendSelfEmailChangeSbiEmail(apiKey, {
            toEmail: SBI_CONTACT_EMAIL,
            toName: 'SBI',
            subject: 'Compte SBI - email modifié par utilisateur',
            prenom: 'équipe',
            messageHtml: internalHtml,
            preheader: 'Un utilisateur a modifié son email depuis son profil.'
        })
    ];

    const results = await Promise.allSettled(tasks);
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length) {
        console.error('Emails selfChangeUserEmail partiellement échoués :', failed.map(item => item.reason?.message || item.reason));
    }
    return { sent: results.length - failed.length, failed: failed.length };
}

exports.selfChangeUserEmail = onCall({
    region: 'europe-west1',
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: '256MiB'
}, async (request) => {
    if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Connexion requise.');
    }

    const uid = request.auth.uid;
    const authTime = Number(request.auth.token?.auth_time || 0) * 1000;
    if (!authTime || Date.now() - authTime > 5 * 60 * 1000) {
        throw new HttpsError('failed-precondition', 'Veuillez confirmer votre mot de passe avant de modifier votre email.');
    }

    const newEmail = cleanString(request.data?.email, 180).toLowerCase();
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        throw new HttpsError('invalid-argument', "L'adresse email n'est pas valide.");
    }

    const userRef = admin.firestore().collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        throw new HttpsError('not-found', 'Profil utilisateur introuvable.');
    }

    const userProfile = userSnap.data() || {};
    const authUser = await admin.auth().getUser(uid);
    const oldEmail = cleanString(authUser.email || userProfile.email, 180).toLowerCase();

    if (!oldEmail) {
        throw new HttpsError('failed-precondition', 'Ancienne adresse email introuvable.');
    }

    if (oldEmail === newEmail) {
        throw new HttpsError('invalid-argument', "La nouvelle adresse doit être différente de l'adresse actuelle.");
    }

    try {
        const existingAuthUser = await admin.auth().getUserByEmail(newEmail);
        if (existingAuthUser.uid !== uid) {
            throw new HttpsError('already-exists', 'Cette adresse email est déjà utilisée par un autre compte.');
        }
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        if (error?.code !== 'auth/user-not-found') {
            throw new HttpsError('internal', 'Vérification email impossible.');
        }
    }

    const existingFirestore = await admin.firestore()
        .collection('users')
        .where('email', '==', newEmail)
        .limit(1)
        .get();

    if (!existingFirestore.empty) {
        const existingDoc = existingFirestore.docs[0];
        if (existingDoc.id !== uid) {
            throw new HttpsError('already-exists', 'Cette adresse email est déjà utilisée par un autre profil.');
        }
    }

    await admin.auth().updateUser(uid, {
        email: newEmail,
        emailVerified: false
    });

    try {
        await userRef.update({
            email: newEmail,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            emailUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Rollback email Auth après erreur Firestore selfChangeUserEmail :', error);
        try {
            await admin.auth().updateUser(uid, { email: oldEmail });
        } catch (rollbackError) {
            console.error('Rollback email Auth impossible :', rollbackError);
        }
        throw new HttpsError('internal', 'Modification Firestore impossible.');
    }

    let emailReport = { sent: 0, failed: 0 };
    try {
        emailReport = await notifySelfEmailChange({
            apiKey: BREVO_API_KEY.value(),
            actorUid: uid,
            oldEmail,
            newEmail,
            userProfile
        });
    } catch (error) {
        console.error('Notification selfChangeUserEmail impossible :', error);
        emailReport = { sent: 0, failed: 3 };
    }

    await admin.firestore().collection('accountAuditLogs').add({
        type: 'account.self_email_changed',
        actorUid: uid,
        actorEmail: newEmail,
        targetUid: uid,
        targetEmail: newEmail,
        previousEmail: oldEmail,
        newEmail,
        targetRole: userProfile.role || '',
        source: 'self-profile',
        emailReport,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        ok: true,
        email: newEmail,
        warning: emailReport.failed ? 'Email modifié, mais certaines notifications n’ont pas pu être envoyées.' : ''
    };
});

exports.adminChangeUserEmail = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const data = request.data || {};
    const targetUid = cleanString(data.uid, 160);
    const newEmail = cleanEmail(data.email);

    if (!targetUid) throw new HttpsError("invalid-argument", "UID utilisateur manquant.");
    if (!isValidEmail(newEmail)) throw new HttpsError("invalid-argument", "La nouvelle adresse email n'est pas valide.");

    const targetRef = db.collection("users").doc(targetUid);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) throw new HttpsError("not-found", "Compte utilisateur introuvable.");

    const targetData = targetDoc.data() || {};
    const callerIsGod = caller.data.isGod === true;
    const targetIsGod = targetData.isGod === true;
    const targetRole = normalizeAccountRole(targetData.role);
    const isSelfEdit = targetUid === caller.uid;
    const oldEmail = cleanEmail(targetData.email);
    const oldEmailIsValid = isValidEmail(oldEmail);
    const oldEmailLabel = oldEmail || cleanString(targetData.email || "", 180) || "Adresse précédente invalide";

    if (oldEmailIsValid && newEmail === oldEmail) {
        return { success: true, message: "Adresse email inchangée." };
    }

    if (isSelfEdit) {
        throw new HttpsError("permission-denied", "Pour votre propre compte, utilisez une procédure dédiée de changement d'adresse email.");
    }

    if (targetIsGod && !callerIsGod) {
        throw new HttpsError("permission-denied", "Seul le compte Suprême peut modifier l'adresse email du compte Suprême.");
    }

    if (targetRole === "admin" && !callerIsGod) {
        throw new HttpsError("permission-denied", "Seul le compte Suprême peut modifier l'adresse email d'un administrateur.");
    }

    const existingUserByEmail = await db.collection("users").where("email", "==", newEmail).limit(2).get();
    const conflictingUserDoc = existingUserByEmail.docs.find(docSnap => docSnap.id !== targetUid);
    if (conflictingUserDoc) {
        throw new HttpsError("already-exists", "Un document utilisateur existe déjà avec cette adresse email.");
    }

    try {
        const existingAuthUser = await admin.auth().getUserByEmail(newEmail);
        if (existingAuthUser.uid !== targetUid) {
            throw new HttpsError("already-exists", "Un compte Firebase Auth existe déjà avec cette adresse email.");
        }
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        if (error?.code !== "auth/user-not-found") {
            console.error("Erreur vérification email Auth SBI :", error.message);
            throw new HttpsError("internal", `Vérification email Auth impossible : ${error.message}`);
        }
    }

    try {
        await admin.auth().updateUser(targetUid, {
            email: newEmail,
            emailVerified: false
        });
    } catch (error) {
        console.error("Erreur changement email Auth SBI :", error.message);
        if (error?.code === "auth/email-already-exists") {
            throw new HttpsError("already-exists", "Cette adresse email est déjà utilisée par un autre compte Firebase Auth.");
        }
        if (error?.code === "auth/user-not-found") {
            throw new HttpsError("failed-precondition", "Compte Firebase Auth introuvable : synchronisation impossible.");
        }
        throw new HttpsError("internal", `Modification email Auth impossible : ${error.message}`);
    }

    const emailUpdatePayload = {
        email: newEmail,
        emailUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        emailUpdatedBy: caller.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: caller.uid
    };

    if (!hasAccountFinalizedAccess(targetData) && hasBlockingFinalizationEmailIssue(targetData)) {
        emailUpdatePayload["accountStatus.finalizationIssueCode"] = "";
        emailUpdatePayload["accountStatus.finalizationIssueAt"] = null;
        emailUpdatePayload["accountStatus.finalizationIssueMessage"] = "";
        emailUpdatePayload["accountStatus.finalizationIssueSource"] = "";
        emailUpdatePayload["accountStatus.finalizationIssueEvent"] = "";
        emailUpdatePayload["accountStatus.finalizationIssueResolvedAt"] = admin.firestore.FieldValue.serverTimestamp();
        emailUpdatePayload["accountStatus.finalizationReminderEnabled"] = true;
        emailUpdatePayload["accountStatus.preparationState"] = "to_check";
    }

    try {
        await targetRef.set(emailUpdatePayload, { merge: true });
    } catch (error) {
        console.error("Erreur changement email Firestore SBI, tentative rollback Auth :", error.message);
        try {
            await admin.auth().updateUser(targetUid, {
                email: oldEmail,
                emailVerified: false
            });
        } catch (rollbackError) {
            console.error("Rollback email Auth impossible :", rollbackError.message);
        }
        throw new HttpsError("internal", `Modification email Firestore impossible : ${error.message}`);
    }

    const nextProfile = {
        ...targetData,
        email: newEmail
    };

    const apiKey = BREVO_API_KEY.value();
    let warning = "";

    try {
        if (!apiKey) throw new Error("BREVO_API_KEY manquant.");
        if (oldEmailIsValid) {
            await sendAccountEmailChangedOldAddressEmail(nextProfile, oldEmail, newEmail, apiKey);
        }
        await sendAccountEmailChangedNewAddressEmail(nextProfile, oldEmailLabel, newEmail, apiKey);
        await sendAccountInternalEmail("Email compte modifié", {
            "Admin": caller.name,
            "Admin email": caller.email,
            "Utilisateur": getAccountDisplayName(nextProfile),
            "Ancien email": oldEmailLabel,
            "Nouvel email": newEmail,
            "Rôle": getAccountRoleLabel(nextProfile.role),
            "UID": targetUid
        }, apiKey);
    } catch (error) {
        warning = "Adresse email modifiée, mais un ou plusieurs emails de notification n’ont pas pu être envoyés.";
        console.error("Erreur email changement adresse SBI :", error.message, error.payload || "");
    }

    await safeWriteAccountAuditLog(db, {
        type: "account.email_changed",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid,
        targetEmail: newEmail,
        targetRole: nextProfile.role || "",
        changes: {
            email: {
                before: oldEmailLabel,
                after: newEmail
            }
        }
    });

    return {
        success: true,
        warning,
        message: warning || "Adresse email modifiée."
    };
});

exports.adminUpdateUserAccount = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const data = request.data || {};
    const targetUid = cleanString(data.uid, 160);

    if (!targetUid) throw new HttpsError("invalid-argument", "UID utilisateur manquant.");

    const targetRef = db.collection("users").doc(targetUid);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) throw new HttpsError("not-found", "Compte utilisateur introuvable.");

    const targetData = targetDoc.data() || {};
    const callerIsGod = caller.data.isGod === true;
    const targetIsGod = targetData.isGod === true;
    const targetRole = normalizeAccountRole(targetData.role);
    const isSelfEdit = targetUid === caller.uid;

    if (targetIsGod && !callerIsGod) {
        throw new HttpsError("permission-denied", "Accès refusé : seul le compte Suprême peut modifier le compte Suprême.");
    }

    const updates = {};
    const authUpdates = {};
    const changeLabels = [];
    const auditChanges = {};
    let previousGodUidToDemote = "";

    if (Object.prototype.hasOwnProperty.call(data, "prenom")) {
        const prenom = formatAccountPrenom(data.prenom);
        if (!prenom) throw new HttpsError("invalid-argument", "Le prénom est obligatoire.");
        if (prenom !== (targetData.prenom || "")) {
            updates.prenom = prenom;
            auditChanges.prenom = { before: targetData.prenom || "", after: prenom };
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, "nom")) {
        const nom = formatAccountNom(data.nom);
        if (!nom) throw new HttpsError("invalid-argument", "Le nom est obligatoire.");
        if (nom !== (targetData.nom || "")) {
            updates.nom = nom;
            auditChanges.nom = { before: targetData.nom || "", after: nom };
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, "role")) {
        const requestedRoleRaw = cleanString(data.role, 40).toLowerCase();
        if (!ACCOUNT_ROLES.includes(requestedRoleRaw)) {
            throw new HttpsError("invalid-argument", "Rôle utilisateur invalide.");
        }
        if (targetIsGod) {
            throw new HttpsError("permission-denied", "Le rôle du compte Suprême ne peut pas être modifié.");
        }
        if (!callerIsGod && (targetRole === "admin" || requestedRoleRaw === "admin")) {
            throw new HttpsError("permission-denied", "Seul le compte Suprême peut modifier ou attribuer un rôle administrateur.");
        }
        if (isSelfEdit && requestedRoleRaw !== targetRole) {
            throw new HttpsError("permission-denied", "Vous ne pouvez pas modifier votre propre rôle.");
        }
        if (requestedRoleRaw !== targetRole) {
            updates.role = requestedRoleRaw;
            auditChanges.role = { before: targetRole, after: requestedRoleRaw };
            changeLabels.push(`Votre rôle est désormais : ${getAccountRoleLabel(requestedRoleRaw)}.`);
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, "statut")) {
        const requestedStatus = cleanString(data.statut, 40).toLowerCase();
        if (!["actif", "suspendu"].includes(requestedStatus)) {
            throw new HttpsError("invalid-argument", "Statut utilisateur invalide.");
        }
        if (targetIsGod) {
            throw new HttpsError("permission-denied", "Le compte Suprême ne peut pas être suspendu.");
        }
        if (isSelfEdit && requestedStatus === "suspendu") {
            throw new HttpsError("permission-denied", "Vous ne pouvez pas suspendre votre propre compte.");
        }
        if (!callerIsGod && targetRole === "admin" && requestedStatus !== (targetData.statut || "actif")) {
            throw new HttpsError("permission-denied", "Un administrateur classique ne peut pas suspendre ou réactiver un autre administrateur.");
        }
        if (requestedStatus !== (targetData.statut || "actif")) {
            updates.statut = requestedStatus;
            authUpdates.disabled = requestedStatus === "suspendu";
            auditChanges.statut = { before: targetData.statut || "actif", after: requestedStatus };
            changeLabels.push(requestedStatus === "suspendu"
                ? "Votre compte a été suspendu temporairement."
                : "Votre compte a été réactivé.");
        }
    }

    // SBI 8.0P.167.271 — Temps de connexion total (secondes, auto-tracké par tracker.js) :
    // correction manuelle réservée au compte Suprême (God).
    if (Object.prototype.hasOwnProperty.call(data, "totalConnectionTime")) {
        if (!callerIsGod) {
            throw new HttpsError("permission-denied", "Seul le compte Suprême peut corriger le temps de connexion.");
        }
        const seconds = Number(data.totalConnectionTime);
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 360000000) {
            throw new HttpsError("invalid-argument", "Temps de connexion invalide (0 à 100000 h).");
        }
        const rounded = Math.round(seconds);
        const previous = Number(targetData.totalConnectionTime) || 0;
        if (rounded !== previous) {
            updates.totalConnectionTime = rounded;
            updates.totalConnectionTimeUpdatedBy = caller.uid;
            auditChanges.totalConnectionTime = { before: previous, after: rounded };
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, "preparationState")) {
        const requestedPreparationState = normalizeAccountPreparationState(data.preparationState);
        const currentPreparationState = normalizeAccountPreparationState(
            targetData.accountStatus?.preparationState || targetData.preparationState || "not_prepared"
        );

        if (requestedPreparationState !== currentPreparationState) {
            updates.accountStatus = {
                ...(targetData.accountStatus || {}),
                ...(updates.accountStatus || {}),
                preparationState: requestedPreparationState,
                preparationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                preparationUpdatedBy: caller.uid
            };
            auditChanges.preparationState = {
                before: currentPreparationState,
                after: requestedPreparationState,
                beforeLabel: getAccountPreparationLabel(currentPreparationState),
                afterLabel: getAccountPreparationLabel(requestedPreparationState)
            };
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, "accountNote")) {
        const accountNote = cleanMultiline(data.accountNote, 2000);
        const previousAccountNote = cleanMultiline(targetData.adminNotes?.accountNote || "", 2000);

        if (accountNote !== previousAccountNote) {
            updates.adminNotes = {
                ...(targetData.adminNotes || {}),
                ...(updates.adminNotes || {}),
                accountNote,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: caller.uid,
                updatedByEmail: caller.email,
                updatedByName: caller.name
            };
            auditChanges.accountNote = {
                before: getNoteAuditState(previousAccountNote),
                after: getNoteAuditState(accountNote)
            };
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, "studentFollowup")) {
        if (targetRole !== "student") {
            throw new HttpsError("failed-precondition", "Le suivi étudiant détaillé est disponible uniquement pour les comptes élèves.");
        }

        const rawFollowup = data.studentFollowup || {};
        const allowedStatuses = ["not_started", "watching", "in_progress", "blocked", "ok"];
        const allowedPriorities = ["normal", "medium", "high", "urgent"];
        const requestedStatus = cleanString(rawFollowup.status || "not_started", 40).toLowerCase();
        const requestedPriority = cleanString(rawFollowup.priority || "normal", 40).toLowerCase();
        const nextActionAt = cleanString(rawFollowup.nextActionAt || "", 20);
        const referentName = cleanString(rawFollowup.referentName || "", 120);
        const referentEmail = cleanEmail(rawFollowup.referentEmail || "");
        const note = cleanMultiline(rawFollowup.note || "", 3000);

        if (!allowedStatuses.includes(requestedStatus)) {
            throw new HttpsError("invalid-argument", "Statut de suivi étudiant invalide.");
        }
        if (!allowedPriorities.includes(requestedPriority)) {
            throw new HttpsError("invalid-argument", "Priorité de suivi étudiant invalide.");
        }
        if (nextActionAt && !/^\d{4}-\d{2}-\d{2}$/.test(nextActionAt)) {
            throw new HttpsError("invalid-argument", "Date de prochaine action invalide.");
        }
        if (referentEmail && !isValidEmail(referentEmail)) {
            throw new HttpsError("invalid-argument", "Email référent invalide.");
        }

        const previousFollowup = targetData.studentFollowup || {};
        const normalizedPreviousFollowup = {
            status: cleanString(previousFollowup.status || "not_started", 40).toLowerCase(),
            priority: cleanString(previousFollowup.priority || "normal", 40).toLowerCase(),
            referentName: cleanString(previousFollowup.referentName || "", 120),
            referentEmail: cleanEmail(previousFollowup.referentEmail || ""),
            nextActionAt: cleanString(previousFollowup.nextActionAt || "", 20),
            note: cleanMultiline(previousFollowup.note || "", 3000)
        };
        const normalizedNextFollowup = {
            status: requestedStatus,
            priority: requestedPriority,
            referentName,
            referentEmail,
            nextActionAt,
            note
        };

        if (JSON.stringify(normalizedPreviousFollowup) !== JSON.stringify(normalizedNextFollowup)) {
            updates.studentFollowup = {
                ...(previousFollowup || {}),
                ...normalizedNextFollowup,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: caller.uid,
                updatedByEmail: caller.email,
                updatedByName: caller.name
            };
            auditChanges.studentFollowup = {
                before: {
                    status: normalizedPreviousFollowup.status,
                    priority: normalizedPreviousFollowup.priority,
                    hasNote: Boolean(normalizedPreviousFollowup.note)
                },
                after: {
                    status: normalizedNextFollowup.status,
                    priority: normalizedNextFollowup.priority,
                    hasNote: Boolean(normalizedNextFollowup.note)
                }
            };
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, "promotionId")) {
        const requestedPromotionId = cleanString(data.promotionId, 180);
        const currentPromotionId = cleanString(targetData.promotionId || "", 180);
        const currentPromotionName = cleanString(targetData.promotionName || "", 160);

        if (requestedPromotionId && targetRole !== "student") {
            throw new HttpsError("failed-precondition", "Seuls les comptes élèves peuvent être affectés à une promotion.");
        }

        if (requestedPromotionId) {
            const promotionDoc = await db.collection("promotions").doc(requestedPromotionId).get();
            if (!promotionDoc.exists) {
                throw new HttpsError("not-found", "Promotion introuvable.");
            }

            const promotionData = promotionDoc.data() || {};
            const promotionName = cleanString(promotionData.name || data.promotionName || "", 160);
            const promotionStatus = promotionData.status === "archived" ? "archived" : "active";
            const promotionFormationId = cleanString(promotionData.formationId || "", 180);
            const promotionFormationName = cleanString(promotionData.formationName || promotionData.formationTitle || "", 180);
            const promotionStartDate = cleanString(promotionData.startDate || "", 20);
            const promotionEndDate = cleanString(promotionData.endDate || "", 20);
            const currentPromotionFormationId = cleanString(targetData.promotionFormationId || "", 180);
            const currentPromotionFormationName = cleanString(targetData.promotionFormationName || "", 180);
            const currentPromotionStartDate = cleanString(targetData.promotionStartDate || "", 20);
            const currentPromotionEndDate = cleanString(targetData.promotionEndDate || "", 20);

            if (!promotionName) {
                throw new HttpsError("failed-precondition", "Nom de promotion manquant.");
            }
            if (promotionStatus === "archived") {
                throw new HttpsError("failed-precondition", "Impossible d’affecter un élève à une promotion archivée.");
            }

            if (
                requestedPromotionId !== currentPromotionId ||
                promotionName !== currentPromotionName ||
                promotionStatus !== (targetData.promotionStatus || "") ||
                promotionFormationId !== currentPromotionFormationId ||
                promotionFormationName !== currentPromotionFormationName ||
                promotionStartDate !== currentPromotionStartDate ||
                promotionEndDate !== currentPromotionEndDate
            ) {
                updates.promotionId = requestedPromotionId;
                updates.promotionName = promotionName;
                updates.promotionStatus = promotionStatus;
                updates.promotionFormationId = promotionFormationId;
                updates.promotionFormationName = promotionFormationName;
                updates.promotionStartDate = promotionStartDate;
                updates.promotionEndDate = promotionEndDate;
                updates.promotionAssignedAt = admin.firestore.FieldValue.serverTimestamp();
                updates.promotionAssignedBy = caller.uid;
                updates.promotionAssignedByEmail = caller.email;
                auditChanges.promotion = {
                    before: currentPromotionId ? {
                        id: currentPromotionId,
                        name: currentPromotionName || currentPromotionId,
                        formation: currentPromotionFormationName || currentPromotionFormationId || ""
                    } : null,
                    after: {
                        id: requestedPromotionId,
                        name: promotionName,
                        formation: promotionFormationName || promotionFormationId || ""
                    }
                };
            }
        } else if (currentPromotionId || currentPromotionName) {
            updates.promotionId = admin.firestore.FieldValue.delete();
            updates.promotionName = admin.firestore.FieldValue.delete();
            updates.promotionStatus = admin.firestore.FieldValue.delete();
            updates.promotionFormationId = admin.firestore.FieldValue.delete();
            updates.promotionFormationName = admin.firestore.FieldValue.delete();
            updates.promotionStartDate = admin.firestore.FieldValue.delete();
            updates.promotionEndDate = admin.firestore.FieldValue.delete();
            updates.promotionAssignedAt = admin.firestore.FieldValue.delete();
            updates.promotionAssignedBy = admin.firestore.FieldValue.delete();
            updates.promotionAssignedByEmail = admin.firestore.FieldValue.delete();
            auditChanges.promotion = {
                before: currentPromotionId ? {
                    id: currentPromotionId,
                    name: currentPromotionName || currentPromotionId
                } : null,
                after: null
            };
        }
    }

    if (data.isGod === true) {
        const currentGodSnapshot = await db.collection("users").where("isGod", "==", true).limit(2).get();
        const currentGodDocs = currentGodSnapshot.docs;
        const currentGodDoc = currentGodDocs[0] || null;
        const godExists = !!currentGodDoc;

        if (targetIsGod) {
            // Rien à faire : le compte cible est déjà Suprême.
        } else if (callerIsGod) {
            updates.isGod = true;
            updates.role = "admin";
            updates.statut = "actif";
            authUpdates.disabled = false;
            auditChanges.isGod = { before: false, after: true };
            changeLabels.push("Votre compte possède désormais les droits Suprême SBI.");

            if (currentGodDoc && currentGodDoc.id !== targetUid) {
                previousGodUidToDemote = currentGodDoc.id;
            }
        } else if (!godExists && isSelfEdit && targetRole === "admin") {
            updates.isGod = true;
            updates.role = "admin";
            updates.statut = "actif";
            authUpdates.disabled = false;
            auditChanges.isGod = { before: false, after: true };
            changeLabels.push("Votre compte a réclamé les droits Suprême SBI.");
        } else {
            throw new HttpsError("permission-denied", "Seul le compte Suprême peut transférer les droits Suprême.");
        }
    }

    if (Object.keys(updates).length === 0 && Object.keys(authUpdates).length === 0) {
        return { success: true, message: "Aucune modification à appliquer." };
    }

    const nextProfile = {
        ...targetData,
        ...updates
    };

    const nextDisplayName = getAccountDisplayName(nextProfile);
    if ((updates.prenom !== undefined || updates.nom !== undefined) && nextDisplayName) {
        authUpdates.displayName = nextDisplayName;
    }

    if (Object.keys(authUpdates).length > 0) {
        try {
            await admin.auth().updateUser(targetUid, authUpdates);
        } catch (error) {
            console.error("Erreur update Auth compte SBI :", error.message);
            if (error?.code === "auth/user-not-found") {
                throw new HttpsError("failed-precondition", "Compte Firebase Auth introuvable : synchronisation impossible.");
            }
            throw new HttpsError("internal", `Mise à jour Auth impossible : ${error.message}`);
        }
    }

    const accountUpdateStamp = admin.firestore.FieldValue.serverTimestamp();
    const accountUpdateBatch = db.batch();

    accountUpdateBatch.set(targetRef, {
        ...updates,
        updatedAt: accountUpdateStamp,
        updatedBy: caller.uid
    }, { merge: true });

    if (previousGodUidToDemote) {
        accountUpdateBatch.set(db.collection("users").doc(previousGodUidToDemote), {
            isGod: false,
            updatedAt: accountUpdateStamp,
            updatedBy: caller.uid
        }, { merge: true });
    }

    await accountUpdateBatch.commit();

    const apiKey = BREVO_API_KEY.value();
    let warning = "";
    const sensitiveChange = auditChanges.role || auditChanges.statut || auditChanges.isGod;

    if (sensitiveChange) {
        try {
            if (!apiKey) throw new Error("BREVO_API_KEY manquant.");
            const targetEmail = cleanEmail(nextProfile.email);
            if (isValidEmail(targetEmail) && changeLabels.length > 0) {
                await sendAccountUpdatedEmail({ ...nextProfile, email: targetEmail }, changeLabels, apiKey);
            }
            await sendAccountInternalEmail("Compte modifié", {
                "Admin": caller.name,
                "Admin email": caller.email,
                "Utilisateur": getAccountDisplayName(nextProfile),
                "Email": targetEmail,
                "Ancien rôle": auditChanges.role ? getAccountRoleLabel(auditChanges.role.before) : "",
                "Nouveau rôle": auditChanges.role ? getAccountRoleLabel(auditChanges.role.after) : "",
                "Ancien statut": auditChanges.statut ? auditChanges.statut.before : "",
                "Nouveau statut": auditChanges.statut ? auditChanges.statut.after : "",
                "Droits Suprême": auditChanges.isGod ? "modifiés" : "",
                "UID": targetUid
            }, apiKey);
        } catch (error) {
            warning = "Compte modifié, mais l’email de notification n’a pas pu être envoyé.";
            console.error("Erreur email modification compte SBI :", error.message, error.payload || "");
        }
    }

    const auditChangeKeys = Object.keys(auditChanges);
    const onlyFollowupChanges = auditChangeKeys.length > 0
        && auditChangeKeys.every((key) => ["preparationState", "accountNote", "studentFollowup"].includes(key));

    await safeWriteAccountAuditLog(db, {
        type: auditChanges.isGod
            ? "account.god_updated"
            : auditChanges.promotion
                ? "account.promotion_updated"
                : auditChanges.studentFollowup
                    ? "account.student_followup_updated"
                    : onlyFollowupChanges
                        ? "account.followup_updated"
                        : "account.updated",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid,
        targetEmail: cleanEmail(nextProfile.email),
        targetRole: nextProfile.role || "",
        changes: auditChanges
    });

    return {
        success: true,
        warning,
        message: warning || "Compte modifié."
    };
});

exports.adminSetStudentTimerBypass = onCall({
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    if (caller.data.isGod !== true) {
        throw new HttpsError("permission-denied", "Action reservee au compte Supreme SBI.");
    }

    const data = request.data || {};
    const targetUid = cleanString(data.uid, 160);
    const enabled = data.enabled === true;
    if (!targetUid) throw new HttpsError("invalid-argument", "UID eleve manquant.");

    const targetRef = db.collection("users").doc(targetUid);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) throw new HttpsError("not-found", "Compte eleve introuvable.");

    const targetData = targetDoc.data() || {};
    const targetRole = normalizeAccountRole(targetData.role);
    if (targetRole !== "student") {
        throw new HttpsError("failed-precondition", "Le passe-droit timer est reserve aux comptes eleves.");
    }

    const previous = targetData.courseTimerBypass === true || targetData.trainingTimerBypass === true;
    await targetRef.set({
        courseTimerBypass: enabled,
        trainingTimerBypass: enabled,
        courseTimerBypassUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        courseTimerBypassUpdatedBy: caller.uid,
        courseTimerBypassUpdatedByEmail: caller.email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: caller.uid
    }, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: "student.timer_bypass.updated",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid,
        targetEmail: cleanEmail(targetData.email),
        targetRole: targetData.role || "student",
        changes: {
            courseTimerBypass: {
                before: previous,
                after: enabled
            }
        }
    });

    return {
        success: true,
        enabled,
        message: enabled ? "Passe-droit timer active." : "Passe-droit timer desactive."
    };
});

function normalizePublicUserRole(data = {}) {
    if (data?.isGod === true) return "admin";
    const role = normalizePublicKey(data.role || data.userRole || data.type || "");
    if (["admin", "administrator"].includes(role)) return "admin";
    if (["teacher", "prof", "professeur", "enseignant", "professor"].includes(role)) return "teacher";
    if (["student", "eleve", "eleve", "etudiant", "etudiant", "apprenant"].includes(role)) return "student";
    return "student";
}

function normalizePublicList(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => cleanString(item, 180)).filter(Boolean)));
}

function normalizePublicKey(value = "") {
    return cleanString(value, 180)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function publicKeys(values = []) {
    return normalizePublicList(values).map(normalizePublicKey).filter(Boolean);
}

function publicListsOverlap(left = [], right = []) {
    const rightSet = new Set(publicKeys(right));
    return publicKeys(left).some((item) => rightSet.has(item));
}

function collectFormationProfileKeys(data = {}) {
    return normalizePublicList([
        ...(Array.isArray(data.formationIds) ? data.formationIds : []),
        ...(Array.isArray(data.formationsAcces) ? data.formationsAcces : []),
        data.formationId,
        data.formationName,
        data.formationTitle,
        data.formationTitre,
        data.promotionFormationName,
        data.promotionFormationTitle
    ]);
}

function collectPromotionProfileKeys(data = {}) {
    return normalizePublicList([
        ...(Array.isArray(data.promotionIds) ? data.promotionIds : []),
        ...(Array.isArray(data.assignedPromotionIds) ? data.assignedPromotionIds : []),
        data.promotionId,
        data.currentPromotionId,
        data.assignedPromotionId,
        data.cohortId,
        data.promotionName,
        data.promotionTitle
    ]);
}

function usersShareLearningScope(callerData = {}, targetData = {}) {
    return publicListsOverlap(collectFormationProfileKeys(callerData), collectFormationProfileKeys(targetData))
        || publicListsOverlap(collectPromotionProfileKeys(callerData), collectPromotionProfileKeys(targetData));
}

function canSeePublicUserProfile(caller = {}, targetUid = "", targetData = {}) {
    if (!targetData || targetData.statut === "suspendu") return false;
    if (caller.isAdmin || caller.data?.isGod === true || caller.data?.role === "admin") return true;
    if (caller.uid && caller.uid === targetUid) return true;
    if (normalizePublicUserRole(targetData) === "admin" || targetData.isGod === true) return false;
    return usersShareLearningScope(caller.data || {}, targetData);
}

function sanitizeVisibleUserProfile(uid = "", data = {}, { includeEmail = false } = {}) {
    const role = normalizePublicUserRole(data);
    const profile = {
        id: uid,
        uid,
        prenom: cleanString(data.prenom, 80),
        nom: cleanString(data.nom, 80),
        role,
        userRole: role,
        photoURL: cleanString(data.photoURL, 1000),
        bio: cleanString(data.bio, 800),
        formationIds: normalizePublicList(data.formationIds),
        formationsAcces: normalizePublicList(data.formationsAcces),
        formationName: cleanString(data.formationName || data.promotionFormationName || "", 180),
        promotionId: cleanString(data.promotionId || data.currentPromotionId || data.assignedPromotionId || data.cohortId || "", 180),
        promotionIds: normalizePublicList(data.promotionIds || data.assignedPromotionIds),
        promotionName: cleanString(data.promotionName || data.promotionTitle || "", 180),
        xp: Math.max(0, Number(data.xp) || 0),
        level: Math.floor((Math.max(0, Number(data.xp) || 0)) / 100) + 1,
        publicProfile: true,
        sanitized: true
    };

    if (includeEmail) {
        profile.email = cleanEmail(data.email);
        profile.statut = cleanString(data.statut, 80);
    }

    return profile;
}

exports.searchVisibleUsers = onCall({
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const callerRole = normalizePublicUserRole(caller.data || {});
    const requestedRoles = normalizePublicList(request.data?.roles || [])
        .map((role) => normalizePublicUserRole({ role }));
    const defaultRoles = callerRole === "teacher"
        ? ["student"]
        : callerRole === "student"
            ? ["student", "teacher"]
            : ["student", "teacher"];
    const allowedRoles = new Set(requestedRoles.length ? requestedRoles : defaultRoles);
    const term = normalizePublicKey(request.data?.term || "");
    const maxResults = Math.min(Math.max(Number(request.data?.limit) || 80, 1), 120);

    const snap = await db.collection("users").limit(800).get();
    const users = [];

    snap.forEach((docSnap) => {
        if (users.length >= maxResults) return;
        const data = docSnap.data() || {};
        if (docSnap.id === caller.uid) return;
        if (!canSeePublicUserProfile(caller, docSnap.id, data)) return;
        const role = normalizePublicUserRole(data);
        if (!allowedRoles.has(role)) return;
        if (term) {
            const nameKey = normalizePublicKey(`${data.prenom || ""} ${data.nom || ""}`);
            const emailKey = caller.isAdmin ? normalizePublicKey(data.email || "") : "";
            if (!nameKey.includes(term) && !emailKey.includes(term)) return;
        }
        users.push(sanitizeVisibleUserProfile(docSnap.id, data, { includeEmail: caller.isAdmin || callerRole === "teacher" }));
    });

    users.sort((a, b) => `${a.prenom || ""} ${a.nom || ""}`.localeCompare(`${b.prenom || ""} ${b.nom || ""}`, "fr", { sensitivity: "base" }));

    return { users, count: users.length };
});

exports.getVisibleUserProfile = onCall({
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const uid = cleanString(request.data?.uid, 180);
    if (!uid) throw new HttpsError("invalid-argument", "Profil manquant.");

    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) throw new HttpsError("not-found", "Profil introuvable.");
    const data = snap.data() || {};
    if (!canSeePublicUserProfile(caller, uid, data)) {
        throw new HttpsError("permission-denied", "Profil non accessible.");
    }

    const includeEmail = caller.isAdmin || caller.uid === uid;
    return {
        user: sanitizeVisibleUserProfile(snap.id, data, { includeEmail }),
        publicOnly: !(caller.isAdmin || caller.uid === uid)
    };
});

function collectCourseFormationKeys(courseData = {}) {
    return normalizePublicList([
        ...(Array.isArray(courseData.formations) ? courseData.formations : []),
        ...(Array.isArray(courseData.formationIds) ? courseData.formationIds : []),
        ...(Array.isArray(courseData.targetFormationIds) ? courseData.targetFormationIds : []),
        ...(Array.isArray(courseData.targetFormationTitles) ? courseData.targetFormationTitles : []),
        courseData.formationId,
        courseData.formationName,
        courseData.formationTitle
    ]);
}

function canResolveCourseResource(caller = {}, courseData = {}) {
    if (caller.isAdmin || caller.data?.isGod === true || caller.data?.role === "admin") return true;
    if (cleanString(courseData.auteurId || "", 180) === caller.uid) return true;

    const directStudents = normalizePublicList(courseData.targetStudents || []);
    if (directStudents.includes(caller.uid)) return true;

    const courseFormationKeys = collectCourseFormationKeys(courseData);
    if (courseFormationKeys.length && publicListsOverlap(collectFormationProfileKeys(caller.data || {}), courseFormationKeys)) return true;

    return false;
}

function collectCourseResourceChapters(courseData = {}) {
    return [
        ...(Array.isArray(courseData.learningBlocks) ? courseData.learningBlocks : []),
        ...(Array.isArray(courseData.chapitres) ? courseData.chapitres : [])
    ].filter((item) => item && typeof item === "object");
}

function findCourseResourceChapter(courseData = {}, { chapterId = "", fileName = "" } = {}) {
    const targetId = cleanString(chapterId, 180);
    const targetFile = normalizePublicKey(fileName || "");
    const chapters = collectCourseResourceChapters(courseData);

    if (targetId) {
        const byId = chapters.find((chapter) => cleanString(chapter.id || chapter.itemId || "", 180) === targetId);
        if (byId) return byId;
    }

    if (targetFile) {
        return chapters.find((chapter) => normalizePublicKey(chapter.resourceFileName || "") === targetFile) || null;
    }

    return null;
}

function normalizeResourceStoragePath(value = "") {
    const raw = cleanString(value, 1000);
    if (!raw) return "";
    if (raw.startsWith("gs://")) return raw.replace(/^gs:\/\/[^/]+\//, "");
    return raw;
}

function getResourceFileKey(value = "") {
    return normalizePublicKey(value).replace(/[^a-z0-9.]+/g, "");
}

async function findStoredCourseResourceFile({ courseId = "", chapterId = "", fileName = "", storagePath = "" } = {}) {
    const bucket = admin.storage().bucket(SBI_STORAGE_BUCKET);
    const directPath = normalizeResourceStoragePath(storagePath);
    if (directPath) return bucket.file(directPath);

    const safeCourseId = cleanString(courseId, 180);
    const safeChapterId = cleanString(chapterId, 180);
    if (!safeCourseId || !safeChapterId) return null;

    const targetKey = getResourceFileKey(fileName);
    const [files] = await bucket.getFiles({ prefix: `courses/${safeCourseId}/chapters/${safeChapterId}/` });
    if (!files.length) return null;

    if (!targetKey) return files[0];

    for (const file of files) {
        const baseName = file.name.split("/").pop() || "";
        const baseKey = getResourceFileKey(baseName);
        if (baseKey.endsWith(targetKey)) return file;

        try {
            const [metadata] = await file.getMetadata();
            if (getResourceFileKey(metadata?.metadata?.originalName || "") === targetKey) return file;
        } catch (error) {
            console.warn("Metadata ressource cours inaccessible :", file.name, error.message);
        }
    }

    return null;
}

async function getFirebaseStorageDownloadUrl(file) {
    if (!file) return "";
    const [metadata] = await file.getMetadata();
    const customMetadata = metadata?.metadata || {};
    const tokens = cleanString(customMetadata.firebaseStorageDownloadTokens || "", 1000)
        .split(",")
        .map((token) => cleanString(token, 180))
        .filter(Boolean);
    let token = tokens[0] || "";

    if (!token) {
        token = crypto.randomUUID();
        await file.setMetadata({
            metadata: {
                ...customMetadata,
                firebaseStorageDownloadTokens: token
            }
        });
    }

    return `https://firebasestorage.googleapis.com/v0/b/${SBI_STORAGE_BUCKET}/o/${encodeURIComponent(file.name)}?alt=media&token=${encodeURIComponent(token)}`;
}

exports.resolveCourseResourceDownload = onCall({
    region: "europe-west1",
    timeoutSeconds: 45,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const courseId = cleanString(request.data?.courseId, 180);
    const chapterId = cleanString(request.data?.chapterId, 180);
    const fileName = cleanString(request.data?.fileName, 240);

    if (!courseId) throw new HttpsError("invalid-argument", "Cours manquant.");

    const courseSnap = await db.collection("courses").doc(courseId).get();
    if (!courseSnap.exists) throw new HttpsError("not-found", "Cours introuvable.");
    const courseData = courseSnap.data() || {};

    if (!canResolveCourseResource(caller, courseData)) {
        throw new HttpsError("permission-denied", "Ressource non accessible.");
    }

    const resourceChapter = findCourseResourceChapter(courseData, { chapterId, fileName });
    if (!resourceChapter) throw new HttpsError("not-found", "Ressource introuvable dans le cours.");

    // 8.0P.167.248 (audit S4) : ne jamais faire confiance au storagePath fourni par le
    // client. On privilégie le chemin issu de la fiche cours (resourceStoragePath, donnée
    // serveur). Le fallback client n'est accepté que s'il reste confiné au dossier du cours
    // (pas de path-traversal vers d'autres cours / documents élèves).
    let storagePath = normalizeResourceStoragePath(resourceChapter.resourceStoragePath || "");
    if (!storagePath) {
        const clientPath = normalizeResourceStoragePath(request.data?.storagePath || "");
        if (clientPath && clientPath.startsWith(`courses/${courseId}/`) && !clientPath.includes("..")) {
            storagePath = clientPath;
        }
    }
    const file = await findStoredCourseResourceFile({
        courseId,
        chapterId: cleanString(resourceChapter.id || chapterId, 180),
        fileName: resourceChapter.resourceFileName || fileName,
        storagePath
    });
    if (!file) throw new HttpsError("not-found", "Fichier introuvable dans Storage.");

    const [exists] = await file.exists();
    if (!exists) throw new HttpsError("not-found", "Fichier introuvable dans Storage.");

    return {
        url: await getFirebaseStorageDownloadUrl(file),
        storagePath: file.name,
        fileName: resourceChapter.resourceFileName || fileName || file.name.split("/").pop() || "ressource"
    };
});

function normalizeLiveRole(value = "") {
    const role = cleanString(value, 60).toLowerCase();
    if (["prof", "professeur", "enseignant"].includes(role)) return "teacher";
    if (["eleve", "etudiant", "student"].includes(role)) return "student";
    return role;
}

function makeLiveSessionId(promotionId = "", liveKey = "") {
    const cleanPromotionId = cleanString(promotionId, 120);
    const cleanLiveKey = cleanString(liveKey, 120);
    if (cleanPromotionId && cleanLiveKey.startsWith(`${cleanPromotionId}_`)) {
        return cleanLiveKey.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
    }
    const raw = `${cleanPromotionId}_${cleanLiveKey || crypto.randomUUID()}`;
    return raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
}

function normalizeLiveIso(value, label = "date") {
    const raw = cleanString(value, 80);
    if (!raw) throw new HttpsError("invalid-argument", `${label} manquante.`);
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) {
        throw new HttpsError("invalid-argument", `${label} invalide.`);
    }
    return date.toISOString();
}

function liveDateInWindow(startIso = "", windowStart = "", windowEnd = "") {
    const startMs = Date.parse(startIso);
    const fromMs = windowStart ? Date.parse(windowStart) : NaN;
    const toMs = windowEnd ? Date.parse(windowEnd) : NaN;
    if (!Number.isFinite(startMs)) return false;
    if (Number.isFinite(fromMs) && startMs < fromMs) return false;
    if (Number.isFinite(toMs) && startMs > toMs) return false;
    return true;
}

function getPromotionDisplayName(promotion = {}) {
    return cleanString(promotion.name || promotion.promotionName || promotion.title || promotion.titre || "Promotion SBI", 180);
}

function sanitizeLivePromotionForScheduler(promotion = {}) {
    const safe = { ...promotion };
    delete safe.students;
    delete safe.studentEmails;
    delete safe.eleves;
    delete safe.apprenants;
    delete safe.roster;
    delete safe.privateNotes;
    return safe;
}


function getLiveSchedulerTemplateId(promotion = {}) {
    return cleanString(
        promotion.curriculumTemplateId
        || promotion.templateId
        || promotion.cursusTemplateId
        || promotion.curriculumId
        || promotion.curriculumTemplate?.id
        || promotion.cursus?.id
        || "",
        180
    );
}

function isLiveSchedulerTemplateItem(item = {}) {
    const type = cleanString(item.type || item.kind || item.sourceType || "", 80).toLowerCase();
    return type === "live_session" || type === "workshop" || Boolean(item.liveTracking && typeof item.liveTracking === "object");
}

function sanitizeLiveSchedulerTemplateItem(item = {}, index = 0) {
    const liveTracking = item.liveTracking && typeof item.liveTracking === "object" ? item.liveTracking : {};
    const schedulingWindow = item.schedulingWindow && typeof item.schedulingWindow === "object" ? item.schedulingWindow : {};
    return {
        id: cleanString(item.id || "", 180),
        itemId: cleanString(item.itemId || "", 180),
        sourceItemId: cleanString(item.sourceItemId || "", 180),
        liveId: cleanString(item.liveId || "", 180),
        templateItemId: cleanString(item.templateItemId || item.id || item.itemId || "", 180),
        type: cleanString(item.type || item.kind || item.sourceType || "live_session", 80),
        title: cleanString(item.title || item.courseTitle || liveTracking.title || "Live sans titre", 240),
        courseTitle: cleanString(item.courseTitle || item.title || liveTracking.title || "", 240),
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        startOffsetDays: Number.isFinite(Number(item.startOffsetDays)) ? Number(item.startOffsetDays) : 0,
        estimatedDurationDays: Number.isFinite(Number(item.estimatedDurationDays || item.durationDays)) ? Number(item.estimatedDurationDays || item.durationDays) : 1,
        teacherSchedulingWindowStartAt: cleanString(item.teacherSchedulingWindowStartAt || "", 80),
        teacherSchedulingWindowEndAt: cleanString(item.teacherSchedulingWindowEndAt || "", 80),
        schedulingWindow: {
            teacherCanSelectFrom: cleanString(schedulingWindow.teacherCanSelectFrom || liveTracking.schedulingWindow?.teacherCanSelectFrom || "", 80),
            teacherCanSelectUntil: cleanString(schedulingWindow.teacherCanSelectUntil || liveTracking.schedulingWindow?.teacherCanSelectUntil || "", 80),
            recommendedStartAt: cleanString(schedulingWindow.recommendedStartAt || liveTracking.schedulingWindow?.recommendedStartAt || "", 80),
            recommendedEndAt: cleanString(schedulingWindow.recommendedEndAt || liveTracking.schedulingWindow?.recommendedEndAt || "", 80)
        },
        liveTracking: {
            title: cleanString(liveTracking.title || item.title || item.courseTitle || "", 240),
            itemId: cleanString(liveTracking.itemId || "", 180),
            sourceItemId: cleanString(liveTracking.sourceItemId || "", 180),
            templateItemId: cleanString(liveTracking.templateItemId || item.id || item.itemId || "", 180),
            schedulingWindow: {
                teacherCanSelectFrom: cleanString(liveTracking.schedulingWindow?.teacherCanSelectFrom || schedulingWindow.teacherCanSelectFrom || "", 80),
                teacherCanSelectUntil: cleanString(liveTracking.schedulingWindow?.teacherCanSelectUntil || schedulingWindow.teacherCanSelectUntil || "", 80),
                recommendedStartAt: cleanString(liveTracking.schedulingWindow?.recommendedStartAt || schedulingWindow.recommendedStartAt || "", 80),
                recommendedEndAt: cleanString(liveTracking.schedulingWindow?.recommendedEndAt || schedulingWindow.recommendedEndAt || "", 80)
            }
        }
    };
}

function sanitizeLiveSchedulerTemplate(template = {}) {
    const rawItems = Array.isArray(template.items) ? template.items : [];
    const items = rawItems
        .filter((item) => item && typeof item === "object" && isLiveSchedulerTemplateItem(item))
        .map((item, index) => sanitizeLiveSchedulerTemplateItem(item, index));
    return {
        id: cleanString(template.id || "", 180),
        title: cleanString(template.title || template.name || template.formationName || "Cursus SBI", 240),
        formationId: cleanString(template.formationId || "", 180),
        formationName: cleanString(template.formationName || template.formationTitle || "", 240),
        items
    };
}

async function loadLiveSchedulerTemplates(db, promotions = []) {
    const ids = Array.from(new Set(promotions
        .map(getLiveSchedulerTemplateId)
        .map((id) => cleanString(id, 180))
        .filter(Boolean)));
    const templates = [];

    for (const id of ids) {
        try {
            const docSnap = await db.collection("curriculumTemplates").doc(id).get();
            if (!docSnap.exists) continue;
            const template = sanitizeLiveSchedulerTemplate({ id: docSnap.id, ...(docSnap.data() || {}) });
            if (template.items.length) templates.push(template);
        } catch (error) {
            console.warn("[SBI Lives] Cursus template indisponible pour scheduler :", id, error?.message || error);
        }
    }

    return templates;
}

async function loadLiveSessionsForScheduler(db, promotionIds = []) {
    const ids = Array.from(new Set((Array.isArray(promotionIds) ? promotionIds : [])
        .map((value) => cleanString(value, 180))
        .filter(Boolean)));
    const sessions = [];

    for (let index = 0; index < ids.length; index += 10) {
        const part = ids.slice(index, index + 10);
        const snap = await db.collection("liveSessions").where("promotionId", "in", part).get();
        snap.forEach((docSnap) => {
            sessions.push({ id: docSnap.id, ...(docSnap.data() || {}) });
        });
    }

    return sessions;
}

function findPromotionLiveItem(promotion = {}, { liveId = "", sourceItemId = "", title = "" } = {}) {
    const livePlanning = Array.isArray(promotion.livePlanning) ? promotion.livePlanning : [];
    const cleanLiveId = cleanString(liveId, 180);
    const cleanSourceItemId = cleanString(sourceItemId, 180);
    const cleanTitle = cleanString(title, 180).toLowerCase();

    return livePlanning.find((item) => {
        const ids = [
            item.id,
            item.itemId,
            item.sourceItemId,
            item.liveId,
            item.templateItemId
        ].map((value) => cleanString(value, 180)).filter(Boolean);
        if (cleanLiveId && ids.includes(cleanLiveId)) return true;
        if (cleanSourceItemId && ids.includes(cleanSourceItemId)) return true;
        if (cleanTitle && cleanString(item.title || item.courseTitle || "", 180).toLowerCase() === cleanTitle) return true;
        return false;
    }) || null;
}

function findPromotionCoursePlanLiveItem(promotion = {}, { liveId = "", sourceItemId = "", title = "" } = {}) {
    const coursePlan = getCoursePlanItemsFromPromotion(promotion);
    const cleanLiveId = cleanString(liveId, 180);
    const cleanSourceItemId = cleanString(sourceItemId, 180);
    const cleanTitle = cleanString(title, 180).toLowerCase();

    return coursePlan.find((item) => {
        const ids = [
            item.id,
            item.itemId,
            item.sourceItemId,
            item.liveId,
            item.templateItemId,
            item.liveTracking?.itemId,
            item.liveTracking?.sourceItemId
        ].map((value) => cleanString(value, 180)).filter(Boolean);
        if (cleanLiveId && ids.includes(cleanLiveId)) return true;
        if (cleanSourceItemId && ids.includes(cleanSourceItemId)) return true;
        if (cleanTitle && [item.title, item.courseTitle, item.liveTracking?.title].map((value) => cleanString(value, 180).toLowerCase()).filter(Boolean).includes(cleanTitle)) return true;
        return false;
    }) || null;
}

function isLiveTestRequest({ liveId = "", sourceItemId = "", type = "", liveItem = null } = {}) {
    const values = [
        liveId,
        sourceItemId,
        type,
        liveItem?.id,
        liveItem?.itemId,
        liveItem?.sourceItemId,
        liveItem?.type
    ].map((value) => cleanString(value, 180).toLowerCase()).filter(Boolean);

    return liveItem?.isTestLive === true
        || liveItem?.testLive === true
        || values.includes("sbi-live-test")
        || values.includes("live_test");
}

async function teacherCanManagePromotionLive(db, caller, promotion = {}) {
    if (caller.isAdmin || caller.data.isGod === true || caller.data.role === "admin") return true;
    if (normalizeLiveRole(caller.data.role) !== "teacher") return false;

    const formationId = cleanString(promotion.formationId || promotion.sourceFormationId || "", 180);
    const formationName = cleanString(promotion.formationName || promotion.formationTitle || promotion.title || "", 180);
    const callerFormationIds = Array.isArray(caller.data.formationIds) ? caller.data.formationIds.map((item) => cleanString(item, 180)) : [];
    const callerFormationTitles = Array.isArray(caller.data.formationsAcces) ? caller.data.formationsAcces.map((item) => cleanString(item, 180)) : [];
    const promotionTeachers = [
        ...(Array.isArray(promotion.teacherIds) ? promotion.teacherIds : []),
        ...(Array.isArray(promotion.profs) ? promotion.profs : [])
    ].map((item) => cleanString(item, 180));

    if (promotionTeachers.includes(caller.uid)) return true;
    if (formationId && callerFormationIds.includes(formationId)) return true;
    if (formationName && callerFormationTitles.includes(formationName)) return true;

    if (formationId) {
        const formationDoc = await db.collection("formations").doc(formationId).get();
        const formation = formationDoc.exists ? (formationDoc.data() || {}) : {};
        const formationProfs = Array.isArray(formation.profs) ? formation.profs.map((item) => cleanString(item, 180)) : [];
        if (formationProfs.includes(caller.uid)) return true;
    }

    return false;
}

function buildLiveStudentEmail({ student = {}, liveSession = {}, kind = "scheduled" } = {}) {
    const startLabel = liveSession.selectedStartAt
        ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(liveSession.selectedStartAt))
        : "date à confirmer";
    const liveUrl = `${SBI_SITE_URL}/student/lives.html?liveId=${encodeURIComponent(liveSession.id || "")}`;
    const isStarted = kind === "started";
    const isTestStarted = kind === "test_started";
    const isReported = kind === "reported" || liveSession.report === true || cleanString(liveSession.schedulingStatus || "", 60).toLowerCase() === "report";

    let message = "";
    let subject = "";
    let preheader = "";
    let textContent = "";

    if (isStarted) {
        subject = `SBI - Live démarré : ${liveSession.title || "session en direct"}`;
        preheader = "Ton live SBI démarre maintenant.";
        message = `
            <p style="margin:0 0 16px 0;">Le live <strong>${escapeHtml(liveSession.title || "SBI")}</strong> vient de démarrer.</p>
            <p style="margin:0 0 16px 0;">Connecte-toi depuis ton espace élève pour rejoindre la session.</p>
            ${buildActionButtonHtml(liveUrl, "Ouvrir mes lives")}
        `;
        textContent = `Le live ${liveSession.title || "SBI"} vient de démarrer. ${liveUrl}`;
    } else if (isTestStarted) {
        subject = `SBI - Salle test ouverte : ${liveSession.promotionName || "promotion"}`;
        preheader = "Une salle test SBI est ouverte maintenant.";
        message = `
            <p style="margin:0 0 16px 0;">Une <strong>salle test live</strong> est ouverte pour ta promotion.</p>
            <p style="margin:0 0 16px 0;">Connecte-toi depuis ton espace élève pour vérifier ton accès à la salle.</p>
            ${buildActionButtonHtml(liveUrl, "Rejoindre la salle test")}
        `;
        textContent = `Salle test SBI ouverte maintenant. ${liveUrl}`;
    } else if (isReported) {
        subject = `SBI - Report de live : ${liveSession.title || "session en direct"}`;
        preheader = "Un live SBI est en report hors période prévue.";
        message = `
            <p style="margin:0 0 16px 0;">Le live <strong>${escapeHtml(liveSession.title || "Live SBI")}</strong> est en <strong>report hors période prévue</strong>.</p>
            <p style="margin:0 0 16px 0;">Une date de report est proposée afin de maintenir la session dans les meilleures conditions.</p>
            <p style="margin:0 0 16px 0;"><strong>Date de report proposée :</strong> ${escapeHtml(startLabel)}</p>
            ${buildActionButtonHtml(liveUrl, "Voir le report")}
        `;
        textContent = `Report de live : ${liveSession.title || "SBI"}. Date de report proposée : ${startLabel}. ${liveUrl}`;
    } else {
        subject = `SBI - Live programmé : ${liveSession.title || "session en direct"}`;
        preheader = "Un live SBI a été programmé.";
        message = `
            <p style="margin:0 0 16px 0;">Un live a été programmé pour ta promotion : <strong>${escapeHtml(liveSession.title || "Live SBI")}</strong>.</p>
            <p style="margin:0 0 16px 0;"><strong>Date et horaire :</strong> ${escapeHtml(startLabel)}</p>
            ${buildActionButtonHtml(liveUrl, "Voir le live")}
        `;
        textContent = `Live programmé : ${liveSession.title || "SBI"} - ${startLabel}. ${liveUrl}`;
    }

    return {
        sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
        to: [{
            email: cleanEmail(student.email),
            name: getAccountDisplayName(student)
        }],
        replyTo: { email: SBI_CONTACT_EMAIL, name: "Sport Business Institute" },
        subject,
        htmlContent: renderSbiEmailTemplate({
            prenom: student.prenom || "",
            nomExpediteur: "L'équipe SBI",
            posteExpediteur: "Pédagogie",
            preheader,
            messageHtml: message
        }),
        textContent,
        tags: [
            "sbi_live",
            isStarted ? "sbi_live_started" : isTestStarted ? "sbi_live_test_started" : isReported ? "sbi_live_report" : "sbi_live_scheduled"
        ]
    };
}

async function notifyPromotionStudentsForLive({ db, promotion, liveSession, kind = "scheduled", apiKey = "" }) {
    const students = await listPromotionStudents(db, { id: liveSession.promotionId, ...promotion });
    let notified = 0;
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const student of students) {
        const notificationType = kind === "started" ? "live_started" : kind === "test_started" ? "live_test_started" : kind === "reported" ? "live_reported" : "live_scheduled";
        const notificationId = `${notificationType}_${liveSession.id}_${student.id}`.slice(0, 240);
        const notificationRef = db.collection("notifications").doc(notificationId);
        const notificationSnap = await notificationRef.get();
        const previous = notificationSnap.exists ? (notificationSnap.data() || {}) : {};
        const shouldEmail = kind === "started"
            ? previous.emailSent !== true
            : previous.emailSent !== true || previous.selectedStartAt !== liveSession.selectedStartAt;
        let emailSent = previous.emailSent === true && !shouldEmail;
        let emailError = "";

        if (shouldEmail && apiKey && isValidEmail(cleanEmail(student.email))) {
            try {
                await sendBrevoTransactionalEmail(buildLiveStudentEmail({ student, liveSession, kind }), apiKey, [notificationType]);
                emailSent = true;
                emailsSent += 1;
            } catch (error) {
                emailError = error.message || "Email live impossible.";
                emailsFailed += 1;
                console.error("Email live eleve impossible :", liveSession.id, student.id, emailError);
            }
        }

        await notificationRef.set({
            type: notificationType,
            destinataireId: student.id,
            liveId: liveSession.id,
            liveTitle: liveSession.title || "Live SBI",
            promotionId: liveSession.promotionId,
            promotionName: liveSession.promotionName || getPromotionDisplayName(promotion),
            selectedStartAt: liveSession.selectedStartAt || "",
            selectedEndAt: liveSession.selectedEndAt || "",
            actionUrl: `/student/lives.html?liveId=${encodeURIComponent(liveSession.id || "")}`,
            message: kind === "started"
                ? `Le live "${liveSession.title || "SBI"}" vient de démarrer.`
                : kind === "test_started"
                    ? `Salle test ouverte : ${liveSession.promotionName || liveSession.title || "SBI"}.`
                    : kind === "reported"
                        ? `Report de live : ${liveSession.title || "SBI"}.`
                        : `Live programmé : ${liveSession.title || "SBI"}.`,
            emailSent,
            emailError,
            status: "open",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: previous.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            dateCreation: previous.dateCreation || admin.firestore.FieldValue.serverTimestamp(),
            dismissedBy: Array.isArray(previous.dismissedBy) ? previous.dismissedBy : []
        }, { merge: true });
        notified += 1;
    }

    return { students: students.length, notified, emailsSent, emailsFailed };
}


const DAILY_API_BASE_URL = "https://api.daily.co/v1";
const DAILY_ROOM_OPEN_BEFORE_MS = 30 * 60 * 1000;
const DAILY_ROOM_KEEP_AFTER_MS = 8 * 60 * 60 * 1000;
const DAILY_TOKEN_TTL_SECONDS = 4 * 60 * 60;
const LIVE_REPLAY_ACCESS_TTL_MS = 60 * 60 * 1000;

function buildDailyRoomName(liveId = "") {
    const base = cleanString(liveId || crypto.randomUUID(), 150)
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 112);
    return `sbi-${base || crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`.slice(0, 128);
}

function getDailyRoomNameFromSession(liveSession = {}) {
    const explicit = cleanString(liveSession.providerRoomName || liveSession.roomName || "", 128);
    if (explicit) return explicit;
    const url = cleanString(liveSession.providerRoomUrl || liveSession.meetingUrl || "", 500);
    try {
        const parsed = new URL(url);
        const name = parsed.pathname.split("/").filter(Boolean).pop() || "";
        if (name) return cleanString(name, 128);
    } catch (_) {}
    return buildDailyRoomName(liveSession.id || "");
}

function buildDailyRoomTiming(liveSession = {}) {
    const startMs = Date.parse(liveSession.selectedStartAt || "");
    const endMs = Date.parse(liveSession.selectedEndAt || "");
    const now = Date.now();
    const nbfMs = Number.isFinite(startMs) ? Math.max(now - 5 * 60 * 1000, startMs - DAILY_ROOM_OPEN_BEFORE_MS) : now - 5 * 60 * 1000;
    const expMs = Number.isFinite(endMs)
        ? Math.max(endMs + DAILY_ROOM_KEEP_AFTER_MS, now + DAILY_TOKEN_TTL_SECONDS * 1000)
        : now + DAILY_ROOM_KEEP_AFTER_MS;
    return {
        nbf: Math.floor(nbfMs / 1000),
        exp: Math.floor(expMs / 1000)
    };
}

function getDailyTokenExpirationSeconds(liveSession = {}) {
    const nowSec = Math.floor(Date.now() / 1000);
    const maxSec = nowSec + DAILY_TOKEN_TTL_SECONDS;
    const selectedEndMs = Date.parse(liveSession.selectedEndAt || "");
    if (!Number.isFinite(selectedEndMs)) return maxSec;

    const sessionSec = Math.floor((selectedEndMs + 2 * 60 * 60 * 1000) / 1000);
    return Math.min(Math.max(sessionSec, nowSec + 30 * 60), maxSec);
}

async function callDailyApi(apiKey = "", path = "", { method = "GET", body = null, allowNotFound = false } = {}) {
    if (!apiKey) {
        throw new HttpsError("failed-precondition", "DAILY_API_KEY manquant cote serveur.");
    }

    const response = await fetch(`${DAILY_API_BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    let payload = {};
    try {
        payload = text ? JSON.parse(text) : {};
    } catch (_) {
        payload = { raw: text };
    }

    if (allowNotFound && response.status === 404) return null;

    if (!response.ok) {
        const message = cleanString(payload?.info || payload?.error || payload?.message || `Daily API ${response.status}`, 500);
        throw new HttpsError("failed-precondition", `Daily API : ${message}`);
    }

    return payload;
}

async function ensureDailyRoomForLive({ apiKey = "", liveRef, liveSession = {}, caller, allowCreate = false }) {
    const roomName = getDailyRoomNameFromSession(liveSession);
    const timing = buildDailyRoomTiming(liveSession);
    let room = await callDailyApi(apiKey, `/rooms/${encodeURIComponent(roomName)}`, { allowNotFound: true });

    if (!room && !allowCreate) {
        throw new HttpsError("failed-precondition", "Salle pas encore ouverte par l’intervenant.");
    }

    const roomProperties = {
        nbf: timing.nbf,
        exp: timing.exp,
        enable_prejoin_ui: true,
        enable_people_ui: true,
        enable_chat: true,
        enable_advanced_chat: true,
        enable_screenshare: true,
        enable_network_ui: true,
        enable_recording: "cloud",
        start_audio_off: true,
        start_video_off: true,
        eject_at_room_exp: true
    };

    if (!room) {
        room = await callDailyApi(apiKey, "/rooms", {
            method: "POST",
            body: {
                name: roomName,
                privacy: "private",
                properties: roomProperties
            }
        });
    } else {
        room = await callDailyApi(apiKey, `/rooms/${encodeURIComponent(roomName)}`, {
            method: "POST",
            body: {
                privacy: "private",
                properties: roomProperties
            }
        });
    }

    await liveRef.set({
        provider: "daily",
        providerRoomName: room.name || roomName,
        providerRoomUrl: room.url || liveSession.providerRoomUrl || liveSession.meetingUrl || "",
        roomName: room.name || roomName,
        meetingUrl: room.url || liveSession.meetingUrl || "",
        liveTech: {
            ...(liveSession.liveTech || {}),
            provider: "daily",
            providerReady: true,
            roomName: room.name || roomName,
            roomUrl: room.url || liveSession.providerRoomUrl || liveSession.meetingUrl || "",
            chatEnabled: true,
            fileSharingEnabled: true,
            watermark: "page_overlay",
            createdByUid: liveSession.liveTech?.createdByUid || caller.uid
        },
        providerUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return room;
}

async function createDailyMeetingToken({ apiKey = "", roomName = "", caller, callerRole = "student", isOwner = false, liveSession = {} }) {
    const tokenExp = getDailyTokenExpirationSeconds(liveSession);
    const displayName = getAccountDisplayName(caller.data || {}) || caller.email || "Participant SBI";

    const tokenProperties = {
        room_name: roomName,
        user_name: displayName,
        user_id: cleanString(caller.uid, 36),
        is_owner: isOwner,
        exp: tokenExp,
        eject_at_token_exp: true,
        enable_prejoin_ui: true,
        enable_screenshare: isOwner,
        start_audio_off: !isOwner,
        start_video_off: !isOwner,
        lang: "fr"
    };

    // L'enregistrement cloud est declenche cote client (live-room-page.js) des
    // que l'intervenant rejoint la salle, afin de tracer l'instanceId et de
    // reutiliser le flux markRecordingState existant. On ne pose donc PAS
    // start_cloud_recording sur le token (evite un double enregistrement).
    // enable_recording: "cloud" reste actif au niveau de la room.

    const token = await callDailyApi(apiKey, "/meeting-tokens", {
        method: "POST",
        body: { properties: tokenProperties }
    });

    return {
        token: token.token || "",
        displayName,
        tokenExp,
        accessRole: callerRole
    };
}

function collectCallerPromotionKeys(callerData = {}) {
    return [
        callerData.promotionId,
        callerData.currentPromotionId,
        callerData.assignedPromotionId,
        callerData.cohortId,
        ...(Array.isArray(callerData.promotionIds) ? callerData.promotionIds : []),
        ...(Array.isArray(callerData.assignedPromotionIds) ? callerData.assignedPromotionIds : [])
    ].map((value) => cleanString(value, 180)).filter(Boolean);
}

async function studentCanJoinLivePromotion(db, caller, promotion = {}) {
    if (caller.isAdmin || caller.data?.isGod === true || caller.data?.role === "admin") return true;
    if (normalizeLiveRole(caller.data?.role || "") === "teacher") return teacherCanManagePromotionLive(db, caller, promotion);
    if (normalizeLiveRole(caller.data?.role || "") !== "student") return false;

    const promotionId = cleanString(promotion.id || "", 180);
    if (promotionId && collectCallerPromotionKeys(caller.data || {}).includes(promotionId)) return true;

    const students = await listPromotionStudents(db, promotion);
    return students.some((student) => student.id === caller.uid);
}

function isHostLiveRole(caller = {}) {
    return caller.isAdmin || caller.data?.isGod === true || caller.data?.role === "admin" || normalizeLiveRole(caller.data?.role || "") === "teacher";
}


async function updatePromotionLivePlanningForStarted({ promotionRef, promotion = {}, liveSession = {}, caller, room = {} }) {
    const livePlanning = Array.isArray(promotion.livePlanning) ? [...promotion.livePlanning] : [];
    if (!livePlanning.length) return false;

    const liveId = cleanString(liveSession.id || "", 180);
    const sourceItemId = cleanString(liveSession.sourceItemId || "", 180);
    let changed = false;
    const openedAt = new Date().toISOString();

    const updated = livePlanning.map((item) => {
        if (!item || typeof item !== "object") return item;
        const ids = [
            item.liveSessionId,
            item.id,
            item.itemId,
            item.sourceItemId,
            item.liveId
        ].map((value) => cleanString(value, 180)).filter(Boolean);
        const match = ids.includes(liveId) || (sourceItemId && ids.includes(sourceItemId));
        if (!match) return item;
        changed = true;
        return {
            ...item,
            liveSessionId: liveId || item.liveSessionId || "",
            status: "live",
            liveSchedulingStatus: "live",
            studentScheduleStatus: "live",
            providerReady: true,
            providerRoomName: room.name || liveSession.providerRoomName || liveSession.roomName || item.providerRoomName || "",
            providerRoomUrl: room.url || liveSession.providerRoomUrl || liveSession.meetingUrl || item.providerRoomUrl || "",
            meetingUrl: room.url || liveSession.meetingUrl || item.meetingUrl || "",
            openedAt,
            startedAt: openedAt,
            openedByUid: caller.uid,
            startedByUid: caller.uid
        };
    });

    if (!changed) return false;
    await promotionRef.set({
        livePlanning: updated,
        livePlanningUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        livePlanningUpdatedBy: caller.uid
    }, { merge: true });
    return true;
}

exports.joinLiveConference = onCall({
    region: "europe-west1",
    secrets: [DAILY_API_KEY],
    timeoutSeconds: 60,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const data = request.data || {};
    const liveId = cleanString(data.liveId, 180);
    const markStarted = data.markStarted === true;

    if (!liveId) throw new HttpsError("invalid-argument", "Live manquant.");

    const liveRef = db.collection("liveSessions").doc(liveId);
    const liveDoc = await liveRef.get();
    if (!liveDoc.exists) throw new HttpsError("not-found", "Live introuvable.");
    const liveSession = { id: liveDoc.id, ...(liveDoc.data() || {}) };

    const promotionId = cleanString(liveSession.promotionId || "", 180);
    if (!promotionId) throw new HttpsError("failed-precondition", "Promotion live manquante.");

    const promotionRef = db.collection("promotions").doc(promotionId);
    const promotionDoc = await promotionRef.get();
    if (!promotionDoc.exists) throw new HttpsError("not-found", "Promotion introuvable.");
    const promotion = { id: promotionDoc.id, ...(promotionDoc.data() || {}) };

    const canAccess = await studentCanJoinLivePromotion(db, caller, promotion);
    if (!canAccess) throw new HttpsError("permission-denied", "Vous ne pouvez pas rejoindre ce live.");

    const host = isHostLiveRole(caller) && await teacherCanManagePromotionLive(db, caller, promotion);
    const apiKey = DAILY_API_KEY.value();
    const room = await ensureDailyRoomForLive({ apiKey, liveRef, liveSession, caller, allowCreate: host });
    const roomName = room.name || getDailyRoomNameFromSession(liveSession);
    const roomUrl = room.url || liveSession.providerRoomUrl || liveSession.meetingUrl || "";
    if (!roomUrl) throw new HttpsError("failed-precondition", "URL de salle Daily introuvable.");

    const tokenData = await createDailyMeetingToken({
        apiKey,
        roomName,
        caller,
        callerRole: host ? "host" : "student",
        isOwner: host,
        liveSession
    });

    const updatePayload = {
        lastJoinTokenIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastJoinTokenIssuedBy: caller.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const shouldMarkStarted = host && markStarted && !["live", "ended", "replay_available", "cancelled"].includes(cleanString(liveSession.status || "", 80));
    if (shouldMarkStarted) {
        updatePayload.status = "live";
        updatePayload.schedulingStatus = cleanString(liveSession.schedulingStatus || "", 80) === "report" || liveSession.report === true ? "report" : "live";
        updatePayload.openedAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.startedAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.startedByUid = caller.uid;
        updatePayload.startedByEmail = caller.email;
    }

    await liveRef.set(updatePayload, { merge: true });

    if (shouldMarkStarted) {
        await updatePromotionLivePlanningForStarted({
            promotionRef,
            promotion,
            liveSession: { ...liveSession, ...updatePayload, id: liveId },
            caller,
            room
        });
    }

    await liveRef.collection("attendance").doc(caller.uid).set({
        uid: caller.uid,
        email: cleanEmail(caller.email),
        displayName: tokenData.displayName,
        role: tokenData.accessRole,
        joinedVia: "joinLiveConference",
        provider: "daily",
        roomName,
        lastTokenIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: host ? "live.conference_host_join" : "live.conference_student_join",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: "",
        targetEmail: "",
        targetRole: host ? "host" : "student",
        source: "live-room",
        liveId,
        promotionId,
        changes: {
            provider: "daily",
            roomName,
            markStarted: host && markStarted
        }
    });

    return {
        success: true,
        provider: "daily",
        liveId,
        title: liveSession.title || "Live SBI",
        promotionId,
        promotionName: liveSession.promotionName || getPromotionDisplayName(promotion),
        roomName,
        roomUrl,
        token: tokenData.token,
        tokenExp: tokenData.tokenExp,
        displayName: tokenData.displayName,
        accessRole: tokenData.accessRole,
        canModerate: host,
        message: "Salle de conference prete."
    };
});


async function cleanupLiveSessionFiles({ db, liveId = "" } = {}) {
    const cleanedLiveId = cleanString(liveId, 180);
    if (!cleanedLiveId) return { files: 0, storageDeleted: 0, storageFailed: 0 };

    const filesSnap = await db.collection("liveSessions").doc(cleanedLiveId).collection("files").get();
    if (filesSnap.empty) return { files: 0, storageDeleted: 0, storageFailed: 0 };

    const storagePaths = [];
    const batches = [];
    let batch = db.batch();
    let opCount = 0;

    filesSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const storagePath = cleanString(data.storagePath || "", 800);
        if (storagePath) storagePaths.push(storagePath);
        batch.delete(docSnap.ref);
        opCount += 1;
        if (opCount >= 450) {
            batches.push(batch);
            batch = db.batch();
            opCount = 0;
        }
    });

    if (opCount > 0) batches.push(batch);
    for (const item of batches) await item.commit();

    let storageDeleted = 0;
    let storageFailed = 0;
    const bucket = admin.storage().bucket(SBI_STORAGE_BUCKET);
    for (const storagePath of storagePaths) {
        try {
            await bucket.file(storagePath).delete({ ignoreNotFound: true });
            storageDeleted += 1;
        } catch (error) {
            storageFailed += 1;
            console.warn("[SBI Live] Suppression fichier storage impossible :", cleanedLiveId, storagePath, error?.message || error);
        }
    }

    return { files: filesSnap.size, storageDeleted, storageFailed };
}

async function updatePromotionLivePlanningForEnded({ promotionRef, promotion = {}, liveSession = {}, caller }) {
    const livePlanning = Array.isArray(promotion.livePlanning) ? [...promotion.livePlanning] : [];
    if (!livePlanning.length) return;
    const liveId = cleanString(liveSession.id || "", 180);
    const sourceItemId = cleanString(liveSession.sourceItemId || "", 180);
    const updated = livePlanning.map((item) => {
        if (!item || typeof item !== "object") return item;
        const ids = [
            item.liveSessionId,
            item.id,
            item.itemId,
            item.sourceItemId,
            item.liveId
        ].map((value) => cleanString(value, 180)).filter(Boolean);
        const match = ids.includes(liveId) || (sourceItemId && ids.includes(sourceItemId));
        if (!match) return item;
        return {
            ...item,
            status: "ended",
            liveSchedulingStatus: "ended",
            studentScheduleStatus: "ended",
            endedAt: new Date().toISOString(),
            endedByUid: caller.uid,
            replayStatus: item.replayStatus || "not_available"
        };
    });
    await promotionRef.set({
        livePlanning: updated,
        livePlanningUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        livePlanningUpdatedBy: caller.uid
    }, { merge: true });
}

exports.endLiveConference = onCall({
    region: "europe-west1",
    secrets: [DAILY_API_KEY],
    timeoutSeconds: 60,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const liveId = cleanString(request.data?.liveId, 180);
    if (!liveId) throw new HttpsError("invalid-argument", "Live manquant.");

    const liveRef = db.collection("liveSessions").doc(liveId);
    const liveDoc = await liveRef.get();
    if (!liveDoc.exists) throw new HttpsError("not-found", "Live introuvable.");
    const liveSession = { id: liveDoc.id, ...(liveDoc.data() || {}) };

    const promotionId = cleanString(liveSession.promotionId || "", 180);
    if (!promotionId) throw new HttpsError("failed-precondition", "Promotion live manquante.");

    const promotionRef = db.collection("promotions").doc(promotionId);
    const promotionDoc = await promotionRef.get();
    if (!promotionDoc.exists) throw new HttpsError("not-found", "Promotion introuvable.");
    const promotion = { id: promotionDoc.id, ...(promotionDoc.data() || {}) };

    const canManage = await teacherCanManagePromotionLive(db, caller, promotion);
    if (!canManage) throw new HttpsError("permission-denied", "Vous ne pouvez pas terminer ce live.");

    const apiKey = DAILY_API_KEY.value();
    const roomName = getDailyRoomNameFromSession(liveSession);
    let providerClosed = false;
    try {
        await callDailyApi(apiKey, `/rooms/${encodeURIComponent(roomName)}`, { method: "DELETE", allowNotFound: true });
        providerClosed = true;
    } catch (error) {
        console.warn("Daily room close ignored:", liveId, error.message || error);
    }

    await liveRef.set({
        status: "ended",
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
        endedByUid: caller.uid,
        endedByEmail: caller.email,
        providerClosed,
        liveTech: {
            ...(liveSession.liveTech || {}),
            providerReady: false,
            roomClosedAt: new Date().toISOString(),
            replayStatus: liveSession.liveTech?.replayStatus || "not_available"
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const fileCleanup = await cleanupLiveSessionFiles({ db, liveId });

    await updatePromotionLivePlanningForEnded({ promotionRef, promotion, liveSession, caller });

    await safeWriteAccountAuditLog(db, {
        type: "live.ended",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: "",
        targetEmail: "",
        targetRole: "promotion",
        source: "live-room",
        liveId,
        promotionId,
        changes: { provider: "daily", roomName, providerClosed, fileCleanup }
    });

    return {
        success: true,
        liveId,
        message: "Session live terminee.",
        providerClosed,
        fileCleanup
    };
});

exports.cancelLiveReplay = onCall({
    region: "europe-west1",
    secrets: [DAILY_API_KEY],
    timeoutSeconds: 60,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    if (!caller.isAdmin) throw new HttpsError("permission-denied", "Action reservee a l'administrateur.");

    const liveId = cleanString(request.data?.liveId, 180);
    if (!liveId) throw new HttpsError("invalid-argument", "Live manquant.");

    const liveRef = db.collection("liveSessions").doc(liveId);
    const liveDoc = await liveRef.get();
    if (!liveDoc.exists) throw new HttpsError("not-found", "Live introuvable.");
    const liveSession = { id: liveDoc.id, ...(liveDoc.data() || {}) };

    const promotionId = cleanString(liveSession.promotionId || "", 180);
    const promotionRef = promotionId ? db.collection("promotions").doc(promotionId) : null;
    const promotionDoc = promotionRef ? await promotionRef.get() : null;
    const promotion = promotionDoc?.exists ? { id: promotionDoc.id, ...(promotionDoc.data() || {}) } : null;

    // 1) Supprimer les enregistrements Daily lies a ce live (IRREVERSIBLE).
    const apiKey = DAILY_API_KEY.value();
    const roomName = cleanString(liveSession.providerRoomName || liveSession.roomName || liveSession.liveTech?.roomName || getDailyRoomNameFromSession(liveSession), 180);
    const recordingIds = new Set();
    const knownId = cleanString(liveSession.replayRecordingId || liveSession.liveTech?.recordingId || "", 180);
    if (knownId) recordingIds.add(knownId);
    if (roomName) {
        try {
            const list = await callDailyApi(apiKey, `/recordings?room_name=${encodeURIComponent(roomName)}&limit=100`);
            (Array.isArray(list?.data) ? list.data : []).forEach((rec) => {
                const id = extractDailyRecordingId(rec || {});
                if (id) recordingIds.add(id);
            });
        } catch (error) {
            console.warn("[SBI Cancel Live] list recordings ignored:", liveId, error.message || error);
        }
    }
    const deletedRecordings = [];
    for (const id of recordingIds) {
        try {
            await callDailyApi(apiKey, `/recordings/${encodeURIComponent(id)}`, { method: "DELETE", allowNotFound: true });
            deletedRecordings.push(id);
        } catch (error) {
            console.warn("[SBI Cancel Live] delete recording ignored:", id, error.message || error);
        }
    }

    // 2) Repasser le live en "a venir" (scheduled) + purge des champs replay.
    await liveRef.set({
        status: "scheduled",
        schedulingStatus: "scheduled",
        replayStatus: "not_available",
        replayProvider: admin.firestore.FieldValue.delete(),
        replayRecordingId: admin.firestore.FieldValue.delete(),
        replayUrl: admin.firestore.FieldValue.delete(),
        replayAccessExpiresAt: admin.firestore.FieldValue.delete(),
        replayLastAccessResolvedAt: admin.firestore.FieldValue.delete(),
        endedAt: admin.firestore.FieldValue.delete(),
        endedByUid: admin.firestore.FieldValue.delete(),
        endedByEmail: admin.firestore.FieldValue.delete(),
        liveTech: {
            ...(liveSession.liveTech || {}),
            replayStatus: "not_available",
            recordingStatus: "",
            recordingId: "",
            recordingInstanceId: "",
            recordingDurationSeconds: 0
        },
        cancelledReplayAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledReplayByUid: caller.uid,
        cancelledReplayByEmail: caller.email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 3) Inverse de updatePromotionLivePlanningForEnded sur le planning promotion.
    if (promotionRef && promotion) {
        const livePlanning = Array.isArray(promotion.livePlanning) ? [...promotion.livePlanning] : [];
        const sourceItemId = cleanString(liveSession.sourceItemId || "", 180);
        const updated = livePlanning.map((item) => {
            if (!item || typeof item !== "object") return item;
            const ids = [item.liveSessionId, item.id, item.itemId, item.sourceItemId, item.liveId]
                .map((value) => cleanString(value, 180)).filter(Boolean);
            const match = ids.includes(liveId) || (sourceItemId && ids.includes(sourceItemId));
            if (!match) return item;
            const next = {
                ...item,
                status: "scheduled",
                liveSchedulingStatus: "scheduled",
                studentScheduleStatus: "scheduled",
                teacherSelectionStatus: "selected",
                replayStatus: "not_available"
            };
            delete next.endedAt;
            delete next.endedByUid;
            return next;
        });
        await promotionRef.set({
            livePlanning: updated,
            livePlanningUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            livePlanningUpdatedBy: caller.uid
        }, { merge: true });
    }

    await safeWriteAccountAuditLog(db, {
        type: "live.replay_cancelled",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: "",
        targetEmail: "",
        targetRole: "promotion",
        source: "admin-live",
        liveId,
        promotionId,
        changes: { roomName, deletedRecordings, deletedCount: deletedRecordings.length }
    });

    return {
        success: true,
        liveId,
        deletedRecordings,
        message: deletedRecordings.length
            ? `Live repasse en « a venir ». ${deletedRecordings.length} enregistrement(s) Daily supprime(s).`
            : "Live repasse en « a venir ». Aucun enregistrement Daily a supprimer."
    };
});

exports.setLiveRecordingState = onCall({
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const data = request.data || {};
    const liveId = cleanString(data.liveId, 180);
    const recordingStatus = cleanString(data.recordingStatus, 80);
    if (!liveId) throw new HttpsError("invalid-argument", "Live manquant.");
    if (!["recording", "processing", "ready", "error", "not_available"].includes(recordingStatus)) {
        throw new HttpsError("invalid-argument", "Statut replay invalide.");
    }

    const liveRef = db.collection("liveSessions").doc(liveId);
    const liveDoc = await liveRef.get();
    if (!liveDoc.exists) throw new HttpsError("not-found", "Live introuvable.");
    const liveSession = { id: liveDoc.id, ...(liveDoc.data() || {}) };

    const promotionId = cleanString(liveSession.promotionId || "", 180);
    const promotionDoc = await db.collection("promotions").doc(promotionId).get();
    if (!promotionDoc.exists) throw new HttpsError("not-found", "Promotion introuvable.");
    const promotion = { id: promotionDoc.id, ...(promotionDoc.data() || {}) };

    const canManage = await teacherCanManagePromotionLive(db, caller, promotion);
    if (!canManage) throw new HttpsError("permission-denied", "Vous ne pouvez pas modifier le replay de ce live.");

    const replayStatus = recordingStatus === "recording"
        ? "recording"
        : recordingStatus === "processing"
            ? "processing"
            : recordingStatus === "ready"
                ? "available"
                : recordingStatus;

    await liveRef.set({
        liveTech: {
            ...(liveSession.liveTech || {}),
            recordingStatus,
            replayStatus,
            recordingInstanceId: cleanString(data.recordingInstanceId || liveSession.liveTech?.recordingInstanceId || "", 120),
            recordingError: cleanString(data.recordingError || "", 500),
            recordingUpdatedAt: new Date().toISOString()
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: "live.recording_state",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: "",
        targetEmail: "",
        targetRole: "promotion",
        source: "live-room",
        liveId,
        promotionId,
        changes: { recordingStatus, replayStatus }
    });

    return { success: true, recordingStatus, replayStatus };
});


function pickDailyRecordingForLive(recordings = []) {
    const readyStatuses = new Set(["finished", "ready", "completed", "uploaded", "available", "done"]);
    const normalized = Array.isArray(recordings) ? recordings : [];
    const ready = normalized.find((item) => readyStatuses.has(cleanString(item.status || item.state || "", 80).toLowerCase())) || normalized[0] || null;
    return ready;
}

function extractDailyRecordingId(recording = {}) {
    return cleanString(recording.id || recording.recording_id || recording.uuid || "", 180);
}

function extractDailyRecordingDuration(recording = {}) {
    const candidates = [recording.duration, recording.duration_sec, recording.duration_seconds, recording.max_participant_duration];
    for (const value of candidates) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
}

function createLiveReplayToken() {
    return crypto.randomBytes(32).toString("hex");
}

async function createLiveReplayAccessToken(db, { liveId = "", promotionId = "", caller, recordingId = "", downloadLink = "" } = {}) {
    const token = createLiveReplayToken();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + LIVE_REPLAY_ACCESS_TTL_MS);
    await db.collection("liveReplayAccessTokens").doc(token).set({
        token,
        liveId,
        promotionId,
        uid: caller.uid,
        email: cleanEmail(caller.email),
        recordingId,
        downloadLink,
        expiresAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { token, expiresAt };
}


exports.getStudentLiveAttendance = onCall({
    region: "europe-west1",
    timeoutSeconds: 60,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const rawIds = Array.isArray(request.data?.liveIds) ? request.data.liveIds : [];
    const liveIds = [...new Set(rawIds.map((value) => cleanString(value, 180)).filter(Boolean))].slice(0, 80);
    const attendanceByLiveId = {};

    for (const liveId of liveIds) {
        try {
            const liveRef = db.collection("liveSessions").doc(liveId);
            const liveDoc = await liveRef.get();
            if (!liveDoc.exists) {
                attendanceByLiveId[liveId] = {};
                continue;
            }
            const liveSession = { id: liveDoc.id, ...(liveDoc.data() || {}) };
            const promotionId = cleanString(liveSession.promotionId || "", 180);
            if (!promotionId) {
                attendanceByLiveId[liveId] = {};
                continue;
            }
            const promotionDoc = await db.collection("promotions").doc(promotionId).get();
            if (!promotionDoc.exists) {
                attendanceByLiveId[liveId] = {};
                continue;
            }
            const promotion = { id: promotionDoc.id, ...(promotionDoc.data() || {}) };
            const canAccess = await studentCanJoinLivePromotion(db, caller, promotion);
            if (!canAccess) {
                attendanceByLiveId[liveId] = {};
                continue;
            }
            const attendanceDoc = await liveRef.collection("attendance").doc(caller.uid).get();
            if (!attendanceDoc.exists) {
                attendanceByLiveId[liveId] = {};
            } else {
                const attendance = attendanceDoc.data() || {};
                const ts = (value) => value?.toDate?.()?.toISOString?.() || cleanString(value || "", 120);
                attendanceByLiveId[liveId] = {
                    uid: cleanString(attendance.uid || caller.uid, 180),
                    role: cleanString(attendance.role || "", 80),
                    joinedVia: cleanString(attendance.joinedVia || "", 80),
                    lastTokenIssuedAt: ts(attendance.lastTokenIssuedAt),
                    joinedAt: ts(attendance.joinedAt),
                    replayAccessedAt: ts(attendance.replayAccessedAt),
                    replayWatchedAt: ts(attendance.replayWatchedAt),
                    watchedReplay: attendance.watchedReplay === true,
                    replayRecordingId: cleanString(attendance.replayRecordingId || "", 180)
                };
            }
        } catch (error) {
            console.warn("[SBI Live Attendance] Lecture impossible", liveId, error?.message || error);
            attendanceByLiveId[liveId] = {};
        }
    }

    return { success: true, attendanceByLiveId };
});

// SBI 8.0P.167.269 — Assiduité live agrégée par promotion (admin only, lecture seule).
// Renvoie, pour chaque élève de la promotion, le nb de lives cursus (hors TEST) et
// le nb suivis (présent OU replay vu). 1 requête attendance par live (pas N×M gets).
exports.getPromotionLiveAttendanceBatch = onCall({
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    await requireAdminCaller(request, db);
    const promotionId = cleanString(request.data?.promotionId, 180);
    if (!promotionId) throw new HttpsError("invalid-argument", "Promotion manquante.");

    const livesSnap = await db.collection("liveSessions").where("promotionId", "==", promotionId).get();
    const lives = [];
    livesSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.isTestLive === true || data.testLive === true) return;
        lives.push({ id: docSnap.id });
    });

    const presenceByLive = {};
    for (const live of lives) {
        presenceByLive[live.id] = {};
        try {
            const attSnap = await db.collection("liveSessions").doc(live.id).collection("attendance").get();
            attSnap.forEach((attDoc) => {
                const record = attDoc.data() || {};
                presenceByLive[live.id][attDoc.id] = Boolean(record.joinedAt || record.lastTokenIssuedAt || record.watchedReplay === true);
            });
        } catch (error) {
            console.warn("[SBI Live Attendance Batch] live ignoré", live.id, error?.message || error);
        }
    }

    const roles = ["student", "eleve", "élève", "etudiant", "étudiant"];
    const studentsSnap = await db.collection("users").where("promotionId", "==", promotionId).get();
    const byStudent = {};
    studentsSnap.forEach((studentDoc) => {
        const data = studentDoc.data() || {};
        if (!roles.includes(String(data.role || "").toLowerCase())) return;
        let attended = 0;
        for (const live of lives) {
            if (presenceByLive[live.id] && presenceByLive[live.id][studentDoc.id]) attended += 1;
        }
        byStudent[studentDoc.id] = { liveCount: lives.length, attendedCount: attended };
    });

    return { success: true, liveCount: lives.length, byStudent };
});

// SBI 8.0P.167.269 — Relance email d'un élève en retard (admin only, Brevo).
// OUTWARD-FACING : déclenché manuellement par l'admin, confirmation côté UI,
// rate-limit serveur 1/24h/élève, journalisé. Pas d'envoi de masse.
exports.sendLateStudentReminder = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const data = request.data || {};
    const studentUid = cleanString(data.studentUid, 180);
    const promotionId = cleanString(data.promotionId, 180);
    if (!studentUid) throw new HttpsError("invalid-argument", "Élève manquant.");

    const studentDoc = await db.collection("users").doc(studentUid).get();
    if (!studentDoc.exists) throw new HttpsError("not-found", "Élève introuvable.");
    const student = studentDoc.data() || {};
    const roles = ["student", "eleve", "élève", "etudiant", "étudiant"];
    if (!roles.includes(String(student.role || "").toLowerCase())) {
        throw new HttpsError("failed-precondition", "Le compte ciblé n'est pas un élève.");
    }
    if (student.statut === "suspendu") {
        throw new HttpsError("failed-precondition", "Compte élève suspendu.");
    }
    const email = cleanString(student.email || "", 180);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new HttpsError("failed-precondition", "Adresse email élève invalide.");
    }

    const lastSentMs = student.lateReminderLastSentAt?.toMillis?.() || 0;
    if (lastSentMs && (Date.now() - lastSentMs) < 24 * 60 * 60 * 1000) {
        throw new HttpsError("resource-exhausted", "Une relance a déjà été envoyée à cet élève il y a moins de 24h.");
    }

    const rawCourses = Array.isArray(data.lateCourses) ? data.lateCourses : [];
    const courses = rawCourses
        .map((item) => ({ title: cleanString(item?.title || "", 180), deadline: cleanString(item?.deadline || "", 40) }))
        .filter((item) => item.title)
        .slice(0, 30);
    const lateCount = Number(data.lateCount) || courses.length;

    const listHtml = courses.length
        ? `<ul style="margin:12px 0; padding-left:20px;">${courses.map((c) => `<li>${escapeHtml(c.title)}${c.deadline ? ` — échéance ${escapeHtml(c.deadline)}` : ""}</li>`).join("")}</ul>`
        : "";
    const messageHtml = `
        <p>Nous faisons le point sur ton avancement dans ta formation.</p>
        <p>À ce jour, <strong>${lateCount > 0 ? `${lateCount} cours` : "certains cours"}</strong> de ton cursus sont en retard sur le planning prévu :</p>
        ${listHtml}
        <p>Merci de reprendre ces cours dès que possible pour rester dans les délais. En cas de difficulté, réponds simplement à cet email, nous t'accompagnerons.</p>
    `;
    const textContent = `Bonjour ${student.prenom || ""},\n\nÀ ce jour, ${lateCount > 0 ? lateCount + " cours" : "certains cours"} de ton cursus sont en retard :\n${courses.map((c) => `- ${c.title}${c.deadline ? " (échéance " + c.deadline + ")" : ""}`).join("\n")}\n\nMerci de reprendre ces cours au plus vite.\n\nSport Business Institute`;

    try {
        await sendBrevoTransactionalEmail({
            sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
            to: [{ email, name: `${student.prenom || ""} ${student.nom || ""}`.trim() || email }],
            replyTo: { name: "Sport Business Institute", email: SBI_CONTACT_EMAIL },
            subject: `SBI — point sur ton avancement${lateCount > 0 ? ` (${lateCount} cours à rattraper)` : ""}`,
            htmlContent: renderSbiEmailTemplate({
                prenom: student.prenom || "",
                nomExpediteur: "Le suivi pédagogique SBI",
                posteExpediteur: "Suivi pédagogique",
                preheader: `${lateCount > 0 ? lateCount + " cours" : "Des cours"} à rattraper dans ton cursus.`,
                messageHtml
            }),
            textContent
        }, BREVO_API_KEY.value(), ["sbi_late_reminder"]);
    } catch (error) {
        console.error("[SBI Late Reminder] Brevo erreur :", error?.message || error);
        throw new HttpsError("internal", "L'envoi de l'email a échoué (Brevo). Réessaie plus tard.");
    }

    await studentDoc.ref.update({
        lateReminderLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
        lateReminderCount: admin.firestore.FieldValue.increment(1)
    });

    await safeWriteAccountAuditLog(db, {
        type: "student.late_reminder_sent",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: studentUid,
        targetEmail: email,
        promotionId,
        lateCoursesCount: lateCount,
        reason: `Relance ${lateCount} cours en retard`,
        source: "admin-late-students"
    });

    return { success: true, studentEmail: email, message: `Relance envoyée à ${email}` };
});

exports.resolveLiveReplay = onCall({
    region: "europe-west1",
    secrets: [DAILY_API_KEY],
    timeoutSeconds: 60,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const data = request.data || {};
    const liveId = cleanString(data.liveId, 180);
    if (!liveId) throw new HttpsError("invalid-argument", "Live manquant.");

    const liveRef = db.collection("liveSessions").doc(liveId);
    const liveDoc = await liveRef.get();
    if (!liveDoc.exists) throw new HttpsError("not-found", "Live introuvable.");
    const liveSession = { id: liveDoc.id, ...(liveDoc.data() || {}) };

    const promotionId = cleanString(liveSession.promotionId || "", 180);
    if (!promotionId) throw new HttpsError("failed-precondition", "Promotion live manquante.");
    const promotionDoc = await db.collection("promotions").doc(promotionId).get();
    if (!promotionDoc.exists) throw new HttpsError("not-found", "Promotion introuvable.");
    const promotion = { id: promotionDoc.id, ...(promotionDoc.data() || {}) };

    const canAccess = await studentCanJoinLivePromotion(db, caller, promotion);
    if (!canAccess) throw new HttpsError("permission-denied", "Vous ne pouvez pas consulter ce replay.");

    const apiKey = DAILY_API_KEY.value();
    const roomName = cleanString(liveSession.providerRoomName || liveSession.roomName || liveSession.liveTech?.roomName || getDailyRoomNameFromSession(liveSession), 180);
    if (!roomName) throw new HttpsError("failed-precondition", "Room Daily introuvable pour ce live.");

    const existingRecordingId = cleanString(liveSession.replayRecordingId || liveSession.liveTech?.recordingId || liveSession.liveTech?.recordingInstanceId || "", 180);
    let recordingId = existingRecordingId;
    let recording = null;

    if (recordingId) {
        recording = await callDailyApi(apiKey, `/recordings/${encodeURIComponent(recordingId)}`, { allowNotFound: true });
        if (!recording) recordingId = "";
    }

    if (!recordingId) {
        const result = await callDailyApi(apiKey, `/recordings?room_name=${encodeURIComponent(roomName)}&limit=10`);
        const recordings = Array.isArray(result?.data) ? result.data : [];
        recording = pickDailyRecordingForLive(recordings);
        recordingId = extractDailyRecordingId(recording || {});

        // Fallback : certains enregistrements ne remontent pas via le filtre
        // room_name de Daily (type de recording, indexation differee, casse...).
        // On re-liste les enregistrements recents sans filtre et on matche
        // localement par room_name (insensible a la casse) puis, en dernier
        // recours, par fenetre temporelle du live. On logge l'ecart pour diag.
        if (!recordingId) {
            const fallback = await callDailyApi(apiKey, "/recordings?limit=100");
            const all = Array.isArray(fallback?.data) ? fallback.data : [];
            const target = roomName.trim().toLowerCase();
            const byRoom = all.filter((item) => cleanString(item.room_name || "", 180).trim().toLowerCase() === target);
            let candidate = pickDailyRecordingForLive(byRoom);

            if (!candidate) {
                const startMs = Date.parse(liveSession.selectedStartAt || "");
                const endMs = Date.parse(liveSession.selectedEndAt || "");
                if (Number.isFinite(startMs)) {
                    const lo = Math.floor((startMs - 60 * 60 * 1000) / 1000);
                    const hi = Math.floor(((Number.isFinite(endMs) ? endMs : startMs) + DAILY_ROOM_KEEP_AFTER_MS) / 1000);
                    const byTime = all
                        .filter((item) => {
                            const ts = Number(item.start_ts);
                            return Number.isFinite(ts) && ts >= lo && ts <= hi;
                        })
                        .sort((a, b) => Number(b.start_ts || 0) - Number(a.start_ts || 0));
                    candidate = pickDailyRecordingForLive(byTime);
                }
            }

            if (candidate) {
                recording = candidate;
                recordingId = extractDailyRecordingId(candidate);
            }

            console.log("[SBI Live Replay] recordings fallback", JSON.stringify({
                liveId,
                roomName,
                filteredCount: recordings.length,
                unfilteredCount: all.length,
                unfilteredTotal: Number(fallback?.total_count) || all.length,
                matchedByRoom: byRoom.length,
                resolvedRecordingId: recordingId || null,
                sampleRoomNames: all.slice(0, 20).map((item) => cleanString(item.room_name || "", 180) || null)
            }));
        }
    }

    if (!recordingId) {
        await liveRef.set({
            replayStatus: "processing",
            liveTech: {
                ...(liveSession.liveTech || {}),
                replayStatus: "processing",
                replayResolveLastError: "recording_not_ready",
                replayResolvedAt: new Date().toISOString()
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        throw new HttpsError("failed-precondition", "Replay Daily pas encore disponible. Reessayez dans quelques minutes.");
    }

    const access = await callDailyApi(apiKey, `/recordings/${encodeURIComponent(recordingId)}/access-link?valid_for_secs=3600`);
    const downloadLink = cleanString(access?.download_link || access?.downloadLink || access?.url || "", 4000);
    if (!downloadLink) throw new HttpsError("failed-precondition", "Lien replay Daily indisponible.");

    const durationSeconds = extractDailyRecordingDuration(recording || {});
    const expires = cleanString(access?.expires || access?.expires_at || "", 120);

    await liveRef.set({
        status: liveSession.status === "ended" ? "replay_available" : (liveSession.status || "replay_available"),
        replayStatus: "available",
        replayProvider: "daily",
        replayRecordingId: recordingId,
        replayLastAccessResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        replayAccessExpiresAt: expires,
        liveTech: {
            ...(liveSession.liveTech || {}),
            replayStatus: "available",
            recordingStatus: "ready",
            recordingId,
            recordingDurationSeconds: durationSeconds,
            recordingUpdatedAt: new Date().toISOString()
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await liveRef.collection("attendance").doc(caller.uid).set({
        uid: caller.uid,
        email: cleanEmail(caller.email),
        displayName: getAccountDisplayName(caller.data || {}) || caller.email || "Participant SBI",
        role: isHostLiveRole(caller) ? "host" : "student",
        watchedReplay: true,
        replayWatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        replayAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
        replayRecordingId: recordingId,
        replayAccessExpiresAt: expires,
        provider: "daily",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const replayAccess = await createLiveReplayAccessToken(db, {
        liveId,
        promotionId,
        caller,
        recordingId,
        downloadLink
    });
    const streamUrl = `/api/liveReplay?token=${encodeURIComponent(replayAccess.token)}`;

    await safeWriteAccountAuditLog(db, {
        type: "live.replay_access",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: "",
        targetEmail: "",
        targetRole: "promotion",
        source: "student-lives",
        liveId,
        promotionId,
        changes: { provider: "daily", recordingId, expires, stream: true }
    });

    return {
        success: true,
        liveId,
        recordingId,
        streamUrl,
        replayUrl: streamUrl,
        playbackUrl: streamUrl,
        downloadLink: streamUrl,
        dailyDownloadLink: downloadLink,
        expires,
        durationSeconds
    };
});

exports.streamLiveReplay = onRequest({
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (req, res) => {
    try {
        if (req.method === "OPTIONS") {
            res.set("Access-Control-Allow-Origin", "*");
            res.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
            res.set("Access-Control-Allow-Headers", "Range,Content-Type");
            res.status(204).send("");
            return;
        }

        if (!["GET", "HEAD"].includes(req.method)) {
            res.status(405).send("Method not allowed");
            return;
        }

        const token = cleanString(req.query.token || "", 180);
        if (!token) {
            res.status(400).send("Replay token manquant.");
            return;
        }

        const db = admin.firestore();
        const tokenRef = db.collection("liveReplayAccessTokens").doc(token);
        const tokenDoc = await tokenRef.get();
        if (!tokenDoc.exists) {
            res.status(404).send("Replay introuvable.");
            return;
        }

        const tokenData = tokenDoc.data() || {};
        const expiresAtMs = tokenData.expiresAt?.toMillis?.() || 0;
        if (!expiresAtMs || expiresAtMs < Date.now()) {
            res.status(410).send("Lien replay expire. Retournez sur Mes lives puis cliquez Regarder.");
            return;
        }

        const downloadLink = cleanString(tokenData.downloadLink || "", 8000);
        if (!downloadLink) {
            res.status(404).send("Lien replay indisponible.");
            return;
        }

        await tokenRef.set({
            lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
            useCount: admin.firestore.FieldValue.increment(1)
        }, { merge: true });

        const headers = {};
        if (req.headers.range) headers.Range = req.headers.range;
        const upstream = await fetch(downloadLink, { headers });
        if (!upstream.ok && upstream.status !== 206) {
            const text = await upstream.text().catch(() => "");
            res.status(upstream.status || 502).send(text || "Replay Daily indisponible.");
            return;
        }

        res.status(upstream.status === 206 ? 206 : 200);
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
        res.set("Cache-Control", "private, no-store, max-age=0");
        res.set("Content-Type", upstream.headers.get("content-type") || "video/mp4");
        res.set("Content-Disposition", `inline; filename="sbi-live-replay-${cleanString(tokenData.liveId || "live", 80)}.mp4"`);
        ["content-length", "content-range"].forEach((name) => {
            const value = upstream.headers.get(name);
            if (value) res.set(name, value);
        });

        if (req.method === "HEAD") {
            res.end();
            return;
        }

        if (upstream.body && Readable.fromWeb) {
            Readable.fromWeb(upstream.body).pipe(res);
            return;
        }

        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.end(buffer);
    } catch (error) {
        console.error("[SBI Live Replay] Streaming impossible :", error);
        if (!res.headersSent) res.status(500).send("Streaming replay impossible.");
        else res.end();
    }
});

exports.getLiveSchedulerData = onCall({
    region: "europe-west1",
    timeoutSeconds: 60,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const callerRole = normalizeLiveRole(caller.data.role || "");
    const requestedRole = normalizeLiveRole(request.data?.role || "");
    const wantsStudentScope = requestedRole === "student" || callerRole === "student";

    if (!caller.isAdmin && callerRole !== "teacher" && callerRole !== "student") {
        throw new HttpsError("permission-denied", "Acces live reserve aux comptes autorises.");
    }

    const promotions = [];
    const seenPromotionIds = new Set();

    if (wantsStudentScope && !caller.isAdmin && callerRole !== "teacher") {
        const promotionIds = collectCallerPromotionKeys(caller.data || {});
        for (const promotionId of promotionIds) {
            if (!promotionId || seenPromotionIds.has(promotionId)) continue;
            const promotionDoc = await db.collection("promotions").doc(promotionId).get();
            if (!promotionDoc.exists) continue;
            const promotion = { id: promotionDoc.id, ...(promotionDoc.data() || {}) };
            if (!await studentCanJoinLivePromotion(db, caller, promotion)) continue;
            seenPromotionIds.add(promotion.id);
            promotions.push(sanitizeLivePromotionForScheduler(promotion));
        }
    } else {
        const snap = await db.collection("promotions").get();
        for (const docSnap of snap.docs) {
            const promotion = { id: docSnap.id, ...(docSnap.data() || {}) };
            const canManage = await teacherCanManagePromotionLive(db, caller, promotion);
            if (!canManage || seenPromotionIds.has(promotion.id)) continue;
            seenPromotionIds.add(promotion.id);
            promotions.push(sanitizeLivePromotionForScheduler(promotion));
        }
    }

    promotions.sort((a, b) => getPromotionDisplayName(a).localeCompare(getPromotionDisplayName(b), "fr", { sensitivity: "base" }));
    const sessions = await loadLiveSessionsForScheduler(db, promotions.map((promotion) => promotion.id));
    const templates = await loadLiveSchedulerTemplates(db, promotions);

    return {
        promotions,
        sessions,
        templates,
        count: promotions.length,
        scope: wantsStudentScope ? "student" : "manager"
    };
});

exports.scheduleLiveSession = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY, DAILY_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const data = request.data || {};
    const promotionId = cleanString(data.promotionId, 180);
    if (!promotionId) throw new HttpsError("invalid-argument", "Promotion manquante.");

    const promotionRef = db.collection("promotions").doc(promotionId);
    const promotionDoc = await promotionRef.get();
    if (!promotionDoc.exists) throw new HttpsError("not-found", "Promotion introuvable.");
    const promotion = { id: promotionDoc.id, ...(promotionDoc.data() || {}) };

    const canManage = await teacherCanManagePromotionLive(db, caller, promotion);
    if (!canManage) throw new HttpsError("permission-denied", "Vous ne pouvez pas planifier les lives de cette promotion.");

    const sourceItemId = cleanString(data.sourceItemId || data.liveId || "", 180);
    const requestedTitle = cleanString(data.title || "", 180);
    const liveItem = findPromotionLiveItem(promotion, {
        liveId: data.liveId,
        sourceItemId,
        title: requestedTitle
    });
    const coursePlanLiveItem = findPromotionCoursePlanLiveItem(promotion, {
        liveId: data.liveId,
        sourceItemId,
        title: requestedTitle
    });
    const isTestLive = isLiveTestRequest({
        liveId: data.liveId,
        sourceItemId,
        type: data.type,
        liveItem
    });
    const openNow = data.openNow === true || data.openTest === true || (isTestLive && data.notifyStudents === true);
    const liveKey = cleanString(liveItem?.id || liveItem?.itemId || sourceItemId || data.liveId || requestedTitle || (isTestLive ? "sbi-live-test" : "live"), 180);
    const liveId = makeLiveSessionId(promotionId, liveKey);
    const startInput = cleanString(data.selectedStartAt || data.startAt || data.selectedLiveAt || "", 80);
    const selectedStartAt = normalizeLiveIso(startInput || (isTestLive || openNow ? new Date().toISOString() : ""), "Date de debut");
    const endInput = cleanString(data.selectedEndAt || data.endAt || data.selectedLiveEndAt || "", 80);
    const selectedEndAt = endInput
        ? normalizeLiveIso(endInput, "Date de fin")
        : new Date(Date.parse(selectedStartAt) + 60 * 60 * 1000).toISOString();

    if (Date.parse(selectedEndAt) <= Date.parse(selectedStartAt)) {
        throw new HttpsError("invalid-argument", "La fin du live doit etre apres le debut.");
    }

    const reportRequested = data.report === true || cleanString(data.planificationMode || data.mode || "", 40).toLowerCase() === "report";
    const windowStart = cleanString(liveItem?.teacherSchedulingWindowStartAt || liveItem?.schedulingWindow?.teacherCanSelectFrom || liveItem?.schedulingWindow?.recommendedStartAt || coursePlanLiveItem?.teacherSchedulingWindowStartAt || coursePlanLiveItem?.liveTracking?.schedulingWindow?.teacherCanSelectFrom || coursePlanLiveItem?.liveTracking?.schedulingWindow?.recommendedStartAt || "", 80);
    const windowEnd = cleanString(liveItem?.teacherSchedulingWindowEndAt || liveItem?.schedulingWindow?.teacherCanSelectUntil || liveItem?.schedulingWindow?.recommendedEndAt || coursePlanLiveItem?.teacherSchedulingWindowEndAt || coursePlanLiveItem?.liveTracking?.schedulingWindow?.teacherCanSelectUntil || coursePlanLiveItem?.liveTracking?.schedulingWindow?.recommendedEndAt || "", 80);
    if (!caller.isAdmin && !reportRequested && (windowStart || windowEnd) && !liveDateInWindow(selectedStartAt, windowStart, windowEnd)) {
        throw new HttpsError("failed-precondition", "Le creneau choisi sort de la plage prevue pour ce live. Utilisez le mode report si vous devez depasser la periode.");
    }

    const promotionName = getPromotionDisplayName(promotion);
    const title = requestedTitle || coursePlanLiveItem?.title || coursePlanLiveItem?.courseTitle || coursePlanLiveItem?.liveTracking?.title || liveItem?.title || liveItem?.courseTitle || "Live SBI";
    const sessionPayload = {
        id: liveId,
        title,
        promotionId,
        promotionName,
        formationId: cleanString(promotion.formationId || liveItem?.formationId || "", 180),
        formationName: cleanString(promotion.formationName || promotion.formationTitle || "", 180),
        sourceItemId: sourceItemId || cleanString(liveItem?.id || liveItem?.itemId || (isTestLive ? "sbi-live-test" : ""), 180),
        sourceType: isTestLive ? "live_test" : cleanString(liveItem?.type || data.type || "live_session", 80),
        isTestLive,
        selectedStartAt,
        selectedEndAt,
        status: openNow ? "live" : "scheduled",
        report: reportRequested,
        schedulingStatus: openNow ? "live" : reportRequested ? "report" : "scheduled",
        provider: cleanString(data.provider || (isTestLive || openNow ? "daily" : "pending_provider"), 80),
        roomName: cleanString(data.roomName || "", 180),
        meetingUrl: cleanString(data.meetingUrl || "", 500),
        teacherUid: cleanString(data.teacherUid || caller.uid, 180),
        selectedByUid: caller.uid,
        selectedByEmail: caller.email,
        scheduledAt: admin.firestore.FieldValue.serverTimestamp(),
        openedAt: openNow ? admin.firestore.FieldValue.serverTimestamp() : null,
        startedAt: openNow ? admin.firestore.FieldValue.serverTimestamp() : null,
        openedByUid: openNow ? caller.uid : "",
        startedByUid: openNow ? caller.uid : "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        liveTech: {
            provider: cleanString(data.provider || (isTestLive || openNow ? "daily" : "pending_provider"), 80),
            captureProtection: "moving_student_watermark",
            chatEnabled: true,
            fileSharingEnabled: true,
            replayStatus: "not_available"
        }
    };

    const liveRef = db.collection("liveSessions").doc(liveId);
    const previousLive = await liveRef.get();
    await liveRef.set({
        ...sessionPayload,
        createdAt: previousLive.exists ? previousLive.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    let openedRoom = null;
    if (openNow) {
        openedRoom = await ensureDailyRoomForLive({
            apiKey: DAILY_API_KEY.value(),
            liveRef,
            liveSession: { ...sessionPayload, id: liveId },
            caller,
            allowCreate: true
        });
        await liveRef.set({
            status: "live",
            schedulingStatus: "live",
            providerReady: true,
            providerRoomName: openedRoom?.name || "",
            providerRoomUrl: openedRoom?.url || "",
            roomName: openedRoom?.name || "",
            meetingUrl: openedRoom?.url || sessionPayload.meetingUrl || "",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    const livePlanning = Array.isArray(promotion.livePlanning) ? [...promotion.livePlanning] : [];
    const itemIndex = livePlanning.findIndex((item) => item === liveItem);
    const shouldNotifyStudents = (!isTestLive || data.notifyStudents === true || openNow) && data.skipNotifications !== true && data.notifyStudents !== false;
    const nextLiveItem = {
        ...(liveItem || {}),
        id: liveItem?.id || sourceItemId || (isTestLive ? "sbi-live-test" : liveId),
        itemId: liveItem?.itemId || sourceItemId || (isTestLive ? "sbi-live-test" : ""),
        sourceItemId: sourceItemId || cleanString(liveItem?.sourceItemId || liveItem?.id || liveItem?.itemId || (isTestLive ? "sbi-live-test" : ""), 180),
        type: isTestLive ? "live_test" : cleanString(liveItem?.type || data.type || "live_session", 80),
        isTestLive,
        testLive: isTestLive,
        title,
        liveSessionId: liveId,
        status: openNow ? "live" : "scheduled",
        reportOutsideWindow: reportRequested,
        liveSchedulingStatus: openNow ? "live" : reportRequested ? "report" : "scheduled",
        teacherSelectionStatus: openNow ? "started" : reportRequested ? "reported" : "selected",
        studentScheduleStatus: openNow ? "live" : "scheduled",
        notificationStatus: shouldNotifyStudents ? "pending_student_update" : "not_notified",
        selectedLiveAt: selectedStartAt,
        selectedLiveEndAt: selectedEndAt,
        providerReady: openNow ? true : Boolean(liveItem?.providerReady),
        providerRoomName: openedRoom?.name || liveItem?.providerRoomName || "",
        providerRoomUrl: openedRoom?.url || liveItem?.providerRoomUrl || "",
        meetingUrl: openedRoom?.url || liveItem?.meetingUrl || "",
        openedAt: openNow ? new Date().toISOString() : liveItem?.openedAt || "",
        startedAt: openNow ? new Date().toISOString() : liveItem?.startedAt || "",
        selectedByUid: caller.uid,
        selectedByEmail: caller.email,
        selectedAt: new Date().toISOString()
    };
    if (itemIndex >= 0) livePlanning[itemIndex] = nextLiveItem;
    else livePlanning.push(nextLiveItem);

    await promotionRef.set({
        livePlanning,
        livePlanningUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        livePlanningUpdatedBy: caller.uid
    }, { merge: true });

    const report = shouldNotifyStudents
        ? await notifyPromotionStudentsForLive({
            db,
            promotion,
            liveSession: sessionPayload,
            kind: isTestLive && openNow ? "test_started" : reportRequested ? "reported" : "scheduled",
            apiKey: BREVO_API_KEY.value()
        })
        : { students: 0, notified: 0, emailsSent: 0, emailsFailed: 0, skipped: true, reason: isTestLive ? "test_live" : "notifications_disabled" };

    await safeWriteAccountAuditLog(db, {
        type: "live.scheduled",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: "",
        targetEmail: "",
        targetRole: "promotion",
        source: caller.isAdmin ? "admin-live" : "teacher-live",
        liveId,
        promotionId,
        changes: {
            selectedStartAt,
            selectedEndAt,
            title,
            isTestLive,
            reportRequested,
            report
        }
    });

    return {
        success: true,
        liveId,
        message: isTestLive && openNow ? "Salle test ouverte et notifications lancees." : reportRequested ? "Live programme en report et notifications lancees." : "Live programme et notifications lancees.",
        report,
        reportRequested,
        openNow,
        roomUrl: openedRoom?.url || ""
    };
});

exports.notifyLiveStarted = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const liveId = cleanString(request.data?.liveId, 180);
    if (!liveId) throw new HttpsError("invalid-argument", "Live manquant.");

    const liveRef = db.collection("liveSessions").doc(liveId);
    const liveDoc = await liveRef.get();
    if (!liveDoc.exists) throw new HttpsError("not-found", "Live introuvable.");
    const liveSession = { id: liveDoc.id, ...(liveDoc.data() || {}) };

    const promotionDoc = await db.collection("promotions").doc(cleanString(liveSession.promotionId, 180)).get();
    if (!promotionDoc.exists) throw new HttpsError("not-found", "Promotion introuvable.");
    const promotion = { id: promotionDoc.id, ...(promotionDoc.data() || {}) };

    const canManage = await teacherCanManagePromotionLive(db, caller, promotion);
    if (!canManage) throw new HttpsError("permission-denied", "Vous ne pouvez pas demarrer ce live.");

    await liveRef.set({
        status: "live",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        startedByUid: caller.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const report = await notifyPromotionStudentsForLive({
        db,
        promotion,
        liveSession,
        kind: "started",
        apiKey: BREVO_API_KEY.value()
    });

    await safeWriteAccountAuditLog(db, {
        type: "live.started",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: "",
        targetEmail: "",
        targetRole: "promotion",
        source: caller.isAdmin ? "admin-live" : "teacher-live",
        liveId,
        promotionId: liveSession.promotionId || "",
        changes: { report }
    });

    return {
        success: true,
        message: "Notification de demarrage envoyee.",
        report
    };
});



function getCourseWorkflowTitle(courseData = {}) {
    return cleanString(courseData.titre || courseData.title || "Cours sans titre", 180);
}

function getCourseWorkflowUrl(path, courseId = "") {
    const query = courseId ? `?id=${encodeURIComponent(courseId)}` : "";
    return `${SBI_SITE_URL}${path}${query}`;
}

function collectCleanStringIds(value, output = new Set()) {
    if (value === null || value === undefined) return output;

    if (typeof value === "string" || typeof value === "number") {
        const cleaned = cleanString(value, 180);
        if (cleaned) output.add(cleaned);
        return output;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectCleanStringIds(item, output));
        return output;
    }

    if (typeof value === "object") {
        [
            "uid",
            "id",
            "studentId",
            "studentUid",
            "studentUID",
            "userId",
            "accountId",
            "eleveId",
            "eleveUid",
            "learnerId"
        ].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                collectCleanStringIds(value[key], output);
            }
        });
    }

    return output;
}

function collectCleanEmails(value, output = new Set()) {
    if (value === null || value === undefined) return output;

    if (typeof value === "string") {
        const email = cleanEmail(value);
        if (isValidEmail(email)) output.add(email);
        return output;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectCleanEmails(item, output));
        return output;
    }

    if (typeof value === "object") {
        ["email", "mail", "studentEmail", "userEmail"].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(value, key)) collectCleanEmails(value[key], output);
        });
    }

    return output;
}

function getCoursePlanItemsFromPromotion(promotionData = {}) {
    const items = [];
    [
        promotionData.coursePlan,
        promotionData.coursePlans,
        promotionData.plan,
        promotionData.planning,
        promotionData.curriculumItems,
        promotionData.items,
        promotionData.modules
    ].forEach((value) => {
        if (Array.isArray(value)) items.push(...value);
    });
    return items.filter((item) => item && typeof item === "object");
}

function getCourseIdCandidatesFromPlanItem(item = {}) {
    const ids = new Set();
    [
        item.courseId,
        item.courseID,
        item.courseDocId,
        item.courseRef,
        item.linkedCourseId,
        item.realCourseId,
        item.replacementCourseId,
        item.targetCourseId,
        item.publishedCourseId,
        item.id
    ].forEach((value) => collectCleanStringIds(value, ids));
    return Array.from(ids);
}

function getCoursePlanCourseId(item = {}) {
    const ids = getCourseIdCandidatesFromPlanItem(item);
    if (ids.length) return ids[0];
    return cleanString(
        item.course?.id
        || item.course?.courseId
        || item.course?.docId
        || "",
        180
    );
}

function normalizeCourseWorkflowMatchText(value = "") {
    return cleanString(value || "", 240)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function isCoursePlanPlaceholderReplacement(item = {}, courseId = "") {
    if (!item) return false;

    const itemCourseId = getCoursePlanCourseId(item);
    if (courseId && itemCourseId && itemCourseId !== courseId) return false;

    const source = [
        item.source,
        item.replacementSource,
        item.replacementUpdatedBy,
        item.coursePlanSource,
        item.syncSource
    ].map((value) => cleanString(value || "", 140)).join(" ").toLowerCase();

    return Boolean(item.replacedPlaceholderId || item.fromPlaceholderReplacement || item.placeholderId)
        || source.includes("placeholder-replace")
        || source.includes("placeholder-replaced");
}

function isCoursePlanItemLinkedToPublishedCourse(item = {}, courseId = "", courseData = {}) {
    if (!item || !courseId) return false;

    const itemCourseId = getCoursePlanCourseId(item);
    if (itemCourseId) return itemCourseId === courseId;

    // Dernier filet de sécurité : certains anciens plans n'ont pas conservé
    // l'ID du cours après remplacement, mais gardent le titre exact. On ne
    // l'utilise que pour des items pédagogiques explicites afin d'éviter les
    // faux positifs.
    const itemTitle = normalizeCourseWorkflowMatchText(item.courseTitle || item.title || item.label || "");
    const courseTitle = normalizeCourseWorkflowMatchText(courseData.titre || courseData.title || "");
    if (!itemTitle || !courseTitle || itemTitle !== courseTitle) return false;

    const type = cleanString(item.type || item.itemType || "", 80).toLowerCase();
    const layer = cleanString(item.layer || "", 80).toLowerCase();
    return ["course", "real_course", "published_course", "placeholder_course"].includes(type)
        || layer === "courses"
        || isCoursePlanPlaceholderReplacement(item, courseId);
}

function getCourseWorkflowFormationLabels(courseData = {}) {
    return [
        ...(Array.isArray(courseData.targetFormationTitles) ? courseData.targetFormationTitles : []),
        ...(Array.isArray(courseData.formations) ? courseData.formations : []),
        ...(Array.isArray(courseData.formationIds) ? courseData.formationIds : [])
    ].map((item) => cleanString(item, 120)).filter(Boolean).slice(0, 8);
}

function normalizeCourseBlockKey(value = "", maxLength = 90) {
    const normalized = cleanString(value, 180)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, maxLength);
    return normalized || "bloc";
}

function collectCourseFormationIds(courseData = {}) {
    const ids = new Set();
    [
        courseData.targetFormationIds,
        courseData.formationIds,
        courseData.formations
    ].forEach((value) => collectCleanStringIds(value, ids));
    return Array.from(ids).slice(0, 30);
}

function getCourseBlockDocId(formationId = "", titleKey = "") {
    const formationKey = normalizeCourseBlockKey(formationId || "global", 80);
    const blockKey = normalizeCourseBlockKey(titleKey || "bloc", 90);
    return `${formationKey}_${blockKey}`.slice(0, 180);
}

async function syncCourseBlockReferences(db, { courseId, courseData = {}, caller = {} }) {
    const blockTitle = cleanString(courseData.bloc || courseData.blockTitle || courseData.blockName || "", 180);
    if (!blockTitle) {
        return { success: true, skipped: true, reason: "empty-block-title", synced: 0 };
    }

    const titleKey = normalizeCourseBlockKey(blockTitle);
    const formationIds = collectCourseFormationIds(courseData);
    const formationTitles = Array.isArray(courseData.targetFormationTitles)
        ? courseData.targetFormationTitles.map((value) => cleanString(value, 180))
        : [];
    const authorId = cleanString(courseData.auteurId || caller.uid || "", 180);
    const courseTitle = getCourseWorkflowTitle(courseData);
    const targets = formationIds.length
        ? formationIds.map((formationId, index) => ({
            formationId,
            formationIds: [formationId],
            formationTitle: formationTitles[index] || ""
        }))
        : [{
            formationId: "",
            formationIds: [],
            formationTitle: ""
        }];

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    targets.forEach((target) => {
        const docId = getCourseBlockDocId(target.formationId || "global", titleKey);
        const ref = db.collection("courseBlocks").doc(docId);
        batch.set(ref, {
            title: blockTitle,
            blockTitle,
            titleKey,
            formationId: target.formationId,
            formationIds: target.formationIds,
            formationTitle: target.formationTitle,
            courseIds: admin.firestore.FieldValue.arrayUnion(courseId),
            authorIds: authorId ? admin.firestore.FieldValue.arrayUnion(authorId) : admin.firestore.FieldValue.arrayUnion(caller.uid || "unknown"),
            lastCourseId: courseId,
            lastCourseTitle: courseTitle,
            updatedAt: now,
            createdAt: now,
            source: "course-editor-v2",
            schemaVersion: "course-block-reference-v1"
        }, { merge: true });
    });

    await batch.commit();

    return {
        success: true,
        skipped: false,
        title: blockTitle,
        titleKey,
        synced: targets.length,
        formationIds
    };
}

function buildCourseWorkflowEmailHtml({ preheader, messageHtml, prenom = "équipe SBI" }) {
    return renderSbiEmailTemplate({
        prenom,
        nomExpediteur: "Sport Business Institute",
        posteExpediteur: "Plateforme pédagogique",
        preheader,
        messageHtml
    });
}

async function sendCourseInternalEmail({ eventLabel, courseId, courseData, actor = {}, apiKey }) {
    const title = getCourseWorkflowTitle(courseData);
    const adminUrl = getCourseWorkflowUrl("/admin/course-editor.html", courseId);
    const formationLabels = getCourseWorkflowFormationLabels(courseData).join(", ") || "Non renseigné";
    const authorName = cleanString(courseData.authorName || courseData.auteurName || "", 180) || "Professeur";

    return sendBrevoEmail({
        sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
        to: [{ email: SBI_CONTACT_EMAIL, name: "Sport Business Institute" }],
        replyTo: {
            email: isValidEmail(actor.email) ? actor.email : SBI_CONTACT_EMAIL,
            name: actor.name || "Plateforme SBI"
        },
        subject: `SBI Cours - ${eventLabel} - ${title}`,
        htmlContent: buildCourseWorkflowEmailHtml({
            preheader: `Cours SBI - ${eventLabel}`,
            messageHtml: `
                <p style="margin:0 0 16px 0;">Une action est à suivre sur un cours SBI.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #dce4f2;border-radius:12px;overflow:hidden;background:#f7f9fd;">
                    <tr><td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#0051ff;font-weight:bold;width:38%;">Action</td><td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#253047;">${escapeHtml(eventLabel)}</td></tr>
                    <tr><td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#0051ff;font-weight:bold;">Cours</td><td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#253047;">${escapeHtml(title)}</td></tr>
                    <tr><td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#0051ff;font-weight:bold;">Auteur</td><td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#253047;">${escapeHtml(authorName)}</td></tr>
                    <tr><td style="padding:10px 12px;color:#0051ff;font-weight:bold;">Formation(s)</td><td style="padding:10px 12px;color:#253047;">${escapeHtml(formationLabels)}</td></tr>
                </table>
                ${buildActionButtonHtml(adminUrl, "Ouvrir le cours dans l'admin")}
            `
        }),
        textContent: [
            `SBI Cours - ${eventLabel}`,
            "",
            `Cours : ${title}`,
            `Auteur : ${authorName}`,
            `Formations : ${formationLabels}`,
            `Lien admin : ${adminUrl}`
        ].join("\n")
    }, apiKey);
}

async function sendCourseTeacherStatusEmail({ teacher, courseId, courseData, status, apiKey }) {
    const teacherEmail = cleanEmail(teacher.email || "");
    if (!isValidEmail(teacherEmail)) throw new Error("Email professeur invalide ou manquant.");

    const title = getCourseWorkflowTitle(courseData);
    const isPublished = status === "published";
    const teacherUrl = getCourseWorkflowUrl(isPublished ? "/teacher/mes-cours.html" : "/teacher/course-editor.html", isPublished ? "" : courseId);

    return sendBrevoEmail({
        sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
        to: [{ email: teacherEmail, name: getAccountDisplayName(teacher) }],
        replyTo: { email: SBI_CONTACT_EMAIL, name: "Sport Business Institute" },
        subject: isPublished ? `SBI - Votre cours est en ligne : ${title}` : `SBI - Votre cours est à corriger : ${title}`,
        htmlContent: buildCourseWorkflowEmailHtml({
            prenom: teacher.prenom || "",
            preheader: isPublished ? "Votre cours SBI a été validé et mis en ligne." : "Votre cours SBI nécessite des modifications.",
            messageHtml: isPublished
                ? `
                    <p style="margin:0 0 16px 0;">Votre cours <strong>${escapeHtml(title)}</strong> a été validé par l'administration SBI et mis en ligne.</p>
                    <p style="margin:0 0 16px 0;">Les publics concernés pourront y accéder selon leur programme et leurs droits de formation.</p>
                    ${buildActionButtonHtml(teacherUrl, "Voir mes cours")}
                `
                : `
                    <p style="margin:0 0 16px 0;">Votre cours <strong>${escapeHtml(title)}</strong> a été refusé pour le moment.</p>
                    <p style="margin:0 0 16px 0;">Il est de nouveau modifiable dans votre espace professeur pour correction, puis nouvelle soumission.</p>
                    ${buildActionButtonHtml(teacherUrl, "Corriger le cours")}
                `
        }),
        textContent: isPublished
            ? `Votre cours "${title}" a été validé et mis en ligne.\n${teacherUrl}`
            : `Votre cours "${title}" nécessite des modifications.\n${teacherUrl}`
    }, apiKey);
}

async function sendStudentNewCourseEmail({ student, courseId, courseData, promotion, apiKey }) {
    const studentEmail = cleanEmail(student.email || student.mail || student.emailAddress || "");
    if (!isValidEmail(studentEmail)) throw new Error("Email élève invalide ou manquant.");

    const title = getCourseWorkflowTitle(courseData);
    const courseUrl = getCourseWorkflowUrl("/student/cours-viewer.html", courseId);
    const promotionName = cleanString(promotion.name || promotion.promotionName || "votre promotion", 140);

    return sendBrevoEmail({
        sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
        to: [{ email: studentEmail, name: getAccountDisplayName(student) }],
        replyTo: { email: SBI_CONTACT_EMAIL, name: "Sport Business Institute" },
        subject: `SBI - Nouveau cours disponible : ${title}`,
        htmlContent: buildCourseWorkflowEmailHtml({
            prenom: student.prenom || "",
            preheader: "Un nouveau cours est disponible dans votre programme SBI.",
            messageHtml: `
                <p style="margin:0 0 16px 0;">Un nouveau cours vient d'être ajouté à votre programme de formation.</p>
                <p style="margin:0 0 16px 0;"><strong>Cours :</strong> ${escapeHtml(title)}</p>
                <p style="margin:0 0 16px 0;"><strong>Promotion :</strong> ${escapeHtml(promotionName)}</p>
                ${buildActionButtonHtml(courseUrl, "Ouvrir le cours")}
            `
        }),
        textContent: `Nouveau cours disponible : ${title}\nPromotion : ${promotionName}\nLien : ${courseUrl}`
    }, apiKey);
}

async function resolveCourseValidationNotificationsServer(db, courseId, actorUid = "") {
    const snap = await db.collection("notifications")
        .where("type", "==", "course_validation")
        .where("courseId", "==", courseId)
        .get();

    if (snap.empty) return 0;
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    snap.forEach((docSnap) => {
        batch.set(docSnap.ref, {
            status: "resolved",
            resolvedAt: now,
            resolvedBy: actorUid || ""
        }, { merge: true });
    });
    await batch.commit();
    return snap.size;
}

async function createCourseValidationNotification(db, { courseId, courseData, caller }) {
    const title = getCourseWorkflowTitle(courseData);
    const notificationRef = db.collection("notifications").doc(`course_validation_${courseId}`);
    await notificationRef.set({
        type: "course_validation",
        courseId,
        courseTitle: title,
        auteurId: courseData.auteurId || caller.uid,
        auteurName: courseData.authorName || caller.name || "Professeur",
        status: "open",
        dateCreation: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        dismissedBy: [],
        resolvedAt: admin.firestore.FieldValue.delete(),
        resolvedBy: admin.firestore.FieldValue.delete()
    }, { merge: true });
}

async function addDirectCourseNotification(db, notificationId, payload) {
    await db.collection("notifications").doc(notificationId).set({
        ...payload,
        status: payload.status || "open",
        dateCreation: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        dismissedBy: [],
        resolvedAt: admin.firestore.FieldValue.delete(),
        resolvedBy: admin.firestore.FieldValue.delete()
    }, { merge: true });
}

function isStudentNotificationProfile(data = {}) {
    const role = cleanString(data.role || "", 80).toLowerCase();
    if (!role) return true;
    return ![
        "admin",
        "god",
        "superadmin",
        "teacher",
        "prof",
        "professeur",
        "enseignant"
    ].includes(role);
}

function isStudentAccountForCourseNotification(data = {}) {
    if (!data) return false;
    const statut = cleanString(data.statut || data.status || "", 80).toLowerCase();
    if (["suspendu", "suspended", "archived", "archive"].includes(statut)) return false;

    const role = cleanString(data.role || "", 80).toLowerCase();
    if (!role) return true;
    return ![
        "admin",
        "god",
        "superadmin",
        "teacher",
        "prof",
        "professeur",
        "enseignant"
    ].includes(role);
}

function addStudentIdFromValue(ids, value) {
    if (!value) return;
    if (typeof value === "string") {
        const id = cleanString(value, 180);
        if (id) ids.add(id);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry) => addStudentIdFromValue(ids, entry));
        return;
    }
    if (typeof value === "object") {
        const id = cleanString(value.id || value.uid || value.studentId || value.studentUid || value.studentUID || value.userId || value.accountId || value.eleveId || value.eleveUid || value.learnerId || "", 180);
        if (id) ids.add(id);
    }
}

function collectPromotionStudentIds(promotionData = {}) {
    const ids = new Set();
    [
        promotionData.studentIds,
        promotionData.students,
        promotionData.studentUids,
        promotionData.studentUIDs,
        promotionData.studentUidList,
        promotionData.eleveIds,
        promotionData.eleves,
        promotionData.elevesIds,
        promotionData.apprenants,
        promotionData.apprenantIds,
        promotionData.learners,
        promotionData.learnerIds,
        promotionData.roster,
        promotionData.targetStudents
    ].forEach((value) => addStudentIdFromValue(ids, value));
    return Array.from(ids);
}

function collectPromotionStudentEmails(promotionData = {}) {
    const emails = new Set();
    [
        promotionData.studentEmails,
        promotionData.students,
        promotionData.eleves,
        promotionData.apprenants,
        promotionData.learners,
        promotionData.roster
    ].forEach((value) => collectCleanEmails(value, emails));
    return Array.from(emails);
}

async function addStudentById(db, students, studentId = "") {
    const safeId = cleanString(studentId, 180);
    if (!safeId || students.has(safeId)) return;

    try {
        const snap = await db.collection("users").doc(safeId).get();
        if (!snap.exists) return;
        const data = snap.data() || {};
        if (!isStudentAccountForCourseNotification(data)) return;
        students.set(snap.id, { id: snap.id, ...data });
    } catch (error) {
        console.error("Lecture élève promotion par ID impossible :", safeId, error.message || error);
    }
}

async function listPromotionStudents(db, promotion = "") {
    const promotionId = cleanString(typeof promotion === "string" ? promotion : promotion?.id || "", 180);
    const promotionData = promotion && typeof promotion === "object" ? promotion : {};
    if (!promotionId) return [];

    const students = new Map();
    const queries = [
        db.collection("users").where("promotionId", "==", promotionId),
        db.collection("users").where("currentPromotionId", "==", promotionId),
        db.collection("users").where("assignedPromotionId", "==", promotionId),
        db.collection("users").where("cohortId", "==", promotionId),
        db.collection("users").where("promotionIds", "array-contains", promotionId),
        db.collection("users").where("assignedPromotionIds", "array-contains", promotionId)
    ];

    for (const queryRef of queries) {
        try {
            const snap = await queryRef.get();
            snap.forEach((docSnap) => {
                const data = docSnap.data() || {};
                if (!isStudentAccountForCourseNotification(data)) return;
                students.set(docSnap.id, { id: docSnap.id, ...data });
            });
        } catch (error) {
            console.error("Lecture élèves promotion impossible :", promotionId, error.message || error);
        }
    }

    for (const studentId of collectPromotionStudentIds(promotionData)) {
        await addStudentById(db, students, studentId);
    }

    for (const email of collectPromotionStudentEmails(promotionData)) {
        try {
            const snap = await db.collection("users").where("email", "==", email).limit(3).get();
            snap.forEach((docSnap) => {
                const data = docSnap.data() || {};
                if (!isStudentAccountForCourseNotification(data)) return;
                students.set(docSnap.id, { id: docSnap.id, ...data });
            });
        } catch (error) {
            console.error("Lecture élève promotion par email impossible :", promotionId, email, error.message || error);
        }
    }

    return Array.from(students.values());
}

async function loadCurriculumTemplateForPromotion(db, promotion = {}, cache = new Map()) {
    const templateId = cleanString(promotion.curriculumTemplateId || promotion.templateId || "", 180);
    if (!templateId) return null;
    if (cache.has(templateId)) return cache.get(templateId);

    try {
        const snap = await db.collection("curriculumTemplates").doc(templateId).get();
        const template = snap.exists ? { id: snap.id, ...(snap.data() || {}) } : null;
        cache.set(templateId, template);
        return template;
    } catch (error) {
        console.error("Lecture curriculumTemplate impossible :", templateId, error.message || error);
        cache.set(templateId, null);
        return null;
    }
}

function findLinkedItemsInList(items = [], courseId = "", courseData = {}) {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => isCoursePlanItemLinkedToPublishedCourse(item, courseId, courseData));
}

async function findPromotionTargetsForCourse(db, { courseId, courseData, promotionIds = [] }) {
    const allowedPromotionIds = new Set((Array.isArray(promotionIds) ? promotionIds : [])
        .map((value) => cleanString(value, 180))
        .filter(Boolean));
    const snap = await db.collection("promotions").get();
    const templateCache = new Map();
    const targets = [];

    for (const docSnap of snap.docs) {
        if (allowedPromotionIds.size && !allowedPromotionIds.has(docSnap.id)) continue;
        const data = docSnap.data() || {};
        const status = cleanString(data.status || "active", 40).toLowerCase();
        if (["archived", "archive", "archivée", "archived_promotion"].includes(status)) continue;

        const promotion = { id: docSnap.id, ...data };
        const coursePlanMatches = findLinkedItemsInList(getCoursePlanItemsFromPromotion(data), courseId, courseData);
        if (coursePlanMatches.length) {
            targets.push({
                promotion,
                reason: coursePlanMatches.some((item) => isCoursePlanPlaceholderReplacement(item, courseId))
                    ? "course_plan_placeholder_replacement"
                    : "course_plan_contains_course",
                matchedItems: coursePlanMatches
            });
            continue;
        }

        // Filet de sécurité : si la synchro Cursus -> Promotion n'a pas eu le
        // temps de recopier coursePlan, le template lié reste la source durable.
        const template = await loadCurriculumTemplateForPromotion(db, promotion, templateCache);
        const templateMatches = findLinkedItemsInList(template?.items || [], courseId, courseData);
        if (templateMatches.length) {
            targets.push({
                promotion,
                reason: "linked_curriculum_template_contains_course",
                matchedItems: templateMatches
            });
        }
    }

    return targets;
}

async function collectDirectTargetStudents(db, courseData = {}) {
    const students = new Map();
    const ids = new Set();
    addStudentIdFromValue(ids, courseData.targetStudents);
    addStudentIdFromValue(ids, courseData.targetStudentIds);
    addStudentIdFromValue(ids, courseData.studentIds);
    addStudentIdFromValue(ids, courseData.students);
    addStudentIdFromValue(ids, courseData.eleves);
    addStudentIdFromValue(ids, courseData.elevesIds);

    for (const id of ids) await addStudentById(db, students, id);
    return Array.from(students.values());
}

async function notifyStudentsForReplacementCourse(db, { courseId, courseData, apiKey, options = {} }) {
    const targets = await findPromotionTargetsForCourse(db, {
        courseId,
        courseData,
        promotionIds: options?.promotionIds || []
    });
    const includeDirectStudents = options?.includeDirectStudents !== false;
    const directStudents = includeDirectStudents ? await collectDirectTargetStudents(db, courseData) : [];
    const skipExistingNotifications = options?.skipExistingNotifications === true;
    const notificationSource = cleanString(options?.source || options?.trigger || "course_publish", 120) || "course_publish";
    const notifiedStudents = new Set();
    let notificationCount = 0;
    let emailCount = 0;
    let emailFailures = 0;
    let skippedExistingNotifications = 0;
    const targetReports = [];
    const notifiedStudentIds = [];

    async function notifyOneStudent(student, promotion = {}, reason = "direct_course_target") {
        if (!student.id || notifiedStudents.has(student.id)) return;
        const notificationId = `new_course_${courseId}_${student.id}`;

        if (skipExistingNotifications) {
            try {
                const existingNotification = await db.collection("notifications").doc(notificationId).get();
                if (existingNotification.exists) {
                    skippedExistingNotifications += 1;
                    notifiedStudents.add(student.id);
                    return;
                }
            } catch (error) {
                console.error("Vérification notification élève existante impossible :", notificationId, error.message || error);
            }
        }

        notifiedStudents.add(student.id);
        notifiedStudentIds.push(student.id);

        await addDirectCourseNotification(db, notificationId, {
            type: "new_course_published",
            courseId,
            courseTitle: getCourseWorkflowTitle(courseData),
            destinataireId: student.id,
            targetStudents: [student.id],
            promotionId: promotion.id || "",
            promotionName: promotion.name || promotion.promotionName || "",
            fromCoursePlan: Boolean(promotion.id),
            fromPlaceholderReplacement: reason.includes("placeholder"),
            coursePlanMatchReason: reason,
            notificationSource,
            actionUrl: getCourseWorkflowUrl("/student/cours-viewer.html", courseId)
        });
        notificationCount += 1;

        try {
            await sendStudentNewCourseEmail({ student, courseId, courseData, promotion, apiKey });
            emailCount += 1;
        } catch (error) {
            emailFailures += 1;
            console.error("Email nouveau cours élève impossible :", student.id, error.message, error.payload || "");
        }
    }

    for (const target of targets) {
        const students = await listPromotionStudents(db, target.promotion);
        targetReports.push({
            promotionId: target.promotion.id,
            reason: target.reason,
            students: students.length,
            matchedItems: target.matchedItems.length
        });

        for (const student of students) {
            await notifyOneStudent(student, target.promotion, target.reason);
        }
    }

    for (const student of directStudents) {
        await notifyOneStudent(student, {}, "direct_course_target");
    }

    const report = {
        promotions: targets.map((target) => target.promotion.id),
        targetReports,
        directStudentCount: directStudents.length,
        notifiedStudentIds,
        scannedStudentCount: targetReports.reduce((total, item) => total + Number(item.students || 0), 0) + directStudents.length,
        notificationCount,
        emailCount,
        emailFailures,
        skippedExistingNotifications,
        notificationSource,
        noStudentReason: notificationCount === 0
            ? (skippedExistingNotifications > 0
                ? "students_already_notified"
                : (targets.length ? "promotion_matched_but_no_students" : "no_promotion_or_target_students_found"))
            : ""
    };

    console.info("[SBI Course Workflow] Student notification report", {
        courseId,
        promotions: report.promotions,
        targetReports: report.targetReports,
        directStudentCount: report.directStudentCount,
        scannedStudentCount: report.scannedStudentCount,
        notificationCount: report.notificationCount,
        emailCount: report.emailCount,
        emailFailures: report.emailFailures,
        skippedExistingNotifications: report.skippedExistingNotifications,
        notificationSource: report.notificationSource,
        noStudentReason: report.noStudentReason
    });

    return report;
}

exports.submitCourseForValidation = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 45,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const courseId = cleanString(request.data?.courseId, 180);

    if (!courseId) throw new HttpsError("invalid-argument", "Identifiant cours manquant.");

    const courseRef = db.collection("courses").doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) throw new HttpsError("not-found", "Cours introuvable.");

    const courseData = courseSnap.data() || {};
    const authorId = cleanString(courseData.auteurId || "", 180);
    if (!caller.isAdmin && authorId !== caller.uid) {
        throw new HttpsError("permission-denied", "Vous ne pouvez soumettre que vos propres cours.");
    }

    if (courseData.actif === true || courseData.statutValidation === "approved") {
        throw new HttpsError("failed-precondition", "Ce cours est déjà validé.");
    }

    await courseRef.set({
        statutValidation: "pending",
        actif: false,
        lmsStatus: "pending_review",
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        submittedBy: caller.uid,
        submittedByEmail: caller.email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const nextSnap = await courseRef.get();
    const nextCourseData = nextSnap.data() || courseData;
    await createCourseValidationNotification(db, { courseId, courseData: nextCourseData, caller });

    let warning = "";
    let contactEmailSent = false;
    try {
        const apiKey = BREVO_API_KEY.value();
        if (!apiKey) throw new Error("BREVO_API_KEY manquant.");
        await sendCourseInternalEmail({
            eventLabel: "Cours soumis à validation",
            courseId,
            courseData: nextCourseData,
            actor: caller,
            apiKey
        });
        contactEmailSent = true;
    } catch (error) {
        warning = "Cours soumis, notification admin créée, mais email contact Brevo non envoyé.";
        console.error("Email contact validation cours impossible :", error.message, error.payload || "");
    }

    await safeWriteAccountAuditLog(db, {
        type: "course.validation_submitted",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: authorId || caller.uid,
        targetEmail: cleanEmail(nextCourseData.authorEmail || caller.email || ""),
        courseId,
        courseTitle: getCourseWorkflowTitle(nextCourseData),
        emailSent: contactEmailSent,
        warning,
        source: "course-workflow"
    });

    return {
        success: true,
        message: warning || "Cours soumis à validation.",
        warning
    };
});

exports.syncCourseBlockReference = onCall({
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const courseId = cleanString(request.data?.courseId, 180);

    if (!courseId) throw new HttpsError("invalid-argument", "Identifiant cours manquant.");

    const courseSnap = await db.collection("courses").doc(courseId).get();
    if (!courseSnap.exists) throw new HttpsError("not-found", "Cours introuvable.");

    const courseData = courseSnap.data() || {};
    const authorId = cleanString(courseData.auteurId || "", 180);
    if (!caller.isAdmin && authorId !== caller.uid) {
        throw new HttpsError("permission-denied", "Vous ne pouvez indexer que vos propres cours.");
    }

    const report = await syncCourseBlockReferences(db, { courseId, courseData, caller });

    return report;
});


function isCoursePublishedForStudentNotification(courseData = {}) {
    return courseData.actif === true
        || cleanString(courseData.statutValidation || "", 80).toLowerCase() === "approved"
        || cleanString(courseData.lmsStatus || "", 80).toLowerCase() === "published";
}

function buildCurriculumNotificationMessage({ notified = 0, emails = 0, skipped = 0, ignored = 0 } = {}) {
    if (notified > 0) {
        return `Notifications élèves envoyées depuis le Cursus : ${notified}, email(s) : ${emails}.`;
    }
    if (skipped > 0) {
        return `Aucune nouvelle notification : ${skipped} notification(s) élève existaient déjà.`;
    }
    if (ignored > 0) {
        return `Aucune notification envoyée : ${ignored} cours ignoré(s) car non publiés ou introuvables.`;
    }
    return "Aucun nouveau cours publié à notifier.";
}

exports.notifyCoursePlanStudents = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const rawCourseIds = Array.isArray(request.data?.courseIds) ? request.data.courseIds : [];
    const courseIds = Array.from(new Set(rawCourseIds
        .map((value) => cleanString(value, 180))
        .filter(Boolean)))
        .slice(0, 30);
    const templateId = cleanString(request.data?.templateId || "", 180);
    const source = cleanString(request.data?.source || "curriculum_save", 120) || "curriculum_save";
    const promotionIds = Array.from(new Set((Array.isArray(request.data?.promotionIds) ? request.data.promotionIds : [])
        .map((value) => cleanString(value, 180))
        .filter(Boolean)))
        .slice(0, 40);

    if (!courseIds.length) {
        return {
            success: true,
            message: "Aucun nouveau cours publié à notifier.",
            reports: [],
            totals: {
                notificationCount: 0,
                emailCount: 0,
                emailFailures: 0,
                skippedExistingNotifications: 0,
                ignoredCourseCount: 0
            }
        };
    }

    const apiKey = BREVO_API_KEY.value();
    if (!apiKey) throw new HttpsError("failed-precondition", "Configuration Brevo manquante côté serveur.");

    const reports = [];
    let totalNotifications = 0;
    let totalEmails = 0;
    let totalEmailFailures = 0;
    let totalSkippedExisting = 0;
    let ignoredCourseCount = 0;

    for (const courseId of courseIds) {
        const courseSnap = await db.collection("courses").doc(courseId).get();
        if (!courseSnap.exists) {
            ignoredCourseCount += 1;
            reports.push({
                courseId,
                status: "not_found",
                message: "Cours introuvable."
            });
            continue;
        }

        const courseData = courseSnap.data() || {};
        if (!isCoursePublishedForStudentNotification(courseData)) {
            ignoredCourseCount += 1;
            reports.push({
                courseId,
                courseTitle: getCourseWorkflowTitle(courseData),
                status: "not_published",
                message: "Cours non publié, aucune notification élève envoyée."
            });
            continue;
        }

        const studentReport = await notifyStudentsForReplacementCourse(db, {
            courseId,
            courseData,
            apiKey,
            options: {
                skipExistingNotifications: true,
                includeDirectStudents: false,
                source,
                templateId,
                promotionIds,
                actorUid: caller.uid,
                actorEmail: caller.email
            }
        });

        totalNotifications += Number(studentReport.notificationCount || 0);
        totalEmails += Number(studentReport.emailCount || 0);
        totalEmailFailures += Number(studentReport.emailFailures || 0);
        totalSkippedExisting += Number(studentReport.skippedExistingNotifications || 0);

        const courseTitle = getCourseWorkflowTitle(courseData);
        reports.push({
            courseId,
            courseTitle,
            status: studentReport.notificationCount > 0
                ? "notified"
                : (studentReport.skippedExistingNotifications > 0 ? "already_notified" : "no_target"),
            notificationCount: studentReport.notificationCount,
            emailCount: studentReport.emailCount,
            emailFailures: studentReport.emailFailures,
            skippedExistingNotifications: studentReport.skippedExistingNotifications,
            noStudentReason: studentReport.noStudentReason,
            promotions: studentReport.promotions,
            targetReports: studentReport.targetReports
        });

        await safeWriteAccountAuditLog(db, {
            type: "course.curriculum_student_notifications",
            actorUid: caller.uid,
            actorEmail: caller.email,
            courseId,
            courseTitle,
            curriculumTemplateId: templateId,
            studentNotificationCount: studentReport.notificationCount,
            studentEmailCount: studentReport.emailCount,
            studentEmailFailures: studentReport.emailFailures,
            skippedExistingNotifications: studentReport.skippedExistingNotifications,
            studentNotificationTargets: studentReport.notifiedStudentIds || [],
            scannedStudentCount: studentReport.scannedStudentCount || 0,
            studentPromotionMatches: studentReport.targetReports || [],
            replacementPromotionIds: studentReport.promotions,
            warning: studentReport.noStudentReason || "",
            source: "curriculum-save-workflow"
        });
    }

    const message = buildCurriculumNotificationMessage({
        notified: totalNotifications,
        emails: totalEmails,
        skipped: totalSkippedExisting,
        ignored: ignoredCourseCount
    });

    return {
        success: true,
        message,
        reports,
        totals: {
            notificationCount: totalNotifications,
            emailCount: totalEmails,
            emailFailures: totalEmailFailures,
            skippedExistingNotifications: totalSkippedExisting,
            ignoredCourseCount
        }
    };
});

exports.reviewCourseValidation = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const courseId = cleanString(request.data?.courseId, 180);
    const decision = cleanString(request.data?.decision, 40).toLowerCase();

    if (!courseId) throw new HttpsError("invalid-argument", "Identifiant cours manquant.");
    if (!["publish", "reject"].includes(decision)) {
        throw new HttpsError("invalid-argument", "Décision de validation invalide.");
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) throw new HttpsError("not-found", "Cours introuvable.");

    const courseData = courseSnap.data() || {};
    const authorId = cleanString(courseData.auteurId || "", 180);
    const authorSnap = authorId ? await db.collection("users").doc(authorId).get() : null;
    const authorData = authorSnap?.exists ? (authorSnap.data() || {}) : {};
    const apiKey = BREVO_API_KEY.value();
    if (!apiKey) throw new HttpsError("failed-precondition", "Configuration Brevo manquante côté serveur.");

    const isPublishing = decision === "publish";
    const updatePayload = isPublishing
        ? {
            statutValidation: "approved",
            actif: true,
            lmsStatus: "published",
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvedBy: caller.uid,
            approvedByEmail: caller.email,
            publishedAt: admin.firestore.FieldValue.serverTimestamp(),
            publishedBy: caller.uid,
            publishedByEmail: caller.email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
        : {
            statutValidation: "rejected",
            actif: false,
            lmsStatus: "draft",
            rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            rejectedBy: caller.uid,
            rejectedByEmail: caller.email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

    await courseRef.set(updatePayload, { merge: true });
    const nextSnap = await courseRef.get();
    const nextCourseData = nextSnap.data() || { ...courseData, ...updatePayload };

    const resolvedNotifications = await resolveCourseValidationNotificationsServer(db, courseId, caller.uid);
    let teacherEmailSent = false;
    let contactEmailSent = false;
    let teacherNotificationSent = false;
    let studentReport = { promotions: [], targetReports: [], directStudentCount: 0, scannedStudentCount: 0, notifiedStudentIds: [], notificationCount: 0, emailCount: 0, emailFailures: 0, noStudentReason: "" };
    const warnings = [];

    if (authorId) {
        await addDirectCourseNotification(db, `${isPublishing ? "course_approved" : "course_rejected"}_${courseId}_${authorId}`, {
            type: isPublishing ? "course_approved" : "course_rejected",
            courseId,
            courseTitle: getCourseWorkflowTitle(nextCourseData),
            destinataireId: authorId
        });
        teacherNotificationSent = true;
    }

    try {
        if (authorId && isValidEmail(cleanEmail(authorData.email || ""))) {
            await sendCourseTeacherStatusEmail({
                teacher: authorData,
                courseId,
                courseData: nextCourseData,
                status: isPublishing ? "published" : "rejected",
                apiKey
            });
            teacherEmailSent = true;
        }
    } catch (error) {
        warnings.push("Email professeur non envoyé.");
        console.error("Email professeur validation cours impossible :", error.message, error.payload || "");
    }

    if (isPublishing) {
        try {
            await sendCourseInternalEmail({
                eventLabel: "Cours mis en ligne",
                courseId,
                courseData: nextCourseData,
                actor: caller,
                apiKey
            });
            contactEmailSent = true;
        } catch (error) {
            warnings.push("Email contact mise en ligne non envoyé.");
            console.error("Email contact mise en ligne cours impossible :", error.message, error.payload || "");
        }

        studentReport = await notifyStudentsForReplacementCourse(db, {
            courseId,
            courseData: nextCourseData,
            apiKey
        });
        if (!studentReport.notificationCount) {
            warnings.push(studentReport.noStudentReason === "promotion_matched_but_no_students"
                ? "Promotion(s) trouvée(s), mais aucun élève rattaché détecté."
                : "Aucune promotion / cible élève trouvée pour ce cours publié.");
        } else {
            warnings.push(`Notifications élèves : ${studentReport.notificationCount}, email(s) envoyé(s) : ${studentReport.emailCount}.`);
        }
        if (studentReport.emailFailures > 0) {
            warnings.push(`${studentReport.emailFailures} email(s) élève non envoyé(s).`);
        }
    }

    await safeWriteAccountAuditLog(db, {
        type: isPublishing ? "course.published" : "course.rejected",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: authorId,
        targetEmail: cleanEmail(authorData.email || ""),
        courseId,
        courseTitle: getCourseWorkflowTitle(nextCourseData),
        emailSent: teacherEmailSent,
        contactEmailSent,
        teacherNotificationSent,
        resolvedNotifications,
        studentNotificationCount: studentReport.notificationCount,
        studentEmailCount: studentReport.emailCount,
        studentEmailFailures: studentReport.emailFailures,
        studentNotificationTargets: studentReport.notifiedStudentIds || [],
        scannedStudentCount: studentReport.scannedStudentCount || 0,
        studentPromotionMatches: studentReport.targetReports || [],
        directStudentTargetCount: studentReport.directStudentCount || 0,
        replacementPromotionIds: studentReport.promotions,
        warning: warnings.join(" "),
        source: "course-workflow"
    });

    return {
        success: true,
        status: isPublishing ? "approved" : "rejected",
        message: warnings.length ? warnings.join(" ") : (isPublishing ? "Cours mis en ligne." : "Cours refusé."),
        warnings,
        studentReport
    };
});



function buildStudentVisibleDocumentUrl() {
    return `${SBI_SITE_URL}/student/mon-profil.html#student-visible-documents`;
}

async function sendStudentVisibleDocumentEmail(studentData, documentData, documentUrl, apiKey) {
    const studentEmail = cleanEmail(studentData.email || "");
    if (!isValidEmail(studentEmail)) {
        throw new Error("Email élève invalide ou manquant.");
    }

    const documentTitle = cleanString(documentData.title || documentData.fileName || "Document SBI", 160);
    const studentName = getAccountDisplayName(studentData) || "Élève SBI";

    return sendBrevoEmail({
        sender: {
            name: SBI_SENDER_NAME,
            email: SBI_SENDER_EMAIL
        },
        to: [{
            email: studentEmail,
            name: studentName
        }],
        replyTo: {
            email: SBI_CONTACT_EMAIL,
            name: "Sport Business Institute"
        },
        subject: "SBI - Nouveau document disponible dans votre espace",
        htmlContent: renderSbiEmailTemplate({
            prenom: studentData.prenom || "",
            nomExpediteur: "L’équipe SBI",
            posteExpediteur: "Administration",
            preheader: "Un nouveau document est disponible dans votre espace SBI.",
            messageHtml: `
                <p style="margin:0 0 16px 0;">Un nouveau document vient d’être rendu disponible dans votre espace personnel Sport Business Institute.</p>
                <p style="margin:0 0 16px 0;"><strong>Document :</strong> ${escapeHtml(documentTitle)}</p>
                ${buildActionButtonHtml(documentUrl, "Ouvrir mes documents SBI")}
                <p style="margin:0;">Si vous avez une question sur ce document, contactez l’équipe SBI.</p>
            `
        }),
        textContent: `Bonjour ${studentData.prenom || ""},

Un nouveau document est disponible dans votre espace SBI.

Document : ${documentTitle}
Lien : ${documentUrl}

Sport Business Institute`
    }, apiKey);
}

exports.adminSetStudentDocumentVisibility = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const documentId = cleanString(request.data?.documentId, 180);
    const visible = request.data?.visible === true;

    if (!documentId) {
        throw new HttpsError("invalid-argument", "Identifiant document manquant.");
    }

    const documentRef = db.collection("studentDocuments").doc(documentId);
    const documentSnap = await documentRef.get();

    if (!documentSnap.exists) {
        throw new HttpsError("not-found", "Document introuvable.");
    }

    const documentData = documentSnap.data() || {};
    const studentUid = cleanString(documentData.studentUid || "", 180);
    const status = cleanString(documentData.status || "", 60).toLowerCase();
    const validationStatus = cleanString(documentData.validationStatus || "", 60).toLowerCase();

    if (!studentUid) {
        throw new HttpsError("failed-precondition", "Document sans élève associé.");
    }

    if (visible && (["archived", "upload_failed", "rejected"].includes(status) || validationStatus === "rejected")) {
        throw new HttpsError("failed-precondition", "Ce document ne peut pas être rendu visible à l’élève dans son état actuel.");
    }

    const previousVisibility = cleanString(documentData.visibility || "admin_only", 80) || "admin_only";
    const nextVisibility = visible ? "student_visible" : "admin_only";

    if (previousVisibility === nextVisibility) {
        return {
            success: true,
            visibility: nextVisibility,
            message: visible ? "Document déjà visible élève." : "Document déjà masqué élève."
        };
    }

    const updatePayload = {
        visibility: nextVisibility,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: caller.uid,
        updatedByEmail: caller.email
    };

    if (visible) {
        updatePayload.studentVisibleAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.studentVisibleBy = caller.uid;
        updatePayload.studentVisibleByEmail = caller.email;
    } else {
        updatePayload.studentHiddenAt = admin.firestore.FieldValue.serverTimestamp();
        updatePayload.studentHiddenBy = caller.uid;
        updatePayload.studentHiddenByEmail = caller.email;
    }

    await documentRef.set(updatePayload, { merge: true });

    const documentTitle = documentData.title || documentData.fileName || "Document SBI";
    const documentUrl = buildStudentVisibleDocumentUrl();
    let warning = "";

    if (visible && previousVisibility !== "student_visible") {
        const studentDoc = await db.collection("users").doc(studentUid).get();
        const studentData = studentDoc.exists ? (studentDoc.data() || {}) : {};

        await db.collection("notifications").add({
            type: "student_document_visible",
            destinataireId: studentUid,
            targetStudents: [studentUid],
            status: "open",
            title: "Nouveau document disponible",
            body: `Le document “${documentTitle}” est disponible dans votre espace SBI.`,
            documentId,
            documentTitle,
            actionUrl: documentUrl,
            createdBy: caller.uid,
            createdByEmail: caller.email,
            dateCreation: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            dismissedBy: []
        });

        try {
            const apiKey = BREVO_API_KEY.value();
            if (!apiKey) throw new Error("BREVO_API_KEY manquant.");
            await sendStudentVisibleDocumentEmail(studentData, documentData, documentUrl, apiKey);
        } catch (emailError) {
            warning = "Document rendu visible, notification interne créée, mais l’email Brevo n’a pas pu être envoyé.";
            console.error("Erreur email Brevo document visible SBI :", emailError.message, emailError.payload || "");
        }
    }

    await safeWriteAccountAuditLog(db, {
        type: visible ? "student_document.visibility_enabled" : "student_document.visibility_disabled",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: studentUid,
        targetEmail: "",
        targetRole: "student",
        documentId,
        documentTitle,
        previousVisibility,
        nextVisibility,
        notificationSent: visible && previousVisibility !== "student_visible",
        emailWarning: warning
    });

    return {
        success: true,
        visibility: nextVisibility,
        warning,
        message: warning || (visible ? "Document rendu accessible à l’élève." : "Document masqué à l’élève.")
    };
});

exports.deleteUserAccount = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const targetUid = cleanString(request.data?.uid, 160);

    if (!targetUid) throw new HttpsError("invalid-argument", "UID utilisateur manquant.");
    if (targetUid === caller.uid) {
        throw new HttpsError("permission-denied", "Sécurité : vous ne pouvez pas supprimer votre propre compte.");
    }

    const targetDoc = await db.collection("users").doc(targetUid).get();

    if (!targetDoc.exists) {
        try {
            await admin.auth().deleteUser(targetUid);
        } catch (error) {
            if (error?.code !== "auth/user-not-found") throw error;
        }
        await safeWriteAccountAuditLog(db, {
            type: "account.deleted.orphan_cleanup",
            actorUid: caller.uid,
            actorEmail: caller.email,
            targetUid,
            targetEmail: "",
            targetRole: ""
        });
        return { success: true, message: "Nettoyage de sécurité effectué." };
    }

    const targetData = targetDoc.data() || {};
    const targetEmail = cleanEmail(targetData.email);
    const targetRole = targetData.role || "";

    if (targetData.isGod === true) {
        throw new HttpsError("permission-denied", "Sécurité : le compte Suprême ne peut pas être supprimé.");
    }

    if (targetRole === "admin" && caller.data.isGod !== true) {
        throw new HttpsError("permission-denied", "Un administrateur classique ne peut pas supprimer un autre administrateur.");
    }

    try {
        await admin.auth().deleteUser(targetUid);
    } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
    }

    await db.collection("users").doc(targetUid).delete();

    const apiKey = BREVO_API_KEY.value();
    let warning = "";

    try {
        if (!apiKey) throw new Error("BREVO_API_KEY manquant.");
        if (isValidEmail(targetEmail)) {
            await sendAccountDeletedEmail({ ...targetData, email: targetEmail }, apiKey);
        }
        await sendAccountInternalEmail("Compte supprimé", {
            "Admin": caller.name,
            "Admin email": caller.email,
            "Utilisateur": getAccountDisplayName(targetData),
            "Email": targetEmail,
            "Rôle": getAccountRoleLabel(targetRole),
            "UID": targetUid
        }, apiKey);
    } catch (error) {
        warning = "Compte supprimé, mais l’email de confirmation ou la notification interne n’a pas pu être envoyé.";
        console.error("Erreur email suppression compte SBI :", error.message, error.payload || "");
    }

    await safeWriteAccountAuditLog(db, {
        type: "account.deleted",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid,
        targetEmail,
        targetRole
    });

    return {
        success: true,
        warning,
        message: warning || "Le compte a été intégralement supprimé."
    };
});

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

    // Honeypot anti-spam : si le champ piège est rempli, on renvoie un faux succes
    // (sans rien envoyer ni enregistrer) pour ne pas signaler le rejet au bot.
    if (data.honeypot) {
        return res.status(200).json({
            success: true,
            mode: "sent",
            message: "Votre message a bien été envoyé. L’équipe SBI revient vers vous rapidement."
        });
    }

    const validationMessage = validateContactRequest(data);

    if (validationMessage) {
        return res.status(400).json({
            success: false,
            message: validationMessage
        });
    }

    // Rate-limit souple par IP (fail-open) : limite les rafales de spam sans
    // bloquer des utilisateurs legitimes derriere une IP partagee.
    try {
        const ip = cleanString(
            (req.get("x-forwarded-for") || "").split(",")[0].trim() || req.ip || "",
            64
        );
        if (ip) {
            const db = admin.firestore();
            const ref = db.collection("contactRateLimits").doc(ip.replace(/[^0-9a-zA-Z._:-]/g, "_").slice(0, 120) || "unknown");
            const blocked = await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const now = Date.now();
                const windowMs = 10 * 60 * 1000;
                const maxPerWindow = 8;
                const prev = snap.exists ? (snap.data() || {}) : {};
                const windowStart = Number(prev.windowStart) || 0;
                let count = Number(prev.count) || 0;
                let start = windowStart;
                if (!windowStart || now - windowStart > windowMs) {
                    start = now;
                    count = 0;
                }
                count += 1;
                tx.set(ref, { windowStart: start, count, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                return count > maxPerWindow;
            });
            if (blocked) {
                return res.status(429).json({
                    success: false,
                    message: "Trop de demandes envoyées. Merci de réessayer dans quelques minutes."
                });
            }
        }
    } catch (rateError) {
        console.warn("Rate-limit contact ignoré (fail-open) :", rateError.message || rateError);
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

/* =======================================================================
 * SBI 8.0P.82 - NEWSLETTER MOBILE + EMAIL SOCIAL LINKS
 * -----------------------------------------------------------------------
 * Endpoint appelé par /api/subscribeNewsletter via Firebase Hosting rewrite.
 * La clé Brevo reste côté serveur dans BREVO_API_KEY.
 * ======================================================================= */

exports.subscribeNewsletter = onRequest({
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
        console.error("BREVO_API_KEY manquant dans Secret Manager pour la newsletter SBI.");
        return res.status(500).json({
            success: false,
            message: "Configuration newsletter manquante côté serveur."
        });
    }

    const data = parseNewsletterRequest(req.body || {});
    const validationMessage = validateNewsletterRequest(data);

    if (validationMessage === "HONEYPOT") {
        return res.status(200).json({
            success: true,
            mode: "ignored",
            message: "Inscription prise en compte."
        });
    }

    if (validationMessage) {
        return res.status(400).json({
            success: false,
            message: validationMessage
        });
    }

    try {
        const existingContact = await getBrevoContactByEmail(data.email, apiKey);
        const existingListIds = Array.isArray(existingContact?.listIds) ? existingContact.listIds : [];
        const alreadySubscribed = existingListIds.includes(BREVO_NEWSLETTER_LIST_ID);
        const contactResult = await upsertBrevoNewsletterContact(data, apiKey, existingContact);
        const mode = alreadySubscribed ? "already_exists" : "subscribed";
        let notificationWarning = "";

        // On évite de renvoyer des emails à chaque tentative si l'adresse
        // était déjà inscrite. Une vraie nouvelle inscription déclenche :
        // - une notification interne à contact@sbigroup.fr ;
        // - un email de confirmation au prospect.
        if (!alreadySubscribed) {
            try {
                await sendBrevoNewsletterNotification(data, apiKey, mode);
            } catch (notificationError) {
                notificationWarning = "Newsletter enregistrée, mais la notification interne n'a pas pu être envoyée.";
                console.error("Erreur notification newsletter SBI :", notificationError.message, notificationError.payload || "");
            }

            try {
                await sendBrevoNewsletterConfirmation(data, apiKey);
            } catch (confirmationError) {
                notificationWarning = notificationWarning
                    ? `${notificationWarning} L'email de confirmation newsletter n'a pas pu être envoyé.`
                    : "Newsletter enregistrée, mais l'email de confirmation n'a pas pu être envoyé.";
                console.error("Erreur confirmation newsletter SBI :", confirmationError.message, confirmationError.payload || "");
            }
        }

        return res.status(200).json({
            success: true,
            mode,
            message: alreadySubscribed
                ? "Cette adresse est déjà inscrite à la newsletter SBI."
                : "Inscription confirmée. Bienvenue dans la boucle SBI.",
            warning: notificationWarning,
            brevo: {
                listId: BREVO_NEWSLETTER_LIST_ID,
                contact: existingContact?.id || contactResult?.id || contactResult?.ok || "updated"
            }
        });
    } catch (error) {
        console.error("Erreur Brevo newsletter SBI :", error.message, error.payload || "");
        return res.status(502).json({
            success: false,
            message: "L'inscription newsletter n'a pas pu aboutir pour le moment. Réessaie plus tard."
        });
    }
});


/* =======================================================================
 * SBI 8.0P.167.76 — Demande de documents élève + expiration
 * ======================================================================= */

function normalizeRequestedDocumentItems(items = []) {
    const allowedTypes = new Set([
        'identity', 'domicile', 'photo', 'civil_liability', 'cv', 'diploma',
        'school_certificate', 'parental_authorization', 'rib', 'signed_contract',
        'employer_certificate', 'other'
    ]);

    if (!Array.isArray(items)) return [];

    return items.slice(0, 18).map((item, index) => {
        const type = cleanString(item?.type || `custom_${index + 1}`, 60).toLowerCase();
        const safeType = allowedTypes.has(type) ? type : 'other';
        const title = cleanString(item?.title || 'Document demandé', 140);
        return {
            type: safeType,
            title: title || 'Document demandé',
            category: cleanString(item?.category || 'administrative', 60) || 'administrative',
            acceptLabel: cleanString(item?.acceptLabel || 'PDF, JPG ou PNG', 80) || 'PDF, JPG ou PNG',
            required: item?.required !== false,
            status: 'pending'
        };
    }).filter((item) => item.title);
}

function buildStudentDocumentRequestLink(requestId) {
    const url = new URL('/student/document-request.html', SBI_SITE_URL);
    url.searchParams.set('request', requestId);
    return url.toString();
}

const STUDENT_DOCUMENT_REQUEST_ACTIVE_DAYS = 45;
const STUDENT_DOCUMENT_REQUEST_CLOSED_RETENTION_DAYS = 30;
const STUDENT_DOCUMENT_REQUEST_PURGE_BATCH_LIMIT = 200;
const SBI_DAY_MS = 24 * 60 * 60 * 1000;

function buildFutureTimestamp(days = 30) {
    return admin.firestore.Timestamp.fromDate(new Date(Date.now() + (Number(days) || 30) * SBI_DAY_MS));
}

function getTimestampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return 0;
}

function serializeTimestampForClient(value) {
    const millis = getTimestampMillis(value);
    return millis ? new Date(millis).toISOString() : '';
}

function isStudentDocumentRequestActiveStatus(status = '') {
    return ['requested', 'partial'].includes(cleanString(status || '', 40).toLowerCase());
}

function isStudentDocumentRequestClosedStatus(status = '') {
    return ['canceled', 'cancelled', 'completed', 'validated', 'archived', 'expired'].includes(cleanString(status || '', 40).toLowerCase());
}

function isStudentDocumentRequestPastExpiry(requestData = {}, nowMs = Date.now()) {
    const status = cleanString(requestData.status || 'requested', 40).toLowerCase();
    if (!isStudentDocumentRequestActiveStatus(status)) return false;
    const expiresAtMs = getTimestampMillis(requestData.requestExpiresAt);
    return expiresAtMs > 0 && expiresAtMs <= nowMs;
}

async function markStudentDocumentRequestExpired(requestRef, requestData = {}) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    await requestRef.set({
        status: 'expired',
        expiredAt: now,
        cleanupAt: buildFutureTimestamp(STUDENT_DOCUMENT_REQUEST_CLOSED_RETENTION_DAYS),
        updatedAt: now
    }, { merge: true });

    return {
        ...requestData,
        status: 'expired',
        expiredAt: new Date().toISOString()
    };
}

function buildStudentDocumentRequestMessageHtml({ studentName, items, requestLink, note }) {
    const list = items.map((item) => `<li style="margin:0 0 8px 0;"><strong>${escapeHtml(item.title)}</strong> <span style="color:#667085;">${escapeHtml(item.acceptLabel || 'PDF, JPG ou PNG')}</span></li>`).join('');
    return `
        <p style="margin:0 0 16px 0;">L’équipe SBI a besoin de récupérer certains documents pour compléter ton dossier.</p>
        <p style="margin:0 0 16px 0;">Merci de déposer les fichiers demandés depuis la page sécurisée ci-dessous.</p>
        <div style="padding:14px 16px;border:1px solid #dce4f2;background:#f7f9fd;border-radius:12px;color:#253047;line-height:1.7;margin:18px 0;">
            <strong style="color:#101828;">Documents demandés</strong>
            <ul style="margin:12px 0 0 18px;padding:0;">${list}</ul>
        </div>
        ${note ? `<div style="padding:14px 16px;border:1px solid #dce4f2;background:#fff;border-radius:12px;color:#253047;line-height:1.7;margin:18px 0;"><strong style="color:#101828;">Message SBI</strong><br>${escapeHtmlMultiline(note)}</div>` : ''}
        <p style="margin:22px 0;text-align:center;">
            <a href="${escapeHtml(requestLink)}" style="display:inline-block;background:#0051ff;color:#ffffff;font-weight:bold;padding:13px 20px;border-radius:999px;text-decoration:none;">Déposer mes documents</a>
        </p>
        <p style="margin:0;color:#667085;font-size:14px;line-height:22px;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>${escapeHtml(requestLink)}</p>`;
}

async function sendStudentDocumentRequestEmail({ student, items, requestLink, note, apiKey }) {
    const email = cleanEmail(student.email);
    if (!isValidEmail(email)) throw new Error('Email élève invalide.');

    const studentName = getAccountDisplayName(student);
    const htmlContent = renderSbiEmailTemplate({
        prenom: student.prenom || studentName || 'à toi',
        messageHtml: buildStudentDocumentRequestMessageHtml({ studentName, items, requestLink, note }),
        nomExpediteur: 'L’équipe SBI',
        posteExpediteur: 'Service administratif',
        preheader: 'Documents demandés pour compléter ton dossier SBI.'
    });

    return sendBrevoEmail({
        sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
        to: [{ email, name: studentName || email }],
        subject: 'SBI - Documents à déposer pour ton dossier',
        htmlContent,
        textContent: [
            `Bonjour ${student.prenom || ''},`,
            '',
            'L’équipe SBI a besoin de récupérer certains documents pour compléter ton dossier.',
            '',
            ...items.map((item) => `- ${item.title} (${item.acceptLabel || 'PDF, JPG ou PNG'})`),
            '',
            `Lien : ${requestLink}`,
            '',
            'Bien cordialement,',
            'L’équipe SBI'
        ].join('\n')
    }, apiKey);
}


function serializeStudentDocumentRequestItem(item = {}) {
    const status = cleanString(item?.status || 'pending', 40).toLowerCase();
    return {
        type: cleanString(item?.type || 'other', 80),
        title: cleanString(item?.title || 'Document demandé', 140) || 'Document demandé',
        category: cleanString(item?.category || 'administrative', 60) || 'administrative',
        acceptLabel: cleanString(item?.acceptLabel || 'PDF, JPG ou PNG', 80) || 'PDF, JPG ou PNG',
        required: item?.required !== false,
        status: ['pending', 'submitted', 'validated', 'rejected'].includes(status) ? status : 'pending',
        documentId: cleanString(item?.documentId || '', 180),
        rejectedDocumentId: cleanString(item?.rejectedDocumentId || '', 180),
        fileName: cleanString(item?.fileName || '', 180),
        submittedAt: cleanString(item?.submittedAt || '', 80),
        validatedAt: cleanString(item?.validatedAt || '', 80),
        rejectedAt: cleanString(item?.rejectedAt || '', 80),
        reviewNote: cleanMultiline(item?.reviewNote || item?.rejectionNote || '', 260)
    };
}

function serializeStudentDocumentRequestForClient(requestId, requestData = {}) {
    const items = Array.isArray(requestData.items)
        ? requestData.items.map(serializeStudentDocumentRequestItem)
        : [];

    return {
        id: requestId,
        studentUid: cleanString(requestData.studentUid || '', 160),
        studentEmail: cleanEmail(requestData.studentEmail || ''),
        studentName: cleanString(requestData.studentName || '', 180),
        status: cleanString(requestData.status || 'requested', 40).toLowerCase() || 'requested',
        note: cleanMultiline(requestData.note || '', 1200),
        requestLink: cleanString(requestData.requestLink || '', 600),
        visibility: cleanString(requestData.visibility || 'student', 40),
        requestExpiresAt: serializeTimestampForClient(requestData.requestExpiresAt),
        cleanupAt: serializeTimestampForClient(requestData.cleanupAt),
        expiredAt: serializeTimestampForClient(requestData.expiredAt),
        items
    };
}

exports.studentGetDocumentRequest = onCall({
    region: 'europe-west1',
    timeoutSeconds: 20,
    memory: '256MiB'
}, async (request) => {
    const uid = request.auth?.uid || '';
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Connexion requise pour déposer les documents.');
    }

    const db = admin.firestore();
    const requestId = cleanString(request.data?.requestId || request.data?.id || '', 180);

    if (!requestId) {
        throw new HttpsError('invalid-argument', 'Identifiant de demande manquant.');
    }

    const [requestDoc, userDoc] = await Promise.all([
        db.collection('studentDocumentRequests').doc(requestId).get(),
        db.collection('users').doc(uid).get()
    ]);

    if (!requestDoc.exists) {
        throw new HttpsError('not-found', 'Demande introuvable ou expirée.');
    }
    if (!userDoc.exists) {
        throw new HttpsError('failed-precondition', 'Compte utilisateur introuvable.');
    }

    let requestData = requestDoc.data() || {};
    if (cleanString(requestData.studentUid || '', 160) !== uid) {
        throw new HttpsError('permission-denied', 'Cette demande ne correspond pas au compte connecté.');
    }

    if (isStudentDocumentRequestPastExpiry(requestData)) {
        requestData = await markStudentDocumentRequestExpired(requestDoc.ref, requestData);
        await resolveStudentDocumentRequestNotifications(db, requestId).catch(() => {});
    }

    const userData = userDoc.data() || {};
    if (cleanString(userData.statut || 'actif', 40).toLowerCase() === 'suspendu') {
        throw new HttpsError('permission-denied', 'Compte suspendu.');
    }

    return {
        success: true,
        request: serializeStudentDocumentRequestForClient(requestDoc.id, requestData),
        student: {
            uid,
            email: cleanEmail(userData.email || ''),
            prenom: cleanString(userData.prenom || userData.firstName || '', 80),
            nom: cleanString(userData.nom || userData.lastName || '', 80),
            displayName: cleanString(getAccountDisplayName(userData) || userData.displayName || '', 160)
        }
    };
});





function buildStudentDocumentSubmittedAdminMessageHtml({ student, requestData, submittedItems }) {
    const studentName = getAccountDisplayName(student) || requestData.studentName || requestData.studentEmail || 'Élève SBI';
    const requestId = cleanString(requestData.id || requestData.requestId || '', 180);
    const profileLink = `${SBI_SITE_URL}/admin/admin-profile.html?id=${encodeURIComponent(cleanString(requestData.studentUid || '', 180))}`;
    const rows = submittedItems.map((item) => `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#101828;font-weight:bold;">${escapeHtml(item.title || 'Document')}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#344054;">${escapeHtml(item.fileName || 'Fichier transmis')}</td>
        </tr>`).join('');

    return `
        <p style="margin:0 0 16px 0;">Un élève vient de transmettre les documents demandés pour son dossier SBI.</p>
        <div style="padding:14px 16px;border:1px solid #dce4f2;background:#f7f9fd;border-radius:12px;color:#253047;line-height:1.7;margin:18px 0;">
            <strong style="color:#101828;">Élève</strong><br>
            ${escapeHtml(studentName)}<br>
            ${escapeHtml(cleanEmail(student.email || requestData.studentEmail || ''))}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #dce4f2;border-radius:12px;overflow:hidden;">
            <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#0051ff;font-weight:bold;width:38%;">Demande</td>
                <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#101828;">${escapeHtml(requestId || 'Non précisée')}</td>
            </tr>
            <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#0051ff;font-weight:bold;width:38%;">Documents reçus</td>
                <td style="padding:10px 12px;border-bottom:1px solid #dce4f2;color:#101828;">${submittedItems.length}</td>
            </tr>
            ${rows}
        </table>
        <p style="margin:22px 0;text-align:center;">
            <a href="${escapeHtml(profileLink)}" style="display:inline-block;background:#0051ff;color:#ffffff;font-weight:bold;padding:13px 20px;border-radius:999px;text-decoration:none;">Ouvrir le profil élève</a>
        </p>
        <p style="margin:0;color:#667085;font-size:14px;line-height:22px;">Les pièces sont disponibles dans l’espace admin SBI, onglet Suivi pédagogique → Coffre documents.</p>`;
}

async function sendStudentDocumentSubmittedAdminEmail({ student, requestData, submittedItems, apiKey }) {
    const studentName = getAccountDisplayName(student) || requestData.studentName || requestData.studentEmail || 'Élève SBI';
    const email = cleanEmail(student.email || requestData.studentEmail || '');
    const htmlContent = renderSbiEmailTemplate({
        prenom: 'équipe SBI',
        messageHtml: buildStudentDocumentSubmittedAdminMessageHtml({ student, requestData, submittedItems }),
        nomExpediteur: 'Notification automatique SBI',
        posteExpediteur: 'Documents élèves',
        preheader: `${studentName} a transmis des documents à vérifier.`
    });

    return sendBrevoEmail({
        sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
        to: [{ email: SBI_CONTACT_EMAIL, name: 'Sport Business Institute' }],
        replyTo: email ? { email, name: studentName } : undefined,
        subject: `SBI - Documents élèves reçus - ${studentName}`,
        htmlContent,
        textContent: [
            `Documents élèves reçus`,
            ``,
            `Élève : ${studentName}`,
            email ? `Email : ${email}` : '',
            `Documents : ${submittedItems.map((item) => item.title || 'Document').join(', ')}`,
            ``,
            `À vérifier dans l’espace admin SBI.`
        ].filter(Boolean).join('\n')
    }, apiKey);
}


async function listAdminNotificationRecipients(db) {
    const recipients = new Map();
    try {
        const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
        adminSnap.forEach((docSnap) => recipients.set(docSnap.id, docSnap.data() || {}));
    } catch (error) {
        console.error('Lecture admins notifications documents impossible :', error.message || error);
    }
    try {
        const godSnap = await db.collection('users').where('isGod', '==', true).get();
        godSnap.forEach((docSnap) => recipients.set(docSnap.id, docSnap.data() || {}));
    } catch (error) {
        console.error('Lecture isGod notifications documents impossible :', error.message || error);
    }
    return Array.from(recipients.entries()).map(([uid, data]) => ({ uid, data }));
}

async function createStudentDocumentSubmittedAdminNotifications(db, { requestId, studentUid, student, requestData, submittedItems }) {
    const recipients = await listAdminNotificationRecipients(db);
    if (!recipients.length) return;
    const studentName = getAccountDisplayName(student) || requestData.studentName || requestData.studentEmail || 'Élève SBI';
    const studentEmail = cleanEmail(student.email || requestData.studentEmail || '');
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    recipients.forEach(({ uid }) => {
        if (!uid) return;
        const notificationRef = db.collection('notifications').doc(`student_documents_submitted_${requestId}_${uid}`);
        batch.set(notificationRef, {
            type: 'student_documents.submitted',
            status: 'active',
            destinataireId: uid,
            dateCreation: now,
            updatedAt: now,
            requestId,
            studentUid,
            studentName,
            studentEmail,
            documentCount: submittedItems.length,
            courseId: studentUid,
            courseTitle: `Documents à vérifier - ${studentName}`,
            auteurName: studentName,
            dismissedBy: [],
            resolvedAt: admin.firestore.FieldValue.delete(),
            resolvedBy: admin.firestore.FieldValue.delete()
        }, { merge: true });
    });
    await batch.commit();
}

async function resolveStudentDocumentRequestNotifications(db, requestId) {
    if (!requestId) return;
    const snap = await db.collection('notifications')
        .where('type', '==', 'student_documents.submitted')
        .where('requestId', '==', requestId)
        .get();
    if (snap.empty) return;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    snap.forEach((docSnap) => {
        batch.set(docSnap.ref, {
            status: 'resolved',
            resolvedAt: now,
            updatedAt: now
        }, { merge: true });
    });
    await batch.commit();
}

function buildStudentDocumentApprovedMessageHtml({ studentName }) {
    return `
        <p style="margin:0 0 16px 0;">Tes documents ont bien été reçus et validés par l’équipe SBI.</p>
        <div style="padding:14px 16px;border:1px solid #dce4f2;background:#f7f9fd;border-radius:12px;color:#253047;line-height:1.7;margin:18px 0;">
            Ton dossier administratif est à jour pour cette demande.
        </div>
        <p style="margin:0;color:#667085;font-size:14px;line-height:22px;">Si l’équipe SBI a besoin d’un complément plus tard, tu recevras une nouvelle demande dédiée.</p>`;
}

function buildStudentDocumentRejectedMessageHtml({ rejectedItems, requestLink, note }) {
    const list = rejectedItems.map((item) => `
        <li style="margin:0 0 10px 0;">
            <strong>${escapeHtml(item.title || 'Document demandé')}</strong>
            ${item.reviewNote ? `<br><span style="color:#667085;">${escapeHtml(item.reviewNote)}</span>` : ''}
        </li>`).join('');
    return `
        <p style="margin:0 0 16px 0;">Nous avons vérifié les documents transmis. Certains éléments doivent être renvoyés ou corrigés.</p>
        <div style="padding:14px 16px;border:1px solid #dce4f2;background:#f7f9fd;border-radius:12px;color:#253047;line-height:1.7;margin:18px 0;">
            <strong style="color:#101828;">Documents à refaire</strong>
            <ul style="margin:12px 0 0 18px;padding:0;">${list}</ul>
        </div>
        ${note ? `<div style="padding:14px 16px;border:1px solid #dce4f2;background:#fff;border-radius:12px;color:#253047;line-height:1.7;margin:18px 0;"><strong style="color:#101828;">Message SBI</strong><br>${escapeHtmlMultiline(note)}</div>` : ''}
        <p style="margin:22px 0;text-align:center;">
            <a href="${escapeHtml(requestLink)}" style="display:inline-block;background:#0051ff;color:#ffffff;font-weight:bold;padding:13px 20px;border-radius:999px;text-decoration:none;">Renvoyer les documents</a>
        </p>
        <p style="margin:0;color:#667085;font-size:14px;line-height:22px;">Le même lien reste utilisable pour déposer uniquement les pièces à refaire.</p>`;
}

async function sendStudentDocumentReviewResultEmail({ student, requestData, rejectedItems, note, apiKey }) {
    const email = cleanEmail(student.email || requestData.studentEmail || '');
    if (!isValidEmail(email)) throw new Error('Email élève invalide.');
    const studentName = getAccountDisplayName(student) || requestData.studentName || email;
    const hasRejected = Array.isArray(rejectedItems) && rejectedItems.length > 0;
    const requestLink = requestData.requestLink || buildStudentDocumentRequestLink(requestData.id || requestData.requestId || '');
    const htmlContent = renderSbiEmailTemplate({
        prenom: student.prenom || studentName || 'à toi',
        messageHtml: hasRejected
            ? buildStudentDocumentRejectedMessageHtml({ rejectedItems, requestLink, note })
            : buildStudentDocumentApprovedMessageHtml({ studentName }),
        nomExpediteur: 'L’équipe SBI',
        posteExpediteur: 'Service administratif',
        preheader: hasRejected ? 'Certains documents SBI sont à renvoyer.' : 'Tes documents SBI ont été validés.'
    });
    return sendBrevoEmail({
        sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
        to: [{ email, name: studentName || email }],
        subject: hasRejected ? 'SBI - Documents à corriger pour ton dossier' : 'SBI - Documents validés pour ton dossier',
        htmlContent,
        textContent: hasRejected
            ? [
                `Bonjour ${student.prenom || ''},`, '',
                'Certains documents doivent être corrigés ou renvoyés :',
                ...rejectedItems.map((item) => `- ${item.title}${item.reviewNote ? ` : ${item.reviewNote}` : ''}`),
                note ? `Message SBI : ${note}` : '',
                `Lien : ${requestLink}`, '', 'Bien cordialement,', 'L’équipe SBI'
            ].filter(Boolean).join('\n')
            : [`Bonjour ${student.prenom || ''},`, '', 'Tes documents ont bien été reçus et validés par l’équipe SBI.', '', 'Bien cordialement,', 'L’équipe SBI'].join('\n')
    }, apiKey);
}

exports.studentNotifyDocumentRequestSubmitted = onCall({
    region: 'europe-west1',
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: '256MiB'
}, async (request) => {
    const uid = request.auth?.uid || '';
    if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');

    const db = admin.firestore();
    const requestId = cleanString(request.data?.requestId || request.data?.id || '', 180);
    if (!requestId) throw new HttpsError('invalid-argument', 'Identifiant de demande manquant.');

    const requestRef = db.collection('studentDocumentRequests').doc(requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) throw new HttpsError('not-found', 'Demande introuvable.');

    let requestData = requestDoc.data() || {};
    if (cleanString(requestData.studentUid || '', 160) !== uid) {
        throw new HttpsError('permission-denied', 'Cette demande ne correspond pas au compte connecté.');
    }

    if (isStudentDocumentRequestPastExpiry(requestData)) {
        requestData = await markStudentDocumentRequestExpired(requestDoc.ref, requestData);
        await resolveStudentDocumentRequestNotifications(db, requestId).catch(() => {});
    }

    const items = Array.isArray(requestData.items) ? requestData.items.map(serializeStudentDocumentRequestItem) : [];
    const completed = items.length > 0 && items.every((item) => item.required === false || item.status === 'submitted' || item.status === 'validated');
    if (!completed) {
        throw new HttpsError('failed-precondition', 'Tous les documents obligatoires ne sont pas encore transmis.');
    }

    if (requestData.adminNotifiedAt && !requestData.adminNotificationWarning) {
        return { success: true, alreadyNotified: true, message: 'Notification déjà envoyée.' };
    }

    const studentDoc = await db.collection('users').doc(uid).get();
    const student = studentDoc.exists ? (studentDoc.data() || {}) : { email: requestData.studentEmail || '', prenom: '', nom: '' };
    const submittedItems = items.filter((item) => item.status === 'submitted' || item.status === 'validated');
    const apiKey = BREVO_API_KEY.value();
    let warning = '';

    try {
        if (!apiKey) throw new Error('BREVO_API_KEY manquant.');
        await sendStudentDocumentSubmittedAdminEmail({
            student,
            requestData: { ...requestData, id: requestId, requestId, studentUid: uid },
            submittedItems,
            apiKey
        });
    } catch (error) {
        warning = 'Documents reçus, mais l’email interne n’a pas pu être envoyé.';
        console.error('Erreur notification documents reçus SBI :', error.message, error.payload || '');
    }

    await requestRef.set({
        status: 'submitted',
        adminNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminNotificationWarning: warning,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: 'student_documents.submitted',
        actorUid: uid,
        actorEmail: cleanEmail(student.email || requestData.studentEmail || ''),
        targetUid: uid,
        targetEmail: cleanEmail(student.email || requestData.studentEmail || ''),
        targetRole: student.role || 'student',
        changes: {
            documents: {
                requestId,
                submitted: submittedItems.map((item) => item.title),
                submittedCount: submittedItems.length,
                requestedCount: items.length
            }
        },
        emailSent: !warning
    });

    try {
        await createStudentDocumentSubmittedAdminNotifications(db, {
            requestId,
            studentUid: uid,
            student,
            requestData: { ...requestData, id: requestId, requestId, studentUid: uid },
            submittedItems
        });
    } catch (error) {
        console.error('Erreur notification admin documents reçus SBI :', error.message || error);
    }

    return { success: true, warning, message: warning || 'Notification envoyée.' };
});


exports.adminCancelStudentDocumentRequest = onCall({
    region: 'europe-west1',
    timeoutSeconds: 20,
    memory: '256MiB'
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const requestId = cleanString(request.data?.requestId || request.data?.id || '', 180);
    if (!requestId) throw new HttpsError('invalid-argument', 'Identifiant de demande manquant.');

    const requestRef = db.collection('studentDocumentRequests').doc(requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) throw new HttpsError('not-found', 'Demande introuvable.');

    const requestData = requestDoc.data() || {};
    const studentUid = cleanString(requestData.studentUid || '', 160);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await requestRef.set({
        status: 'canceled',
        canceledAt: now,
        canceledBy: caller.uid,
        canceledByEmail: caller.email,
        cleanupAt: buildFutureTimestamp(STUDENT_DOCUMENT_REQUEST_CLOSED_RETENTION_DAYS),
        requestExpiresAt: admin.firestore.FieldValue.delete(),
        updatedAt: now
    }, { merge: true });

    await resolveStudentDocumentRequestNotifications(db, requestId);

    await safeWriteAccountAuditLog(db, {
        type: 'student_documents.request_canceled',
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: studentUid,
        targetEmail: cleanEmail(requestData.studentEmail || ''),
        targetRole: 'student',
        changes: { documents: { requestId, status: 'canceled' } }
    });

    return { success: true, requestId, status: 'canceled', message: 'Demande annulée.' };
});

exports.adminLogStudentDocumentManualUpload = onCall({
    region: 'europe-west1',
    timeoutSeconds: 20,
    memory: '256MiB'
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const documentId = cleanString(request.data?.documentId || request.data?.id || '', 180);
    if (!documentId) throw new HttpsError('invalid-argument', 'Identifiant document manquant.');

    const documentSnap = await db.collection('studentDocuments').doc(documentId).get();
    if (!documentSnap.exists) throw new HttpsError('not-found', 'Document introuvable.');

    const documentData = documentSnap.data() || {};
    const studentUid = cleanString(documentData.studentUid || '', 160);
    let student = {};
    if (studentUid) {
        const studentDoc = await db.collection('users').doc(studentUid).get();
        student = studentDoc.exists ? (studentDoc.data() || {}) : {};
    }

    await safeWriteAccountAuditLog(db, {
        type: 'student_documents.document_uploaded_admin',
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: studentUid,
        targetEmail: cleanEmail(student.email || ''),
        targetRole: student.role || 'student',
        changes: {
            documents: {
                documentId,
                title: cleanString(documentData.title || documentData.fileName || '', 180),
                fileName: cleanString(documentData.fileName || '', 220),
                category: cleanString(documentData.category || '', 80),
                status: cleanString(documentData.status || 'active', 80)
            }
        }
    });

    return { success: true, documentId, message: 'Upload document enregistré dans le journal admin.' };
});

exports.adminArchiveStudentDocument = onCall({
    region: 'europe-west1',
    timeoutSeconds: 20,
    memory: '256MiB'
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const documentId = cleanString(request.data?.documentId || request.data?.id || '', 180);
    if (!documentId) throw new HttpsError('invalid-argument', 'Identifiant document manquant.');

    const documentRef = db.collection('studentDocuments').doc(documentId);
    const documentSnap = await documentRef.get();
    if (!documentSnap.exists) throw new HttpsError('not-found', 'Document introuvable.');

    const documentData = documentSnap.data() || {};
    const studentUid = cleanString(documentData.studentUid || '', 160);
    const now = admin.firestore.FieldValue.serverTimestamp();
    let student = {};
    if (studentUid) {
        const studentDoc = await db.collection('users').doc(studentUid).get();
        student = studentDoc.exists ? (studentDoc.data() || {}) : {};
    }

    await documentRef.set({
        status: 'archived',
        archivedAt: now,
        archivedBy: caller.uid,
        archivedByEmail: caller.email,
        updatedAt: now
    }, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: 'student_documents.document_archived',
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: studentUid,
        targetEmail: cleanEmail(student.email || ''),
        targetRole: student.role || 'student',
        changes: {
            documents: {
                documentId,
                title: cleanString(documentData.title || documentData.fileName || '', 180),
                fileName: cleanString(documentData.fileName || '', 220),
                status: 'archived'
            }
        }
    });

    return { success: true, documentId, status: 'archived', message: 'Document archivé.' };
});

exports.adminDeleteStudentDocument = onCall({
    region: 'europe-west1',
    timeoutSeconds: 25,
    memory: '256MiB'
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const documentId = cleanString(request.data?.documentId || request.data?.id || '', 180);
    if (!documentId) throw new HttpsError('invalid-argument', 'Identifiant document manquant.');

    const documentRef = db.collection('studentDocuments').doc(documentId);
    const documentSnap = await documentRef.get();
    if (!documentSnap.exists) throw new HttpsError('not-found', 'Document introuvable.');

    const documentData = documentSnap.data() || {};
    const studentUid = cleanString(documentData.studentUid || '', 160);
    const filePath = cleanString(documentData.filePath || '', 800);
    let student = {};
    if (studentUid) {
        const studentDoc = await db.collection('users').doc(studentUid).get();
        student = studentDoc.exists ? (studentDoc.data() || {}) : {};
    }

    if (filePath) {
        try {
            await admin.storage().bucket().file(filePath).delete();
        } catch (error) {
            const code = String(error?.code || error?.statusCode || '');
            const message = String(error?.message || '').toLowerCase();
            if (code !== '404' && !message.includes('not found') && !message.includes('no such object')) {
                throw new HttpsError('internal', 'Suppression du fichier Storage impossible.');
            }
        }
    }

    await documentRef.delete();

    await safeWriteAccountAuditLog(db, {
        type: 'student_documents.document_deleted',
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: studentUid,
        targetEmail: cleanEmail(student.email || ''),
        targetRole: student.role || 'student',
        changes: {
            documents: {
                documentId,
                title: cleanString(documentData.title || documentData.fileName || '', 180),
                fileName: cleanString(documentData.fileName || '', 220),
                filePath,
                status: 'deleted'
            }
        }
    });

    return { success: true, documentId, status: 'deleted', message: 'Document supprimé.' };
});

exports.adminReviewStudentDocumentRequest = onCall({
    region: 'europe-west1',
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 35,
    memory: '256MiB'
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const requestId = cleanString(request.data?.requestId || request.data?.id || '', 180);
    const decisions = Array.isArray(request.data?.decisions) ? request.data.decisions : [];
    const note = cleanMultiline(request.data?.note || '', 1200);
    if (!requestId) throw new HttpsError('invalid-argument', 'Identifiant de demande manquant.');
    if (!decisions.length) throw new HttpsError('invalid-argument', 'Aucune décision de vérification transmise.');

    const requestRef = db.collection('studentDocumentRequests').doc(requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) throw new HttpsError('not-found', 'Demande introuvable.');
    const requestData = requestDoc.data() || {};
    const currentStatus = cleanString(requestData.status || 'requested', 40).toLowerCase();
    if (['canceled', 'cancelled', 'archived', 'completed', 'validated'].includes(currentStatus)) {
        throw new HttpsError('failed-precondition', 'Cette demande n’est plus en attente de vérification.');
    }

    const studentUid = cleanString(requestData.studentUid || '', 160);
    if (!studentUid) throw new HttpsError('failed-precondition', 'UID élève manquant sur la demande.');
    const items = Array.isArray(requestData.items) ? requestData.items.map(serializeStudentDocumentRequestItem) : [];
    if (!items.length) throw new HttpsError('failed-precondition', 'Aucun document dans cette demande.');

    const decisionMap = new Map();
    decisions.slice(0, 50).forEach((decision) => {
        const index = Number(decision?.itemIndex);
        if (!Number.isInteger(index) || index < 0 || index >= items.length) return;
        decisionMap.set(index, {
            status: cleanString(decision?.status || 'rejected', 40).toLowerCase() === 'validated' ? 'validated' : 'rejected',
            documentId: cleanString(decision?.documentId || '', 180),
            note: cleanMultiline(decision?.note || '', 260)
        });
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();
    const batch = db.batch();
    const rejectedItems = [];
    const validatedItems = [];

    const nextItems = items.map((item, index) => {
        const decision = decisionMap.get(index) || { status: 'rejected', documentId: item.documentId || '', note: '' };
        const currentItemStatus = cleanString(item.status || '', 40).toLowerCase();
        const existingDocumentId = cleanString(item.documentId || decision.documentId || '', 180);
        const canValidate = decision.status === 'validated' && (existingDocumentId || currentItemStatus === 'validated');
        if (canValidate) {
            const nextItem = { ...item, status: 'validated', documentId: existingDocumentId, validatedAt: item.validatedAt || nowIso, validatedBy: caller.uid, validatedByEmail: caller.email, reviewNote: '' };
            validatedItems.push(nextItem);
            if (existingDocumentId) {
                batch.set(db.collection('studentDocuments').doc(existingDocumentId), { status: 'active', validationStatus: 'validated', validatedAt: now, validatedBy: caller.uid, validatedByEmail: caller.email, updatedAt: now }, { merge: true });
            }
            return nextItem;
        }
        const rejectedDocumentId = existingDocumentId;
        const nextItem = { ...item, status: 'pending', documentId: '', fileName: '', rejectedDocumentId, rejectedAt: nowIso, rejectedBy: caller.uid, rejectedByEmail: caller.email, reviewNote: decision.note || note || 'Document à renvoyer.' };
        rejectedItems.push(nextItem);
        if (rejectedDocumentId) {
            batch.set(db.collection('studentDocuments').doc(rejectedDocumentId), { status: 'rejected', validationStatus: 'rejected', rejectedAt: now, rejectedBy: caller.uid, rejectedByEmail: caller.email, rejectionNote: nextItem.reviewNote, updatedAt: now }, { merge: true });
        }
        return nextItem;
    });

    const completed = rejectedItems.length === 0 && nextItems.every((item) => item.required === false || item.status === 'validated');
    const nextStatus = completed ? 'completed' : 'partial';
    batch.set(requestRef, {
        status: nextStatus,
        items: nextItems,
        lastReviewedAt: now,
        lastReviewedBy: caller.uid,
        lastReviewedByEmail: caller.email,
        reviewNote: note,
        updatedAt: now,
        ...(completed
            ? {
                completedAt: now,
                validatedAt: now,
                validatedBy: caller.uid,
                validatedByEmail: caller.email,
                cleanupAt: buildFutureTimestamp(STUDENT_DOCUMENT_REQUEST_CLOSED_RETENTION_DAYS),
                requestExpiresAt: admin.firestore.FieldValue.delete()
            }
            : {
                adminNotifiedAt: admin.firestore.FieldValue.delete(),
                adminNotificationWarning: admin.firestore.FieldValue.delete(),
                completedAt: admin.firestore.FieldValue.delete(),
                validatedAt: admin.firestore.FieldValue.delete(),
                cleanupAt: admin.firestore.FieldValue.delete(),
                requestExpiresAt: buildFutureTimestamp(STUDENT_DOCUMENT_REQUEST_ACTIVE_DAYS)
            })
    }, { merge: true });

    await batch.commit();
    await resolveStudentDocumentRequestNotifications(db, requestId);

    const studentDoc = await db.collection('users').doc(studentUid).get();
    const student = studentDoc.exists ? (studentDoc.data() || {}) : { email: requestData.studentEmail || '' };
    const apiKey = BREVO_API_KEY.value();
    let warning = '';
    try {
        if (!apiKey) throw new Error('BREVO_API_KEY manquant.');
        await sendStudentDocumentReviewResultEmail({ student, requestData: { ...requestData, id: requestId, requestId, studentUid, items: nextItems }, rejectedItems, note, apiKey });
    } catch (error) {
        warning = completed ? 'Demande validée, mais l’email de confirmation élève n’a pas pu être envoyé.' : 'Vérification enregistrée, mais l’email de correction élève n’a pas pu être envoyé.';
        console.error('Erreur email vérification documents SBI :', error.message, error.payload || '');
    }

    await safeWriteAccountAuditLog(db, {
        type: completed ? 'student_documents.validated' : 'student_documents.partial_review',
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: studentUid,
        targetEmail: cleanEmail(student.email || requestData.studentEmail || ''),
        targetRole: student.role || 'student',
        changes: { documents: { requestId, status: nextStatus, validated: validatedItems.map((item) => item.title), rejected: rejectedItems.map((item) => item.title), validatedCount: validatedItems.length, rejectedCount: rejectedItems.length, requestedCount: items.length } },
        emailSent: !warning
    });

    return { success: true, requestId, status: nextStatus, rejectedCount: rejectedItems.length, validatedCount: validatedItems.length, warning, message: warning || (completed ? 'Demande validée.' : 'Documents à refaire redemandés à l’élève.') };
});


exports.cleanupStudentDocumentRequests = onSchedule({
    region: 'europe-west1',
    schedule: 'every day 03:20',
    timeZone: 'Europe/Paris',
    timeoutSeconds: 60,
    memory: '256MiB'
}, async () => {
    const db = admin.firestore();
    const nowTimestamp = admin.firestore.Timestamp.now();
    const now = admin.firestore.FieldValue.serverTimestamp();
    let expiredCount = 0;
    let deletedCount = 0;

    const expirableSnap = await db.collection('studentDocumentRequests')
        .where('requestExpiresAt', '<=', nowTimestamp)
        .limit(STUDENT_DOCUMENT_REQUEST_PURGE_BATCH_LIMIT)
        .get();

    if (!expirableSnap.empty) {
        const batch = db.batch();
        expirableSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const status = cleanString(data.status || 'requested', 40).toLowerCase();
            if (!isStudentDocumentRequestActiveStatus(status)) return;
            batch.set(docSnap.ref, {
                status: 'expired',
                expiredAt: now,
                cleanupAt: buildFutureTimestamp(STUDENT_DOCUMENT_REQUEST_CLOSED_RETENTION_DAYS),
                updatedAt: now
            }, { merge: true });
            expiredCount += 1;
        });
        if (expiredCount > 0) await batch.commit();
    }

    const cleanupSnap = await db.collection('studentDocumentRequests')
        .where('cleanupAt', '<=', nowTimestamp)
        .limit(STUDENT_DOCUMENT_REQUEST_PURGE_BATCH_LIMIT)
        .get();

    if (!cleanupSnap.empty) {
        const batch = db.batch();
        cleanupSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const status = cleanString(data.status || '', 40).toLowerCase();
            if (!isStudentDocumentRequestClosedStatus(status)) return;
            batch.delete(docSnap.ref);
            deletedCount += 1;
        });
        if (deletedCount > 0) await batch.commit();
    }

    console.log(`SBI cleanupStudentDocumentRequests: ${expiredCount} expirée(s), ${deletedCount} supprimée(s).`);
    return { expiredCount, deletedCount };
});


exports.adminCreateStudentDocumentRequest = onCall({
    region: 'europe-west1',
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: '256MiB'
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const data = request.data || {};
    const studentUid = cleanString(data.studentUid || data.uid || '', 160);
    const items = normalizeRequestedDocumentItems(data.documents || data.items || []);
    const note = cleanMultiline(data.note || '', 1200);

    if (!studentUid) throw new HttpsError('invalid-argument', 'UID élève manquant.');
    if (!items.length) throw new HttpsError('invalid-argument', 'Aucun document demandé.');

    const studentRef = db.collection('users').doc(studentUid);
    const studentDoc = await studentRef.get();
    if (!studentDoc.exists) throw new HttpsError('not-found', 'Compte élève introuvable.');

    const student = studentDoc.data() || {};
    const role = normalizeAccountRole(student.role);
    if (role !== 'student') {
        throw new HttpsError('failed-precondition', 'La demande de documents est disponible uniquement pour les comptes élèves.');
    }

    const requestRef = db.collection('studentDocumentRequests').doc();
    const requestLink = buildStudentDocumentRequestLink(requestRef.id);
    const createdAt = admin.firestore.FieldValue.serverTimestamp();

    await requestRef.set({
        studentUid,
        studentEmail: cleanEmail(student.email),
        studentName: getAccountDisplayName(student),
        status: 'requested',
        items,
        note,
        requestLink,
        requestExpiresAt: buildFutureTimestamp(STUDENT_DOCUMENT_REQUEST_ACTIVE_DAYS),
        createdAt,
        createdBy: caller.uid,
        createdByEmail: caller.email,
        updatedAt: createdAt,
        visibility: 'student'
    });

    const apiKey = BREVO_API_KEY.value();
    let warning = '';
    try {
        if (!apiKey) throw new Error('BREVO_API_KEY manquant.');
        await sendStudentDocumentRequestEmail({ student, items, requestLink, note, apiKey });
    } catch (error) {
        warning = 'Demande créée, mais l’email élève n’a pas pu être envoyé.';
        console.error('Erreur email demande documents SBI :', error.message, error.payload || '');
    }

    await safeWriteAccountAuditLog(db, {
        type: 'student_documents.requested',
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: studentUid,
        targetEmail: cleanEmail(student.email),
        targetRole: student.role || '',
        changes: {
            documents: {
                requested: items.map((item) => item.title),
                count: items.length,
                requestId: requestRef.id
            }
        }
    });

    return {
        success: true,
        requestId: requestRef.id,
        requestLink,
        warning,
        message: warning || 'Demande de documents envoyée.'
    };
});

/* ============================================================
   DEVOIRS & ÉVALUATIONS — 8.0P.167.273
   ------------------------------------------------------------
   - createOrUpdateAssignment    : création/édition (prof → pending_validation,
     admin → publication directe possible).
   - validateAssignment          : validation admin (approve / reject / archive).
   - correctAssignmentSubmission : correction d'un dépôt (prof de la formation
     ou admin) ; feedback + note (si évaluation).
   - notifyAssignmentToProfs     : email Brevo aux profs de la formation après le
     dépôt d'un élève (déclenché par l'élève après son dépôt).
   ============================================================ */

const ASSIGNMENT_ROLES_STUDENT = ["student", "eleve", "élève", "etudiant", "étudiant"];

function callerTeachesFormation(callerData, formationData, callerUid, formationId) {
    const profs = Array.isArray(formationData && formationData.profs) ? formationData.profs : [];
    const fIds = Array.isArray(callerData && callerData.formationIds) ? callerData.formationIds : [];
    return profs.includes(callerUid) || fIds.includes(formationId);
}

exports.createOrUpdateAssignment = onCall({
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    if (!caller.isAdmin && !caller.isTeacher) {
        throw new HttpsError("permission-denied", "Seuls les professeurs et administrateurs peuvent créer un devoir.");
    }

    const data = request.data || {};
    const assignmentId = cleanString(data.assignmentId, 200);
    const kind = data.kind === "evaluation" ? "evaluation" : "devoir";
    const title = cleanString(data.title, 200);
    const consigne = cleanString(data.consigne, 8000);
    const formationId = cleanString(data.formationId, 200);
    const promotionId = cleanString(data.promotionId, 200);
    const dueAt = cleanString(data.dueAt, 40);
    const fileMode = data.submissionMode && data.submissionMode.file !== false;
    const textMode = data.submissionMode && data.submissionMode.text === true;
    const isQualiopiEvidence = data.isQualiopiEvidence === true;

    if (!title) throw new HttpsError("invalid-argument", "Le titre est obligatoire.");
    if (!formationId) throw new HttpsError("invalid-argument", "La formation est obligatoire.");
    if (!fileMode && !textMode) throw new HttpsError("invalid-argument", "Au moins un mode de dépôt (fichier ou texte) est requis.");

    let gradeMax = null;
    if (kind === "evaluation") {
        gradeMax = Number(data.gradeMax);
        if (!Number.isFinite(gradeMax) || gradeMax <= 0 || gradeMax > 1000) gradeMax = 20;
    }

    const formationDoc = await db.collection("formations").doc(formationId).get();
    if (!formationDoc.exists) throw new HttpsError("not-found", "Formation introuvable.");
    const formation = formationDoc.data() || {};
    const formationName = cleanString(formation.titre || formation.nom || formation.name || "", 200);

    if (!caller.isAdmin && !callerTeachesFormation(caller.data, formation, caller.uid, formationId)) {
        throw new HttpsError("permission-denied", "Vous n'enseignez pas dans cette formation.");
    }

    let promotionName = "";
    if (promotionId) {
        const promoDoc = await db.collection("promotions").doc(promotionId).get();
        if (!promoDoc.exists) throw new HttpsError("not-found", "Promotion introuvable.");
        const promo = promoDoc.data() || {};
        const promoFormationId = cleanString(promo.formationId || "", 200);
        if (promoFormationId && promoFormationId !== formationId) {
            throw new HttpsError("failed-precondition", "La promotion ne correspond pas à la formation.");
        }
        promotionName = cleanString(promo.nom || promo.titre || promo.name || "", 200);
    }

    const requestedStatus = cleanString(data.status, 40);
    let status;
    if (caller.isAdmin) {
        status = ["draft", "pending_validation", "published", "archived"].includes(requestedStatus) ? requestedStatus : "published";
    } else {
        status = requestedStatus === "draft" ? "draft" : "pending_validation";
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const base = {
        kind,
        title,
        consigne,
        formationId,
        formationName,
        promotionId: promotionId || "",
        promotionName,
        dueAt,
        submissionMode: { file: fileMode, text: textMode },
        gradeMax,
        isQualiopiEvidence,
        status,
        updatedAt: now
    };

    let ref;
    if (assignmentId) {
        ref = db.collection("assignments").doc(assignmentId);
        const snap = await ref.get();
        if (!snap.exists) throw new HttpsError("not-found", "Devoir introuvable.");
        const existing = snap.data() || {};
        if (!caller.isAdmin) {
            if (existing.createdBy !== caller.uid) {
                throw new HttpsError("permission-denied", "Vous ne pouvez modifier que vos propres devoirs.");
            }
            if (!["draft", "rejected"].includes(existing.status)) {
                throw new HttpsError("failed-precondition", "Ce devoir est déjà soumis ou publié : modification impossible.");
            }
        }
        if (status === "pending_validation" || status === "published") {
            base.rejectionReason = "";
        }
        await ref.set(base, { merge: true });
    } else {
        ref = db.collection("assignments").doc();
        await ref.set({
            ...base,
            createdBy: caller.uid,
            createdByRole: caller.isAdmin ? "admin" : "teacher",
            createdByName: caller.name,
            createdAt: now
        });
    }

    await safeWriteAccountAuditLog(db, {
        type: "assignment.upserted",
        actorUid: caller.uid,
        actorEmail: caller.email,
        changes: { assignmentId: ref.id, kind, status, formationId, title },
        source: "assignments"
    });

    return { success: true, assignmentId: ref.id, status };
});

exports.validateAssignment = onCall({
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireAdminCaller(request, db);
    const data = request.data || {};
    const assignmentId = cleanString(data.assignmentId, 200);
    const decision = ["approve", "reject", "archive", "republish"].includes(data.decision) ? data.decision : "approve";
    const rejectionReason = cleanString(data.rejectionReason, 1000);
    if (!assignmentId) throw new HttpsError("invalid-argument", "Devoir manquant.");

    const ref = db.collection("assignments").doc(assignmentId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Devoir introuvable.");

    const statusMap = { approve: "published", reject: "rejected", archive: "archived", republish: "published" };
    const status = statusMap[decision];
    const now = admin.firestore.FieldValue.serverTimestamp();

    await ref.set({
        status,
        validatedBy: caller.uid,
        validatedByName: caller.name,
        validatedAt: now,
        rejectionReason: decision === "reject" ? rejectionReason : "",
        updatedAt: now
    }, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: "assignment.validated",
        actorUid: caller.uid,
        actorEmail: caller.email,
        changes: { assignmentId, decision, status },
        source: "assignments"
    });

    return { success: true, status };
});

exports.correctAssignmentSubmission = onCall({
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    if (!caller.isAdmin && !caller.isTeacher) {
        throw new HttpsError("permission-denied", "Seuls les professeurs et administrateurs peuvent corriger.");
    }

    const data = request.data || {};
    const submissionId = cleanString(data.submissionId, 400);
    if (!submissionId) throw new HttpsError("invalid-argument", "Dépôt manquant.");

    const ref = db.collection("assignmentSubmissions").doc(submissionId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Dépôt introuvable.");
    const sub = snap.data() || {};
    const formationId = cleanString(sub.formationId || "", 200);

    if (!caller.isAdmin) {
        const formationDoc = formationId ? await db.collection("formations").doc(formationId).get() : null;
        const formation = formationDoc && formationDoc.exists ? formationDoc.data() : {};
        if (!callerTeachesFormation(caller.data, formation, caller.uid, formationId)) {
            throw new HttpsError("permission-denied", "Vous ne pouvez pas corriger ce dépôt.");
        }
    }

    const feedback = cleanString(data.feedback, 8000);
    let gradeMax = Number(sub.gradeMax);
    if (!Number.isFinite(gradeMax) || gradeMax <= 0) {
        const aSnap = await db.collection("assignments").doc(cleanString(sub.assignmentId || "", 200)).get();
        gradeMax = aSnap.exists ? Number(aSnap.data().gradeMax) : null;
        if (!Number.isFinite(gradeMax) || gradeMax <= 0) gradeMax = null;
    }

    let note = null;
    const rawNote = data.note;
    if (rawNote !== undefined && rawNote !== null && String(rawNote).trim() !== "") {
        note = Number(rawNote);
        const cap = gradeMax || 20;
        if (!Number.isFinite(note) || note < 0 || note > cap) {
            throw new HttpsError("invalid-argument", `La note doit être comprise entre 0 et ${cap}.`);
        }
    }

    if (!feedback && note === null) {
        throw new HttpsError("invalid-argument", "Ajoutez au moins un retour ou une note.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set({
        status: "corrected",
        correction: {
            feedback,
            note,
            gradeMax: gradeMax || null,
            correctedBy: caller.uid,
            correctedByName: caller.name,
            correctedAt: now
        },
        updatedAt: now
    }, { merge: true });

    await safeWriteAccountAuditLog(db, {
        type: "assignment.corrected",
        actorUid: caller.uid,
        actorEmail: caller.email,
        targetUid: cleanString(sub.studentUid || "", 200),
        changes: { submissionId, assignmentId: sub.assignmentId, note },
        source: "assignments"
    });

    return { success: true };
});

exports.notifyAssignmentToProfs = onCall({
    region: "europe-west1",
    secrets: [BREVO_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const db = admin.firestore();
    const caller = await requireActiveCourseCaller(request, db);
    const data = request.data || {};
    const assignmentId = cleanString(data.assignmentId, 200);
    if (!assignmentId) throw new HttpsError("invalid-argument", "Devoir manquant.");

    const submissionId = `${assignmentId}_${caller.uid}`;
    const subSnap = await db.collection("assignmentSubmissions").doc(submissionId).get();
    if (!subSnap.exists) throw new HttpsError("not-found", "Dépôt introuvable.");
    const sub = subSnap.data() || {};
    if (sub.studentUid !== caller.uid) {
        throw new HttpsError("permission-denied", "Ce dépôt ne vous appartient pas.");
    }

    const aSnap = await db.collection("assignments").doc(assignmentId).get();
    const assignment = aSnap.exists ? (aSnap.data() || {}) : {};
    const formationId = cleanString(assignment.formationId || sub.formationId || "", 200);
    const formationDoc = formationId ? await db.collection("formations").doc(formationId).get() : null;
    const profs = formationDoc && formationDoc.exists && Array.isArray(formationDoc.data().profs)
        ? formationDoc.data().profs.slice(0, 25)
        : [];

    const recipients = [];
    for (const profUid of profs) {
        try {
            const pdoc = await db.collection("users").doc(profUid).get();
            if (!pdoc.exists) continue;
            const p = pdoc.data() || {};
            if (p.statut === "suspendu") continue;
            const e = cleanString(p.email || "", 180);
            if (e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
                recipients.push({ email: e, name: `${p.prenom || ""} ${p.nom || ""}`.trim() || e });
            }
        } catch (error) {
            console.warn("[SBI Assignment Notify] prof ignoré", profUid, error && error.message ? error.message : error);
        }
    }

    if (!recipients.length) {
        return { success: true, notified: 0, message: "Aucun professeur à notifier." };
    }

    const kindLabel = assignment.kind === "evaluation" ? "évaluation" : "devoir";
    const studentName = cleanString(sub.studentName || caller.name || "Un élève", 180);
    const title = cleanString(assignment.title || "Devoir", 200);
    const messageHtml = `
        <p><strong>${escapeHtml(studentName)}</strong> vient de déposer son travail pour ${escapeHtml(kindLabel)} :</p>
        <p style="font-size:16px;"><strong>${escapeHtml(title)}</strong>${assignment.formationName ? ` — ${escapeHtml(assignment.formationName)}` : ""}</p>
        <p>Connecte-toi à ton espace professeur SBI, onglet « Devoirs &amp; Évaluations » → « À corriger », pour consulter le dépôt et le corriger.</p>
    `;
    const textContent = `${studentName} a déposé son travail pour ${kindLabel} : ${title}.\nConnecte-toi à ton espace professeur SBI (Devoirs & Évaluations -> À corriger) pour le corriger.`;

    try {
        await sendBrevoTransactionalEmail({
            sender: { name: SBI_SENDER_NAME, email: SBI_SENDER_EMAIL },
            to: recipients,
            replyTo: { name: "Sport Business Institute", email: SBI_CONTACT_EMAIL },
            subject: `SBI — nouveau dépôt à corriger : ${title}`,
            htmlContent: renderSbiEmailTemplate({
                prenom: "",
                nomExpediteur: "Le suivi pédagogique SBI",
                posteExpediteur: "Suivi pédagogique",
                preheader: `${studentName} a déposé son travail pour « ${title} ».`,
                messageHtml
            }),
            textContent
        }, BREVO_API_KEY.value(), ["sbi_assignment_submitted"]);
    } catch (error) {
        console.error("[SBI Assignment Notify] Brevo erreur :", error && error.message ? error.message : error);
        return { success: false, notified: 0, message: "Dépôt enregistré, mais l'email aux professeurs n'a pas pu partir." };
    }

    return { success: true, notified: recipients.length };
});
