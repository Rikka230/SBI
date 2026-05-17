/**
 * =======================================================================
 * LOGIQUE DU BACK-OFFICE ADMIN (Vanilla JS)
 * =======================================================================
 */

import { logoutUser } from '/js/auth.js?v=8.0P.167.44';
import { db, auth, app } from '/js/firebase-init.js';
import {
    collection,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

const functionsInstance = getFunctions(app, "europe-west1");


let allUsersData = [];
let currentUid = null;
let isCurrentUserGod = false;
let unsubscribeUsersRealtime = null;
let presenceRefreshIntervalId = null;
let lastUsersSnapshotAt = 0;

const ONLINE_TTL_MS = 90000;

const USERS_CACHE_KEY = 'sbi.admin.users.cache.v16753';
const USERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const USERS_RENDER_DEBOUNCE_MS = 80;

let usersRenderTimer = null;
let usersCacheHydrated = false;
let usersSnapshotInitialized = false;
let usersListDelegationContainer = null;

const boundSearchInputs = new WeakSet();
const boundRoleFilters = new WeakSet();
const boundCreateForms = new WeakSet();
const boundModals = new WeakSet();

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizeUsersArray = (users = []) => Array.isArray(users)
    ? users.filter((user) => user && user.id).map((user) => ({ ...user }))
    : [];

const readUsersCache = () => {
    try {
        const raw = window.localStorage?.getItem(USERS_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.users)) return null;

        const updatedAt = Number(parsed.updatedAt || 0);
        if (!updatedAt || Date.now() - updatedAt > USERS_CACHE_TTL_MS) return null;

        return normalizeUsersArray(parsed.users);
    } catch (error) {
        console.warn('[SBI Admin] Cache comptes illisible :', error);
        return null;
    }
};

const writeUsersCache = () => {
    try {
        window.localStorage?.setItem(USERS_CACHE_KEY, JSON.stringify({
            version: '8.0P.167.58',
            updatedAt: Date.now(),
            users: normalizeUsersArray(allUsersData)
        }));
    } catch (error) {
        console.warn('[SBI Admin] Cache comptes non enregistré :', error);
    }
};

const updateCurrentUserPrivileges = () => {
    const godExists = allUsersData.some(u => u.isGod === true);
    const myProfile = allUsersData.find(u => u.id === currentUid);
    isCurrentUserGod = godExists ? (myProfile && myProfile.isGod === true) : true;
};

const publishUsersState = (reason = 'sync') => {
    const users = normalizeUsersArray(allUsersData);

    window.SBI_ADMIN_USERS_CACHE = {
        version: '8.0P.167.58',
        users,
        updatedAt: Date.now(),
        reason
    };

    window.__SBI_ADMIN_CORE_ACCOUNTS_OWNER = true;

    window.dispatchEvent(new CustomEvent('sbi:accounts-data-updated', {
        detail: {
            version: '8.0P.167.58',
            reason,
            users,
            updatedAt: Date.now()
        }
    }));
};

const scheduleUsersRender = (reason = 'sync', delay = USERS_RENDER_DEBOUNCE_MS) => {
    if (usersRenderTimer) window.clearTimeout(usersRenderTimer);

    usersRenderTimer = window.setTimeout(() => {
        usersRenderTimer = null;
        renderCurrentFilteredUsers(reason);
    }, delay);
};

const hydrateUsersFromLocalCache = () => {
    if (usersCacheHydrated) return false;
    usersCacheHydrated = true;

    const cachedUsers = readUsersCache();
    if (!cachedUsers || cachedUsers.length === 0) return false;

    allUsersData = cachedUsers;
    updateCurrentUserPrivileges();
    publishUsersState('local-cache');
    scheduleUsersRender('local-cache', 0);
    return true;
};

const mergeUserIntoCache = (uid, patch = {}) => {
    if (!uid) return;

    const index = allUsersData.findIndex((user) => user.id === uid);
    if (index >= 0) {
        allUsersData[index] = {
            ...allUsersData[index],
            ...patch,
            id: uid
        };
    } else {
        allUsersData = [
            {
                id: uid,
                statut: 'actif',
                role: 'student',
                ...patch
            },
            ...allUsersData
        ];
    }

    updateCurrentUserPrivileges();
    writeUsersCache();
    publishUsersState('optimistic-local-change');
    scheduleUsersRender('optimistic-local-change', 0);
};

const removeUserFromCache = (uid) => {
    if (!uid) return;

    const before = allUsersData.length;
    allUsersData = allUsersData.filter((user) => user.id !== uid);

    if (allUsersData.length === before) return;

    updateCurrentUserPrivileges();
    writeUsersCache();
    publishUsersState('optimistic-local-delete');
    scheduleUsersRender('optimistic-local-delete', 0);
};

