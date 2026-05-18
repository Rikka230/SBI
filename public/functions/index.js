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
const BREVO_LIST_ID = 77;
const BREVO_NEWSLETTER_LIST_ID = 77;
const SBI_CONTACT_EMAIL = "contact@sbigroup.fr";
const SBI_CONTACT_PHONE = "06 68 60 30 01";
const SBI_SENDER_NAME = "Contact";
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

    const existingUserByEmail = await db.collection("users").where("email", "==", email).limit(1).get();
    if (!existingUserByEmail.empty) {
        throw new HttpsError("already-exists", "Un document utilisateur existe déjà avec cette adresse email.");
    }

    let createdUser = null;
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
        const firebaseResetLink = await admin.auth().generatePasswordResetLink(email, SBI_AUTH_ACTION_SETTINGS);
        const resetLink = buildSbiPasswordResetLink(firebaseResetLink);
        await sendAccountInviteEmail(accountData, resetLink, apiKey);
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

    return {
        success: true,
        uid: createdUser.uid,
        email,
        warning,
        message: warning || "Compte créé. Email d’invitation envoyé."
    };
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
        const firebaseResetLink = await admin.auth().generatePasswordResetLink(email, SBI_AUTH_ACTION_SETTINGS);
        const finalizationLink = buildSbiPasswordResetLink(firebaseResetLink);
        await sendAccountFinalizationEmail({ ...targetData, email }, finalizationLink, apiKey);

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
            const firebaseResetLink = await admin.auth().generatePasswordResetLink(email, SBI_AUTH_ACTION_SETTINGS);
            const finalizationLink = buildSbiPasswordResetLink(firebaseResetLink);

            await sendAccountFinalizationEmail({ ...userData, email }, finalizationLink, apiKey);

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

    const onboardingUpdate = {
        "accountStatus.activationState": "active",
        "accountStatus.lastLoginAt": now,
        "accountStatus.firstLoginCompleted": true,
        "accountStatus.firstLoginCompletedAt": now,
        "accountStatus.firstLoginChecklistVersion": checklistVersion,
        "accountStatus.termsAccepted": true,
        "accountStatus.termsAcceptedAt": now,
        "accountStatus.rulesAccepted": true,
        "accountStatus.rulesAcceptedAt": now,
        "accountStatus.importantInfoAccepted": true,
        "accountStatus.importantInfoAcceptedAt": now,
        "accountStatus.emailConfirmed": true,
        "accountStatus.emailConfirmedAt": now,
        lastLoginAt: now,
        updatedAt: now
    };

    if (!hasFirstLogin) {
        onboardingUpdate["accountStatus.firstLoginAt"] = now;
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
