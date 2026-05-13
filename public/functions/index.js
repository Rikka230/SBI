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
const BREVO_NEWSLETTER_LIST_ID = 77;
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
 * SBI 8.0P.131 - ADMIN ACCOUNT MAIL WORKFLOW
 * -----------------------------------------------------------------------
 * Actions sensibles Auth déplacées côté serveur : création compte,
 * reset password et suppression enrichie avec mails Brevo + audit.
 * ======================================================================= */

const ACCOUNT_ROLES = ["student", "teacher", "admin"];

function cleanEmail(value) {
    return cleanString(value, 180).toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
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
            source: "admin",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Erreur audit compte SBI :", error.message);
    }
}

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

function mapAuthCreateError(error) {
    if (error?.code === "auth/email-already-exists") {
        return new HttpsError("already-exists", "Un compte Firebase Auth utilise déjà cette adresse email.");
    }
    if (error?.code === "auth/invalid-email") {
        return new HttpsError("invalid-argument", "L'adresse email n'est pas valide.");
    }
    return new HttpsError("internal", `Création Auth impossible : ${error.message}`);
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
        formationsAcces: []
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
        const resetLink = await admin.auth().generatePasswordResetLink(email);
        await sendAccountInviteEmail(accountData, resetLink, apiKey);
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
        const resetLink = await admin.auth().generatePasswordResetLink(email);
        await sendAccountResetEmail({ ...targetData, email }, resetLink, apiKey);
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