const applyUsersSnapshot = (querySnapshot) => {
    const hadLocalCache = allUsersData.length > 0;
    const changes = typeof querySnapshot.docChanges === 'function' ? querySnapshot.docChanges() : [];
    let changed = !usersSnapshotInitialized;

    if (!usersSnapshotInitialized || !hadLocalCache) {
        allUsersData = [];
        querySnapshot.forEach((snapDoc) => {
            allUsersData.push({ id: snapDoc.id, ...(snapDoc.data() || {}) });
        });
        changed = true;
    } else if (changes.length > 0) {
        const usersMap = new Map(allUsersData.map((user) => [user.id, user]));

        changes.forEach((change) => {
            const uid = change.doc.id;

            if (change.type === 'removed') {
                usersMap.delete(uid);
                changed = true;
                return;
            }

            usersMap.set(uid, { id: uid, ...(change.doc.data() || {}) });
            changed = true;
        });

        allUsersData = Array.from(usersMap.values());
    }

    usersSnapshotInitialized = true;
    lastUsersSnapshotAt = Date.now();

    if (!changed) return;

    updateCurrentUserPrivileges();
    writeUsersCache();
    publishUsersState('server-snapshot');
    scheduleUsersRender('server-snapshot');
};

const bindUsersListDelegation = (container) => {
    if (!container || usersListDelegationContainer === container) return;

    usersListDelegationContainer = container;

    container.addEventListener('click', (event) => {
        const editButton = event.target?.closest?.('.btn-edit-user[data-id]');
        if (editButton) {
            event.preventDefault();
            openEditModal(editButton.getAttribute('data-id'));
        }
    });
};



const runAfterPaint = (callback) => {
    window.requestAnimationFrame(() => window.setTimeout(callback, 0));
};

const showAdminMessage = (message) => {
    window.alert(message);
};

const showAdminConfirm = async (options) => {
    if (typeof window.SBIAdminConfirm === 'function') {
        return window.SBIAdminConfirm(options);
    }

    return window.confirm(options?.text || options?.title || 'Confirmer ?');
};

const getCallableErrorMessage = (error, fallback = 'Une erreur est survenue.') => {
    const rawMessage = error?.message || error?.details?.message || fallback;
    return String(rawMessage).replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/g, '').trim() || fallback;
};

const presenceToMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return 0;
};

const isUserReallyOnline = (user) => {
    if (!user || user.statut === 'suspendu') return false;
    if (user.isOnline !== true) return false;

    const lastSeenMs = presenceToMillis(user.lastSeenAt);
    if (!lastSeenMs) return false;

    return Date.now() - lastSeenMs <= ONLINE_TTL_MS;
};

