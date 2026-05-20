/**
 * =======================================================================
 * SBI 8.0P.167.126 — Durable finalization links, no silent Firebase fallback
 * -----------------------------------------------------------------------
 * Wrapper d'entrée Cloud Functions.
 *
 * Objectif :
 * - conserver toutes les exports historiques de index.js ;
 * - intercepter generatePasswordResetLink pour les comptes non finalisés ;
 * - générer un lien SBI durable utilisable tant que le mot de passe
 *   initial n'a pas été créé ;
 * - laisser les resets classiques Firebase inchangés pour les comptes actifs.
 * =======================================================================
 */

const crypto = require("crypto");
const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

const SBI_SITE_URL = "https://www.sbigroup.fr";
const SBI_PASSWORD_RESET_URL = `${SBI_SITE_URL}/password-reset.html`;
const SBI_FINALIZATION_TOKEN_COLLECTION = "accountFinalizationTokens";
const SBI_FINALIZATION_TOKEN_PURPOSE = "initial_password";
const SBI_FINALIZATION_TOKEN_MODE = "finalizeAccount";
const SBI_FINALIZATION_PROCESSING_TTL_MS = 10 * 60 * 1000;
const SBI_MIN_PASSWORD_LENGTH = 8;

function cleanString(value, maxLength = 1000) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanEmail(value) {
    return cleanString(value, 180).toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function getTimestampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value.seconds === "number") return value.seconds * 1000;
    return 0;
}

function getAccountDisplayName(data = {}) {
    return cleanString(`${data.prenom || ""} ${data.nom || ""}`, 160)
        || data.displayName
        || data.email
        || "Utilisateur SBI";
}

function isAccountFinalized(accountData = {}) {
    const status = accountData.accountStatus || {};
    const activationState = cleanString(status.activationState || accountData.activationState || "", 80).toLowerCase();

    return Boolean(
        status.firstLoginAt
        || accountData.firstLoginAt
        || status.finalizationPasswordSetAt
        || status.passwordCreatedAt
        || status.activationState === "active"
        || accountData.activationState === "active"
        || activationState === "active"
    );
}