const getLastSeenLabel = (user) => {
    const lastSeenMs = presenceToMillis(user?.lastSeenAt);
    if (!lastSeenMs) return 'Hors ligne';

    const diffSeconds = Math.max(0, Math.floor((Date.now() - lastSeenMs) / 1000));
    if (diffSeconds < 10) return 'À l’instant';
    if (diffSeconds < 60) return `Vu il y a ${diffSeconds}s`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `Vu il y a ${diffMinutes} min`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Vu il y a ${diffHours}h`;

    return 'Hors ligne';
};

const getFilteredUsers = () => {
    const searchInput = document.getElementById('search-user');
    const roleFilter = document.getElementById('filter-role');

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const roleTerm = roleFilter ? roleFilter.value : 'all';

    return allUsersData.filter(user => {
        const fullName = `${user.prenom || ''} ${user.nom || ''}`.toLowerCase();
        const email = (user.email || '').toLowerCase();
        const matchesSearch = fullName.includes(searchTerm) || email.includes(searchTerm);
        const matchesRole = roleTerm === 'all' || user.role === roleTerm;
        return matchesSearch && matchesRole;
    });
};

const renderCurrentFilteredUsers = (reason = 'manual') => {
    renderUsersList(getFilteredUsers(), reason);
};


const toMillisForAccountStatus = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const getStatusDateLabel = (value, fallback = '') => {
    const millis = toMillisForAccountStatus(value);
    if (!millis) return fallback;

    try {
        return new Date(millis).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });
    } catch (_) {
        return fallback;
    }
};

const getRelanceCount = (user = {}) => {
    const status = user.accountStatus || {};
    const raw = status.finalizationReminderCount ?? status.reminderCount ?? user.finalizationReminderCount ?? 0;
    const count = Number(raw);
    return Number.isFinite(count) ? count : 0;
};

const hasConnectedForStatus = (user = {}) => Boolean(
    user.accountStatus?.firstLoginCompleted === true
    || user.accountStatus?.firstLoginAt
    || user.firstLoginAt
    || user.accountStatus?.lastLoginAt
    || user.lastLoginAt
    || user.lastSeenAt
);

const getLastActivityForStatus = (user = {}) => {
    return user.accountStatus?.lastLoginAt
        || user.lastLoginAt
        || user.accountStatus?.firstLoginAt
        || user.firstLoginAt
        || user.accountStatus?.firstLoginCompletedAt
        || user.lastSeenAt
        || null;
};

const hasEmailBounceForStatus = (user = {}) => {
    const status = user.accountStatus || {};
    const issueType = String(status.finalizationIssueCode || status.emailIssueCode || status.emailIssueType || status.emailIssue || '').toLowerCase();
    const bounceState = String(status.emailBounceState || status.emailDeliveryState || status.emailStatus || status.deliveryStatus || status.brevoEvent || status.finalizationIssueEvent || '').toLowerCase();

    return Boolean(
        status.emailBouncedAt
        || status.lastEmailBounceAt
        || status.emailRejectedAt
        || status.lastBounceAt
        || status.bouncedAt
        || status.rejectedAt
        || status.brevoBounceAt
        || issueType.includes('bounce')
        || issueType.includes('bounced')
        || issueType.includes('reject')
        || issueType.includes('rejected')
        || issueType.includes('blocked')
        || issueType.includes('blacklist')
        || bounceState.includes('bounce')
        || bounceState.includes('bounced')
        || bounceState.includes('blocked')
        || bounceState.includes('reject')
        || bounceState.includes('rejected')
        || bounceState.includes('invalid')
        || bounceState.includes('blacklist')
    );
};

const hasEmailSuspicionForStatus = (user = {}) => {
    const status = user.accountStatus || {};
    const issueType = String(status.finalizationIssueCode || status.emailIssueCode || status.emailIssueType || status.emailIssue || '').toLowerCase();
    const warning = String(status.emailWarning || status.finalizationIssueMessage || status.emailIssueMessage || '').toLowerCase();

    return Boolean(
        status.emailSuspiciousAt
        || status.suspiciousEmailAt
        || status.emailIssueDetectedAt
        || issueType.includes('suspect')
        || issueType.includes('suspicious')
        || warning.includes('suspect')
    );
};

const isInvalidEmailForStatus = (email = '') => {
    const value = String(email || '').trim();
    if (!value) return true;
    return !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
};

const needsDirectContactForStatus = (user = {}) => {
    const status = user.accountStatus || {};
    return Boolean(status.finalizationEscalationAt && !status.finalizationEscalationResolvedAt);
};

const hasResolvedDirectContactForStatus = (user = {}) => {
    const status = user.accountStatus || {};
    return Boolean(status.finalizationEscalationAt && status.finalizationEscalationResolvedAt && !hasConnectedForStatus(user));
};

const hasOldFinalizationLinkForStatus = (user = {}) => {
    const status = user.accountStatus || {};
    const sentAt = toMillisForAccountStatus(status.finalizationEmailSentAt || status.invitationSentAt || user.invitationSentAt);
    if (!sentAt || hasConnectedForStatus(user)) return false;

    const ageMs = Date.now() - sentAt;
    return ageMs > 7 * 24 * 60 * 60 * 1000;
};

const getAccountStatusHtml = (user = {}) => {
    if (user.statut === 'suspendu') {
        return `
            <span class="sbi-status-dot sbi-status-muted">Suspendu</span>
            <small>Compte suspendu</small>
        `;
    }

    if (hasEmailBounceForStatus(user)) {
        return `
            <span class="sbi-status-dot sbi-status-danger">Email rejeté</span>
            <small>Adresse inexistante ou refusée</small>
        `;
    }

    if (isInvalidEmailForStatus(user.email)) {
        return `
            <span class="sbi-status-dot sbi-status-danger">Email invalide</span>
            <small>Adresse à corriger</small>
        `;
    }

    if (hasEmailSuspicionForStatus(user)) {
        return `
            <span class="sbi-status-dot sbi-status-warning">Email suspect</span>
            <small>À vérifier</small>
        `;
    }

    if (needsDirectContactForStatus(user)) {
        return `
            <span class="sbi-status-dot sbi-status-danger">Contact direct requis</span>
            <small>${getRelanceCount(user) || 3} relances</small>
        `;
    }

    if (hasConnectedForStatus(user)) {
        return `
            <span class="sbi-status-dot sbi-status-success">Activité détectée</span>
            <small>${getStatusDateLabel(getLastActivityForStatus(user), 'Compte à préparer')}</small>
        `;
    }

    if (hasResolvedDirectContactForStatus(user)) {
        return `
            <span class="sbi-status-dot sbi-status-success">Contact traité</span>
            <small>Alerte traitée</small>
        `;
    }

    if (hasOldFinalizationLinkForStatus(user)) {
        return `
            <span class="sbi-status-dot sbi-status-warning">Mot de passe attendu</span>
            <small>Lien ancien</small>
        `;
    }

    const relances = getRelanceCount(user);
    if (relances > 0) {
        return `
            <span class="sbi-status-dot sbi-status-warning">Mot de passe attendu</span>
            <small>${relances} relance${relances > 1 ? 's' : ''}</small>
        `;
    }

    const state = String(user.accountStatus?.preparationState || user.accountStatus?.activationState || user.preparationState || user.activationState || '').toLowerCase();
    const hasInvite = Boolean(
        user.accountStatus?.finalizationEmailSentAt
        || user.accountStatus?.invitationSentAt
        || user.invitationSentAt
        || user.accountStatus?.passwordSetupEmailSentAt
        || user.accountStatus?.passwordResetSentAt
    );

    if (state.includes('pending') || state.includes('password') || state.includes('invite') || state.includes('finalization') || hasInvite) {
        return `
            <span class="sbi-status-dot sbi-status-warning">Mot de passe attendu</span>
            <small>Invitation envoyée</small>
        `;
    }

    return `
        <span class="sbi-status-dot sbi-status-muted">Compte à préparer</span>
        <small>En attente</small>
    `;
};


const fetchUsers = () => {
    const container = document.getElementById('users-list-container');
    if (!container) return;

    bindUsersListDelegation(container);
    hydrateUsersFromLocalCache();

    if (unsubscribeUsersRealtime) {
        renderCurrentFilteredUsers('listener-already-open');
        publishUsersState('listener-already-open');
        return;
    }

    try {
        unsubscribeUsersRealtime = onSnapshot(collection(db, "users"), (querySnapshot) => {
            applyUsersSnapshot(querySnapshot);
        }, (error) => {
            console.error("Erreur écoute users :", error);
            if (allUsersData.length === 0) {
                container.innerHTML = `<div class="sys-msg error" style="display:block;">Erreur de chargement.</div>`;
            }
        });

        if (!presenceRefreshIntervalId) {
            presenceRefreshIntervalId = window.setInterval(() => {
                if (allUsersData.length > 0) scheduleUsersRender('presence-tick', 160);
            }, 30000);
        }
    } catch (error) {
        if (allUsersData.length === 0) {
            container.innerHTML = `<div class="sys-msg error" style="display:block;">Erreur de chargement.</div>`;
        }
    }
};

const disconnectUsersRealtime = () => {
    if (typeof unsubscribeUsersRealtime === 'function') {
        try {
            unsubscribeUsersRealtime();
        } catch (error) {
            console.warn('[SBI Admin] Déconnexion users listener ignorée :', error);
        }
    }

    unsubscribeUsersRealtime = null;
    usersSnapshotInitialized = false;

    if (presenceRefreshIntervalId) {
        window.clearInterval(presenceRefreshIntervalId);
        presenceRefreshIntervalId = null;
    }

    if (usersRenderTimer) {
        window.clearTimeout(usersRenderTimer);
        usersRenderTimer = null;
    }

    usersListDelegationContainer = null;
};

const consumeProfileReturnRehydrateFlag = () => {
    const shouldForce = window.__SBI_ADMIN_FORCE_USERS_REHYDRATE === true
        || sessionStorage.getItem('sbiAdminForceUsersRehydrate') === '1';

    if (!shouldForce) return false;

    window.__SBI_ADMIN_FORCE_USERS_REHYDRATE = false;
    sessionStorage.removeItem('sbiAdminForceUsersRehydrate');
    sessionStorage.removeItem('sbiAdminReturnFromProfile');

    return true;
};

const forceUsersRehydrateFromProfile = () => {
    const container = document.getElementById('users-list-container');
    if (!container || !currentUid) return;

    hydrateUsersFromLocalCache();
    scheduleUsersRender('profile-return', 0);

    if (!unsubscribeUsersRealtime) {
        fetchUsers();
    }
};

const resetUserListFilters = () => {
    const searchInput = document.getElementById('search-user');
    const roleFilter = document.getElementById('filter-role');

    if (searchInput) searchInput.value = '';
    if (roleFilter) roleFilter.value = 'all';
};

const forceUsersRefreshAfterCreate = (createdUser = {}) => {
    resetUserListFilters();

    const uid = createdUser.uid || createdUser.id || '';
    if (uid) {
        mergeUserIntoCache(uid, {
            uid,
            prenom: createdUser.prenom || '',
            nom: createdUser.nom || '',
            email: createdUser.email || '',
            role: createdUser.role || 'student',
            statut: createdUser.statut || 'actif',
            createdAt: createdUser.createdAt || Date.now(),
            accountStatus: {
                ...(createdUser.accountStatus || {}),
                preparationState: createdUser.accountStatus?.preparationState || 'pending_password'
            }
        });
    } else {
        scheduleUsersRender('account-created-pending-server', 0);
    }

    window.dispatchEvent(new CustomEvent('sbi:account-created', {
        detail: {
            uid,
            email: createdUser.email || '',
            at: Date.now()
        }
    }));
};

const renderUsersList = (usersToRender, reason = 'manual') => {
    const container = document.getElementById('users-list-container');
    if (!container) return;

    bindUsersListDelegation(container);

    container.style.overflowX = 'hidden';
    container.style.paddingBottom = '0';

    if (usersToRender.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucun compte trouvé.</div>';
        publishUsersState(`render:${reason}`);
        window.dispatchEvent(new CustomEvent('sbi:accounts-rendered', {
            detail: { version: '8.0P.167.58', reason, count: 0 }
        }));
        return;
    }

    const html = usersToRender.map((user) => {
        const displayName = (user.prenom && user.nom) ? `${user.prenom} ${user.nom}` : (user.nom || user.prenom || "Sans nom");
        const statusLabel = getAccountStatusHtml(user);
        const promotionLabel = user.promotionName || '';
        const promotionHtml = promotionLabel
            ? `<small style="display:block; margin-top:0.18rem; color:#9fb2ff; font-weight:800; font-size:0.66rem; line-height:1.25;">Promotion · ${escapeHtml(promotionLabel)}</small>`
            : '<small style="display:block; margin-top:0.18rem; color:#6b7280; font-weight:700; font-size:0.66rem; line-height:1.25;">Sans promotion</small>';

        const isOnline = isUserReallyOnline(user);
        const lastSeenLabel = getLastSeenLabel(user);
        const onlineIndicator = isOnline
            ? '<span class="sbi-account-online-dot is-online" title="En ligne"></span>'
            : `<span class="sbi-account-online-dot" title="${escapeHtml(lastSeenLabel)}"></span>`;

        let roleBgColor = '';
        let roleTextColor = '';
        let roleText = '';

        if (user.isGod) {
            roleBgColor = 'rgba(255, 215, 0, 0.15)';
            roleTextColor = '#ffd700';
            roleText = 'Suprême';
        } else if (user.role === 'admin') {
            roleBgColor = 'rgba(255, 74, 74, 0.15)';
            roleTextColor = '#ff4a4a';
            roleText = 'Admin';
        } else if (user.role === 'teacher') {
            roleBgColor = 'rgba(251, 188, 4, 0.15)';
            roleTextColor = '#fbbc04';
            roleText = 'Prof';
        } else if (user.role === 'student') {
            roleBgColor = 'rgba(0, 255, 163, 0.15)';
            roleTextColor = '#00ffa3';
            roleText = 'Élève';
        } else {
            roleBgColor = 'rgba(156, 163, 175, 0.12)';
            roleTextColor = '#9ca3af';
            roleText = 'Compte';
        }

        return `
            <div class="sbi-account-row" data-sbi-account-id="${escapeHtml(user.id)}" style="background: #0a0a0c; border: 1px solid #222; border-radius: 6px; margin-bottom: 0.4rem; display: grid; grid-template-columns: 64px minmax(108px, .88fr) minmax(138px, 1.1fr) minmax(156px, 1.24fr) 62px 62px; align-items: stretch; opacity: ${user.statut === 'suspendu' ? '0.6' : '1'}; font-size: 0.8rem; overflow: hidden;">

                <div class="sbi-account-role-cell" style="background: ${roleBgColor}; color: ${roleTextColor}; display: flex; align-items: center; justify-content: center; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.68rem; border-right: 1px solid #222; text-align: center;">
                    ${escapeHtml(roleText)}
                </div>

                <div class="sbi-account-name-cell" style="color: white; font-weight: bold; word-break: break-word; min-width: 0; padding: 0.58rem 0.65rem; display: flex; align-items: center; gap:0.35rem;">
                    ${onlineIndicator}
                    <span class="sbi-account-name-line" style="display:flex; flex-direction:column; min-width:0; line-height:1.25;">
                        <span>${escapeHtml(displayName)}</span>
                        ${promotionHtml}
                    </span>
                </div>

                <div class="sbi-account-email-cell" style="color: #9ca3af; word-break: break-word; min-width: 0; padding: 0.58rem 0.65rem; display: flex; align-items: center;">
                    ${escapeHtml(user.email || 'Email manquant')}
                </div>

                <div class="sbi-account-status-cell" style="text-align: left; padding: 0.58rem 0.65rem; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0.18rem; min-width: 0;">
                    ${statusLabel}
                </div>

                <button class="btn-view-profile" data-id="${escapeHtml(user.id)}" style="background: rgba(46, 213, 115, 0.1); color: #2ed573; border: none; border-left: 1px solid #222; cursor: pointer; transition: background-color 0.12s; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.66rem; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; padding: 0;">
                    Profil
                </button>

                <button class="btn-edit-user" data-id="${escapeHtml(user.id)}" style="background: rgba(42, 87, 255, 0.1); color: #2A57FF; border: none; border-left: 1px solid #222; cursor: pointer; transition: background-color 0.12s; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.66rem; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; padding: 0;">
                    Éditer
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    publishUsersState(`render:${reason}`);
    window.dispatchEvent(new CustomEvent('sbi:accounts-rendered', {
        detail: {
            version: '8.0P.167.58',
            reason,
            count: usersToRender.length
        }
    }));
};

const initFilters = () => {
    const searchInput = document.getElementById('search-user');
    const roleFilter = document.getElementById('filter-role');
    if (!searchInput || !roleFilter) return;

    if (!boundSearchInputs.has(searchInput)) {
        boundSearchInputs.add(searchInput);
        searchInput.addEventListener('input', () => scheduleUsersRender('filter', 120));
    }

    if (!boundRoleFilters.has(roleFilter)) {
        boundRoleFilters.add(roleFilter);
        roleFilter.addEventListener('change', () => scheduleUsersRender('filter', 0));
    }
};

const formatNom = (str) => str.toUpperCase();
const formatPrenom = (str) => str.toLowerCase().replace(/(^|\s|-)\S/g, l => l.toUpperCase());

const initUserCreation = () => {
    const form = document.getElementById('create-user-form');
    if (!form || boundCreateForms.has(form)) return;
    boundCreateForms.add(form);

    const submitBtn = form.querySelector('button[type="submit"]');
    const adminCreateUserAccount = httpsCallable(functionsInstance, 'adminCreateUserAccount');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgBox = document.getElementById('user-creation-msg');
        msgBox.style.display = 'block';
        msgBox.style.color = 'var(--text-muted)';
        msgBox.textContent = 'Création du compte et préparation de l’email...';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.65';
        }

        const prenom = formatPrenom(document.getElementById('new-user-prenom').value.trim());
        const nom = formatNom(document.getElementById('new-user-nom').value.trim());
        const email = document.getElementById('new-user-email').value.trim();
        const role = document.getElementById('new-user-role').value;

        try {
            const result = await adminCreateUserAccount({ prenom, nom, email, role });
            const warning = result?.data?.warning || '';

            msgBox.style.color = warning ? 'var(--accent-yellow)' : 'var(--accent-green)';
            msgBox.textContent = warning || `Compte créé pour ${prenom}. Email d’invitation envoyé.`;

            form.reset();
            forceUsersRefreshAfterCreate({
                uid: result?.data?.uid || '',
                prenom,
                nom,
                email,
                role,
                statut: 'actif'
            });
        } catch (error) {
            msgBox.style.color = 'var(--accent-red)';
            msgBox.textContent = 'Erreur : ' + getCallableErrorMessage(error, 'Création du compte impossible.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '';
            }
        }
    });
};