function shouldUseDurableFinalizationLink(accountData = {}) {
    if (!accountData || accountData.statut === "suspendu") return false;
    if (isAccountFinalized(accountData)) return false;

    const status = accountData.accountStatus || {};
    const activationState = cleanString(status.activationState || accountData.activationState || "", 80).toLowerCase();

    return !activationState || activationState === "pending_password";
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

async function safeWriteDurableFinalizationAuditLog(db, payload) {
    try {
        await db.collection("accountAuditLogs").add({
            ...payload,
            source: payload.source || "durable-finalization-link",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("[SBI Durable Finalization] Audit impossible :", error.message || error);
    }
}

async function createDurableFinalizationLinkForEmail({ authInstance, email, source = "generatePasswordResetLink" }) {
    const normalizedEmail = cleanEmail(email);
    if (!isValidEmail(normalizedEmail)) return "";

    const authUser = await authInstance.getUserByEmail(normalizedEmail);
    const uid = authUser?.uid || "";
    if (!uid) return "";

    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return "";

    const userData = userSnap.data() || {};
    if (!shouldUseDurableFinalizationLink(userData)) return "";

    const rawToken = createRawFinalizationToken();
    const tokenHash = hashFinalizationToken(rawToken);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const finalizationUrl = buildDurableFinalizationUrl(rawToken);

    try {
        await db.collection(SBI_FINALIZATION_TOKEN_COLLECTION).doc(tokenHash).set({
            uid,
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

        await userRef.set({
            accountStatus: {
                ...(userData.accountStatus || {}),
                activationState: "pending_password",
                finalizationLinkMode: "durable_token",
                finalizationTokenLastSentAt: now,
                finalizationTokenIssueCount: admin.firestore.FieldValue.increment(1)
            },
            updatedAt: now
        }, { merge: true });

        await safeWriteDurableFinalizationAuditLog(db, {
            type: "account.finalization_token_created",
            actorUid: "system",
            actorEmail: source,
            targetUid: uid,
            targetEmail: normalizedEmail,
            targetRole: userData.role || "",
            source
        });

        return finalizationUrl;
    } catch (error) {
        error.sbiPreventFirebaseFallback = true;
        throw error;
    }
}

function patchAuthInstance(authInstance) {
    if (!authInstance || authInstance.__sbiDurableFinalizationPatched === true) {
        return authInstance;
    }

    const originalGeneratePasswordResetLink = authInstance.generatePasswordResetLink.bind(authInstance);

    authInstance.generatePasswordResetLink = async (email, actionCodeSettings) => {
        try {
            const durableLink = await createDurableFinalizationLinkForEmail({
                authInstance,
                email,
                source: "patched-generatePasswordResetLink"
            });

            if (durableLink) return durableLink;
        } catch (error) {
            if (error?.sbiPreventFirebaseFallback === true) {
                console.error("[SBI Durable Finalization] ERREUR BLOQUANTE : aucun lien Firebase court ne sera envoyé pour une finalisation initiale.", error.message || error);
                throw error;
            }

            console.error("[SBI Durable Finalization] Fallback lien Firebase classique réservé aux resets actifs :", error.message || error);
        }

        return originalGeneratePasswordResetLink(email, actionCodeSettings);
    };

    Object.defineProperty(authInstance, "__sbiDurableFinalizationPatched", {
        value: true,
        enumerable: false,
        configurable: false
    });

    return authInstance;
}

const originalAdminAuthFactory = admin.auth.bind(admin);
admin.auth = function sbiPatchedAuth(app) {
    return patchAuthInstance(originalAdminAuthFactory(app));
};

// Charge toutes les Functions historiques après patch de admin.auth().
Object.assign(exports, require("./index.js"));

async function readValidFinalizationToken(rawToken, { reserve = false } = {}) {
    const token = cleanString(rawToken, 500);
    if (!token) {
        throw new HttpsError("invalid-argument", "Token de finalisation manquant.");
    }

    const tokenHash = hashFinalizationToken(token);
    const db = admin.firestore();
    const tokenRef = db.collection(SBI_FINALIZATION_TOKEN_COLLECTION).doc(tokenHash);

    if (!reserve) {
        const tokenSnap = await tokenRef.get();
        if (!tokenSnap.exists) {
            throw new HttpsError("not-found", "Lien de finalisation introuvable ou déjà remplacé.");
        }

        const tokenData = tokenSnap.data() || {};
        await assertTokenDataIsUsable(db, tokenRef, tokenData);
        return { tokenRef, tokenData };
    }

    return db.runTransaction(async (transaction) => {
        const tokenSnap = await transaction.get(tokenRef);
        if (!tokenSnap.exists) {
            throw new HttpsError("not-found", "Lien de finalisation introuvable ou déjà remplacé.");
        }

        const tokenData = tokenSnap.data() || {};
        await assertTokenDataIsUsable(db, tokenRef, tokenData, { transaction });

        transaction.set(tokenRef, {
            status: "processing",
            processingAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return { tokenRef, tokenData };
    });
}

async function assertTokenDataIsUsable(db, tokenRef, tokenData = {}, { transaction = null } = {}) {
    if (tokenData.purpose !== SBI_FINALIZATION_TOKEN_PURPOSE) {
        throw new HttpsError("failed-precondition", "Lien de finalisation invalide.");
    }

    const status = cleanString(tokenData.status || "", 80).toLowerCase();
    const processingAgeMs = Date.now() - getTimestampMillis(tokenData.processingAt);
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
    const userSnap = transaction
        ? await transaction.get(userRef)
        : await userRef.get();

    if (!userSnap.exists) {
        throw new HttpsError("not-found", "Compte utilisateur introuvable.");
    }

    const userData = userSnap.data() || {};
    if (userData.statut === "suspendu") {
        throw new HttpsError("permission-denied", "Compte suspendu. Contactez l’équipe SBI.");
    }

    if (isAccountFinalized(userData)) {
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
    tokenData.userRefPath = userRef.path;
}

async function revokeOtherFinalizationTokens(db, uid, currentTokenRef) {
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

exports.verifyInitialPasswordToken = onCall({
    region: "europe-west1",
    timeoutSeconds: 15,
    memory: "256MiB"
}, async (request) => {
    const token = cleanString(request.data?.token || "", 500);
    const { tokenData } = await readValidFinalizationToken(token, { reserve: false });
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
    const { tokenRef, tokenData } = await readValidFinalizationToken(token, { reserve: true });
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

        await revokeOtherFinalizationTokens(db, uid, tokenRef).catch((error) => {
            console.error("[SBI Durable Finalization] Révocation tokens frères impossible :", error.message || error);
        });

        await safeWriteDurableFinalizationAuditLog(db, {
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