const openEditModal = (userId) => {
    const targetUser = allUsersData.find(u => u.id === userId);
    if (!targetUser) return;

    const prenomInput = document.getElementById('edit-user-prenom');
    const nomInput = document.getElementById('edit-user-nom');
    const emailInput = document.getElementById('edit-user-email');
    const roleSelect = document.getElementById('edit-user-role');
    const statutSelect = document.getElementById('edit-user-statut');

    const godContainer = document.getElementById('god-mode-container');
    const godCheckbox = document.getElementById('edit-user-isgod');
    const godLabelWrapper = godCheckbox ? godCheckbox.parentElement : null;
    const godDesc = document.getElementById('god-mode-desc');

    const deleteZone = document.getElementById('delete-zone');
    const resetPwdBtn = document.getElementById('reset-pwd-btn');
    const submitBtn = document.querySelector('#edit-user-form button[type="submit"]');

    document.getElementById('edit-user-id').value = targetUser.id;
    prenomInput.value = targetUser.prenom || '';
    nomInput.value = targetUser.nom || '';
    emailInput.value = targetUser.email || '';
    roleSelect.value = targetUser.role || 'student';
    statutSelect.value = targetUser.statut || 'actif';

    prenomInput.disabled = false;
    nomInput.disabled = false;
    emailInput.disabled = false;
    roleSelect.disabled = false;
    statutSelect.disabled = false;

    if (resetPwdBtn) resetPwdBtn.style.display = 'block';
    if (submitBtn) submitBtn.style.display = 'block';
    if (deleteZone) deleteZone.style.display = 'block';

    if (godContainer) {
        godContainer.style.display = 'none';
        if (godCheckbox) godCheckbox.checked = false;
        if (godLabelWrapper) godLabelWrapper.style.display = 'flex';
        if (godDesc) godDesc.style.marginTop = '0.5rem';
    }

    const godExists = allUsersData.some(u => u.isGod === true);

    if (targetUser.isGod && !isCurrentUserGod) {
        prenomInput.disabled = true;
        nomInput.disabled = true;
        emailInput.disabled = true;
        roleSelect.disabled = true;
        statutSelect.disabled = true;

        if (resetPwdBtn) resetPwdBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'none';
        if (deleteZone) deleteZone.style.display = 'none';

        if (godContainer) {
            godContainer.style.display = 'block';
            if (godLabelWrapper) godLabelWrapper.style.display = 'none';
            if (godDesc) {
                godDesc.style.marginTop = '0';
                godDesc.innerHTML = "<span style='color: #ffd700; font-size: 1.1rem; font-weight: bold;'>Cet utilisateur est l'Administrateur Suprême (Lecture seule).</span>";
            }
        }
    } else if (targetUser.isGod && isCurrentUserGod) {
        if (deleteZone) deleteZone.style.display = 'none';

        emailInput.disabled = true;
        roleSelect.disabled = true;
        statutSelect.disabled = true;

        if (godContainer) {
            godContainer.style.display = 'block';
            if (godLabelWrapper) godLabelWrapper.style.display = 'none';
            if (godDesc) {
                godDesc.style.marginTop = '0';
                godDesc.innerHTML = "<span style='color: #ffd700; font-size: 1.1rem; font-weight: bold;'>Vous êtes l'Administrateur Suprême de la plateforme.</span>";
            }
        }
    } else if (!targetUser.isGod && targetUser.role === 'admin') {
        if (!godExists && godContainer) {
            godContainer.style.display = 'block';
            if (godCheckbox) godCheckbox.disabled = false;

            if (targetUser.id === currentUid && godDesc) {
                godDesc.innerHTML = "Aucun Suprême n'existe. Cochez pour <strong>réclamer</strong> les pouvoirs (irréversible).";
            } else if (godDesc) {
                godDesc.innerHTML = "Aucun Suprême n'existe. Cochez pour lui <strong>donner</strong> les pouvoirs.";
            }
        } else if (isCurrentUserGod && godContainer) {
            godContainer.style.display = 'block';
            if (godCheckbox) godCheckbox.disabled = false;
            if (godDesc) godDesc.innerHTML = "Attention : en cochant, vous lui <strong>transférez</strong> vos pouvoirs. Vous les perdrez définitivement.";
        }
    }

    if (targetUser.id === currentUid) {
        emailInput.disabled = true;
        if (deleteZone) deleteZone.style.display = 'none';
    }

    document.getElementById('edit-user-modal').style.display = 'flex';
};

const initModalLogic = () => {
    const modal = document.getElementById('edit-user-modal');
    if (!modal || boundModals.has(modal)) return;
    boundModals.add(modal);

    document.getElementById('close-modal-btn')?.addEventListener('click', () => modal.style.display = 'none');

    document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
        const userId = document.getElementById('edit-user-id').value;
        const targetUser = allUsersData.find(u => u.id === userId);

        if (!targetUser) {
            showAdminMessage("Compte introuvable dans la liste chargée.");
            return;
        }

        if (targetUser.isGod && !isCurrentUserGod) {
            showAdminMessage("Accès refusé : vous ne pouvez pas modifier le profil de l'Administrateur Suprême.");
            return;
        }

        const payload = { uid: userId };

        const prenomInput = document.getElementById('edit-user-prenom');
        const nomInput = document.getElementById('edit-user-nom');
        const emailInput = document.getElementById('edit-user-email');
        const roleSelect = document.getElementById('edit-user-role');
        const statutSelect = document.getElementById('edit-user-statut');

        if (!prenomInput.disabled) payload.prenom = formatPrenom(prenomInput.value);
        if (!nomInput.disabled) payload.nom = formatNom(nomInput.value);
        if (!emailInput.disabled && emailInput.value.trim() !== (targetUser.email || '').trim()) {
            payload.email = emailInput.value.trim().toLowerCase();
        }

        if (!roleSelect.disabled) {
            payload.role = roleSelect.value;
            payload.statut = statutSelect.value;
        }

        const godCheckbox = document.getElementById('edit-user-isgod');
        const godLabelWrapper = godCheckbox ? godCheckbox.parentElement : null;

        if (godCheckbox && godCheckbox.checked && godLabelWrapper && godLabelWrapper.style.display !== 'none') {
            payload.isGod = true;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.65';
        }

        try {
            let emailWarning = '';

            if (payload.email) {
                const adminChangeUserEmail = httpsCallable(functionsInstance, 'adminChangeUserEmail');
                const emailResult = await adminChangeUserEmail({ uid: userId, email: payload.email });
                emailWarning = emailResult?.data?.warning || '';
                delete payload.email;
            }

            const profilePayload = { ...payload };
            delete profilePayload.uid;
            const hasProfileChanges = Object.keys(profilePayload).length > 0;
            let updateWarning = '';

            if (hasProfileChanges) {
                const adminUpdateUserAccount = httpsCallable(functionsInstance, 'adminUpdateUserAccount');
                const result = await adminUpdateUserAccount(payload);
                updateWarning = result?.data?.warning || '';
            }

            modal.style.display = 'none';

            const optimisticPatch = { ...profilePayload };
            const changedEmail = emailInput && !emailInput.disabled
                ? emailInput.value.trim().toLowerCase()
                : '';

            if (changedEmail && changedEmail !== (targetUser.email || '').trim().toLowerCase()) {
                optimisticPatch.email = changedEmail;
            }

            if (Object.keys(optimisticPatch).length > 0) {
                mergeUserIntoCache(userId, optimisticPatch);
            } else {
                scheduleUsersRender('edit-no-local-change', 0);
            }

            const warningMessage = [emailWarning, updateWarning].filter(Boolean).join('\n');
            if (warningMessage) {
                showAdminMessage(warningMessage);
            }
        } catch (error) {
            showAdminMessage(getCallableErrorMessage(error, "Erreur de sauvegarde."));
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '';
            }
        }
    });

    document.getElementById('delete-user-btn').addEventListener('click', async (event) => {
        event.preventDefault();

        const deleteBtn = event.currentTarget;
        deleteBtn.disabled = true;
        deleteBtn.style.opacity = '0.65';

        try {
            const userId = document.getElementById('edit-user-id').value;
            const targetUser = allUsersData.find(u => u.id === userId);

            if (!targetUser) return;

            if (targetUser.isGod) {
                showAdminMessage("Sécurité : le compte Suprême ne peut pas être supprimé.");
                return;
            }

            if (targetUser.id === currentUid) {
                showAdminMessage("Sécurité : vous ne pouvez pas supprimer votre propre compte.");
                return;
            }

            const displayName = `${targetUser.prenom || ''} ${targetUser.nom || ''}`.trim() || targetUser.email || 'cet utilisateur';
            const confirmed = await showAdminConfirm({
                title: 'Supprimer définitivement ?',
                text: `Cette action supprimera le compte de ${displayName}. Elle ne doit être utilisée qu’en dernier recours.`,
                confirmLabel: 'Supprimer',
                cancelLabel: 'Annuler',
                tone: 'danger'
            });

            if (!confirmed) return;

            const deleteUserAccount = httpsCallable(functionsInstance, 'deleteUserAccount');
            await deleteUserAccount({ uid: userId });
            modal.style.display = 'none';
            removeUserFromCache(userId);
        } catch (error) {
            showAdminMessage(getCallableErrorMessage(error, "Erreur serveur pendant la suppression."));
        } finally {
            deleteBtn.disabled = false;
            deleteBtn.style.opacity = '';
        }
    });

    document.getElementById('reset-pwd-btn').addEventListener('click', async (event) => {
        const resetBtn = event.currentTarget;
        const userId = document.getElementById('edit-user-id').value;
        const userEmail = document.getElementById('edit-user-email').value;

        resetBtn.disabled = true;
        resetBtn.style.opacity = '0.65';

        try {
            const adminSendPasswordReset = httpsCallable(functionsInstance, 'adminSendPasswordReset');
            await adminSendPasswordReset({ uid: userId });
            showAdminMessage(`E-mail de réinitialisation envoyé à ${userEmail}`);
        } catch (error) {
            showAdminMessage(getCallableErrorMessage(error, "Impossible d'envoyer l'e-mail."));
        } finally {
            resetBtn.disabled = false;
            resetBtn.style.opacity = '';
        }
    });
};

function bindAdminAccountsDom() {
    if (typeof initFilters === "function") initFilters();
    if (typeof initUserCreation === "function") initUserCreation();
    if (typeof initModalLogic === "function") initModalLogic();

    const container = document.getElementById('users-list-container');
    if (container) bindUsersListDelegation(container);
}

function initAdminCore() {
    if (window.__SBI_ADMIN_CORE_READY === true) {
        bindAdminAccountsDom();
        if (auth.currentUser) {
            currentUid = auth.currentUser.uid;
            fetchUsers();
        }
        return;
    }

    window.__SBI_ADMIN_CORE_READY = true;

    const myProfileBtn = document.getElementById('btn-my-profile');

    if (myProfileBtn) {
        myProfileBtn.addEventListener('click', () => {
            if (currentUid) {
                window.location.href = `admin-profile.html?id=${currentUid}`;
            } else {
                showAdminMessage("Veuillez patienter, chargement de l'utilisateur en cours...");
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logoutUser);

    const cacheBtn = document.getElementById('btn-clear-cache');

    if (cacheBtn) {
        cacheBtn.addEventListener('click', () => {
            if (confirm('Vider le cache local ? Cela rechargera la page.')) {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload(true);
            }
        });
    }

    bindAdminAccountsDom();

    window.addEventListener('sbi:admin-tab-changed', (event) => {
        if (event?.detail?.tab === 'view-users' && consumeProfileReturnRehydrateFlag()) {
            window.setTimeout(forceUsersRehydrateFromProfile, 80);
        }
    });

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            if (typeof fetchUsers === "function") fetchUsers();

            if (consumeProfileReturnRehydrateFlag()) {
                window.setTimeout(forceUsersRehydrateFromProfile, 120);
            }
        } else {
            window.location.replace('/login.html');
        }
    });
}

window.SBI_ADMIN_CORE_REINIT = () => {
    bindAdminAccountsDom();

    if (auth.currentUser) {
        currentUid = auth.currentUser.uid;
        fetchUsers();
    }
};

window.SBI_ADMIN_CORE_DISCONNECT_USERS = () => {
    disconnectUsersRealtime();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminCore, { once: true });
} else {
    initAdminCore();
}
