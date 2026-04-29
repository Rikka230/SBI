/**
 * =======================================================================
 * COURSE ACCESS DIAGNOSTICS - SBI 8.0M.5
 * =======================================================================
 * Outil admin pour repérer les cours fantômes sans toucher au viewer :
 * - scan lecture seule formations / users / courses ;
 * - comparaison formations -> users.formationIds / formationsAcces ;
 * - repérage des ciblages cours fragiles ou legacy ;
 * - bouton séparé pour relancer la réparation existante des index users.
 * =======================================================================
 */

import { auth, db } from '/js/firebase-init.js';
import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { syncAllUserFormationIndexes } from '/admin/js/user-formation-index.js';

let initialized = false;
let lastReport = null;

const IDS = {
    root: 'course-access-diagnostic-card',
    status: 'course-access-status-badge',
    summary: 'course-access-summary',
    details: 'course-access-details',
    users: 'course-access-users-mismatch',
    courses: 'course-access-courses-issues',
    formations: 'course-access-formations-issues',
    scan: 'btn-course-access-scan',
    repair: 'btn-course-access-repair'
};

const ARRAY_FIELDS = ['formations', 'formationIds', 'formationsIds', 'targetFormationIds', 'targetFormationTitles'];
const SCALAR_FIELDS = ['formationId', 'formation', 'formationTitre', 'formationTitle', 'formationName', 'formationNom', 'formationRef'];

function el(id) { return document.getElementById(id); }

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function text(value) { return String(value ?? '').trim(); }

function list(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map(text).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

function sameList(a, b) {
    const left = list(a);
    const right = list(b);
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function docsToArray(snapshot) {
    const items = [];
    snapshot.forEach((item) => items.push({ id: item.id, ...item.data() }));
    return items;
}

function roleOf(user = {}) {
    const role = text(user.role).toLowerCase();
    if (user.isGod === true || role === 'admin') return 'admin';
    if (['teacher', 'prof', 'professeur', 'enseignant'].includes(role)) return 'teacher';
    if (['student', 'eleve', 'élève'].includes(role)) return 'student';
    return role || 'unknown';
}

function labelUser(user = {}) {
    return [user.prenom, user.nom].map(text).filter(Boolean).join(' ')
        || text(user.email)
        || user.id
        || 'Utilisateur inconnu';
}

function labelFormation(formation = {}) {
    return text(formation.titre) || formation.id || 'Formation sans titre';
}

function labelCourse(course = {}) {
    return text(course.titre) || text(course.title) || course.id || 'Cours sans titre';
}

function isAdminLike(profile = {}) {
    return profile.isGod === true || profile.role === 'admin';
}

function isVisibleCourse(course = {}) {
    return course.actif === true || (course.statutValidation === 'approved' && course.actif !== false);
}

function courseKeys(course = {}) {
    const values = [];
    ARRAY_FIELDS.forEach((field) => {
        if (Array.isArray(course[field])) values.push(...course[field]);
    });
    SCALAR_FIELDS.forEach((field) => {
        if (course[field]) values.push(course[field]);
    });
    return list(values);
}

function buildFormationLookup(formations = []) {
    const lookup = new Map();
    formations.forEach((formation) => {
        if (!formation?.id) return;
        lookup.set(text(formation.id), formation);
        if (formation.titre) lookup.set(text(formation.titre), formation);
    });
    return lookup;
}

function emptyAccess() {
    return { ids: new Set(), titles: new Set() };
}

function ensureAccess(map, uid) {
    const safeUid = text(uid);
    if (!safeUid) return null;
    if (!map.has(safeUid)) map.set(safeUid, emptyAccess());
    return map.get(safeUid);
}

function buildExpectedAccess(formations = [], users = []) {
    const expected = new Map();
    users.forEach((user) => ensureAccess(expected, user.id));

    formations.forEach((formation) => {
        const formationId = text(formation.id);
        const formationTitle = text(formation.titre);
        [...list(formation.profs), ...list(formation.students)].forEach((uid) => {
            const entry = ensureAccess(expected, uid);
            if (!entry) return;
            if (formationId) entry.ids.add(formationId);
            if (formationTitle) entry.titles.add(formationTitle);
        });
    });

    return expected;
}

function setBadge(message, type = 'idle') {
    const badge = el(IDS.status);
    if (!badge) return;

    const palette = {
        success: ['var(--accent-green)', 'rgba(16,185,129,.12)'],
        warning: ['var(--accent-yellow)', 'rgba(251,188,4,.12)'],
        error: ['var(--accent-red)', 'rgba(255,74,74,.12)'],
        idle: ['#aaa', 'rgba(255,255,255,.06)']
    }[type] || ['#aaa', 'rgba(255,255,255,.06)'];

    badge.textContent = message;
    badge.style.color = palette[0];
    badge.style.background = palette[1];
}

function setMetric(id, value) {
    const node = el(id);
    if (node) node.textContent = String(value);
}

function setButton(button, loading, label) {
    if (!button) return;
    button.disabled = loading;
    button.textContent = loading ? label.loading : label.idle;
    button.style.opacity = loading ? '0.65' : '1';
    button.style.cursor = loading ? 'wait' : 'pointer';
}

async function waitUser() {
    if (auth.currentUser) return auth.currentUser;
    return new Promise((resolve) => {
        const stop = onAuthStateChanged(auth, (user) => {
            stop();
            resolve(user || null);
        });
    });
}

async function assertAdmin() {
    const user = await waitUser();
    if (!user) throw new Error('Utilisateur non connecté.');

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) throw new Error('Profil utilisateur introuvable.');

    const profile = { id: snap.id, ...snap.data() };
    if (!isAdminLike(profile)) throw new Error('Action réservée aux administrateurs.');

    return profile;
}

async function loadData() {
    const [formations, users, courses] = await Promise.all([
        getDocs(collection(db, 'formations')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'courses'))
    ]);

    return {
        formations: docsToArray(formations),
        users: docsToArray(users),
        courses: docsToArray(courses)
    };
}

function findFormationMatches(keys, lookup) {
    const map = new Map();
    keys.forEach((key) => {
        const formation = lookup.get(key);
        if (formation?.id) map.set(formation.id, formation);
    });
    return Array.from(map.values());
}

function expectedStudentsFromFormations(formations = []) {
    const students = [];
    formations.forEach((formation) => students.push(...list(formation.students)));
    return list(students);
}

function analyze(data) {
    const usersById = new Map(data.users.map((user) => [user.id, user]));
    const expectedAccess = buildExpectedAccess(data.formations, data.users);
    const formationLookup = buildFormationLookup(data.formations);
    const userMismatches = [];
    const formationIssues = [];
    const courseIssues = [];
    const unassignedUsers = [];

    data.users.forEach((user) => {
        const expected = expectedAccess.get(user.id) || emptyAccess();
        const expectedIds = list(Array.from(expected.ids));
        const expectedTitles = list(Array.from(expected.titles));
        const currentIds = list(user.formationIds);
        const currentTitles = list(user.formationsAcces);
        const role = roleOf(user);

        if (!sameList(currentIds, expectedIds) || !sameList(currentTitles, expectedTitles)) {
            userMismatches.push({ user, role, currentIds, expectedIds, currentTitles, expectedTitles });
        } else if ((role === 'student' || role === 'teacher') && expectedIds.length === 0) {
            unassignedUsers.push({ user, role });
        }
    });

    data.formations.forEach((formation) => {
        const profs = list(formation.profs);
        const students = list(formation.students);

        if (!text(formation.titre)) {
            formationIssues.push({
                level: 'warning',
                title: `Formation ${formation.id}`,
                message: 'Titre manquant : les anciens accès par formationsAcces deviennent fragiles.'
            });
        }

        if (profs.length === 0 && students.length === 0) {
            formationIssues.push({
                level: 'info',
                title: labelFormation(formation),
                message: 'Aucun prof ni élève assigné.'
            });
        }

        [...profs, ...students].forEach((uid) => {
            if (!usersById.has(uid)) {
                formationIssues.push({
                    level: 'warning',
                    title: labelFormation(formation),
                    message: `Utilisateur référencé introuvable : ${uid}`
                });
            }
        });
    });

    data.courses.forEach((course) => {
        const keys = courseKeys(course);
        const formations = findFormationMatches(keys, formationLookup);
        const targetStudents = list(course.targetStudents);
        const expectedStudents = expectedStudentsFromFormations(formations);

        if (keys.length === 0 && targetStudents.length === 0) {
            courseIssues.push({
                level: 'error',
                title: labelCourse(course),
                message: 'Aucun ciblage détecté : ni formation, ni targetStudents.'
            });
        } else if (keys.length > 0 && formations.length === 0) {
            courseIssues.push({
                level: 'warning',
                title: labelCourse(course),
                message: `Références formation non reconnues : ${keys.join(', ')}`
            });
        }

        if (!isVisibleCourse(course)) {
            courseIssues.push({
                level: 'info',
                title: labelCourse(course),
                message: `Non visible côté élève : actif=${String(course.actif)} · statutValidation=${text(course.statutValidation) || 'vide'}`
            });
        }

        if (formations.length > 0 && expectedStudents.length > 0 && !sameList(targetStudents, expectedStudents)) {
            courseIssues.push({
                level: 'warning',
                title: labelCourse(course),
                message: `targetStudents désynchronisé : ${targetStudents.length} actuel(s), ${expectedStudents.length} attendu(s).`
            });
        }

        if (list(course.formations).length > 0 && list(course.targetFormationIds).length === 0) {
            courseIssues.push({
                level: 'info',
                title: labelCourse(course),
                message: 'Ciblage encore porté par le champ legacy formations, sans targetFormationIds.'
            });
        }
    });

    return {
        generatedAt: new Date().toISOString(),
        counts: {
            formations: data.formations.length,
            users: data.users.length,
            courses: data.courses.length
        },
        userMismatches,
        formationIssues,
        courseIssues,
        unassignedUsers
    };
}

function issueBlock(title, items, renderer, limit = 8) {
    if (!items.length) return '';

    const visible = items.slice(0, limit);
    const hidden = items.length - visible.length;

    return `
        <div style="margin-top:1rem; padding:1rem; background:#0b0b0d; border:1px solid #222; border-radius:10px;">
            <strong style="display:block; color:white; margin-bottom:.75rem;">${esc(title)}</strong>
            <div style="display:flex; flex-direction:column; gap:.6rem;">${visible.map(renderer).join('')}</div>
            ${hidden > 0 ? `<p style="margin:.75rem 0 0 0; color:#888; font-size:.85rem;">+ ${hidden} autre(s). Rapport complet dans window.SBI_ACCESS_REPORT.</p>` : ''}
        </div>
    `;
}

function render(report) {
    const total = report.userMismatches.length + report.formationIssues.length + report.courseIssues.length;
    const summary = el(IDS.summary);
    const details = el(IDS.details);

    setMetric(IDS.users, report.userMismatches.length);
    setMetric(IDS.courses, report.courseIssues.length);
    setMetric(IDS.formations, report.formationIssues.length);
    setBadge(total ? (total >= 5 ? 'À vérifier' : 'Surveillance') : 'OK', total ? (total >= 5 ? 'warning' : 'idle') : 'success');

    if (summary) {
        summary.textContent = total
            ? `Scan terminé : ${report.counts.users} utilisateur(s), ${report.counts.formations} formation(s), ${report.counts.courses} cours. ${total} point(s) à vérifier.`
            : `Scan terminé : ${report.counts.users} utilisateur(s), ${report.counts.formations} formation(s), ${report.counts.courses} cours. Aucun écart critique détecté.`;
    }

    if (!details) return;

    details.innerHTML = [
        issueBlock(
            'Index utilisateurs désynchronisés',
            report.userMismatches,
            (item) => `
                <div style="color:#aaa; font-size:.88rem; line-height:1.45; border-left:3px solid var(--accent-yellow); padding-left:.75rem;">
                    <strong style="color:white;">${esc(labelUser(item.user))}</strong> · ${esc(item.role)}<br>
                    IDs actuels : ${esc(item.currentIds.join(', ') || 'vide')}<br>
                    IDs attendus : ${esc(item.expectedIds.join(', ') || 'vide')}
                </div>
            `
        ),
        issueBlock(
            'Cours à surveiller',
            report.courseIssues,
            (issue) => `
                <div style="color:#aaa; font-size:.88rem; line-height:1.45; border-left:3px solid ${issue.level === 'error' ? 'var(--accent-red)' : issue.level === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-blue)'}; padding-left:.75rem;">
                    <strong style="color:white;">${esc(issue.title)}</strong><br>${esc(issue.message)}
                </div>
            `
        ),
        issueBlock(
            'Formations à surveiller',
            report.formationIssues,
            (issue) => `
                <div style="color:#aaa; font-size:.88rem; line-height:1.45; border-left:3px solid ${issue.level === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-blue)'}; padding-left:.75rem;">
                    <strong style="color:white;">${esc(issue.title)}</strong><br>${esc(issue.message)}
                </div>
            `
        ),
        issueBlock(
            'Utilisateurs pédagogiques sans formation',
            report.unassignedUsers,
            (item) => `<span style="color:#aaa; font-size:.9rem;">${esc(labelUser(item.user))} · ${esc(item.role)}</span>`
        )
    ].filter(Boolean).join('');
}

async function runAccessDiagnostic() {
    const scanButton = el(IDS.scan);
    const summary = el(IDS.summary);

    setButton(scanButton, true, { loading: 'Scan en cours...', idle: 'Scanner les accès' });
    setBadge('Scan...', 'idle');
    if (summary) summary.textContent = 'Lecture des formations, utilisateurs et cours...';

    try {
        await assertAdmin();
        lastReport = analyze(await loadData());
        window.SBI_ACCESS_REPORT = lastReport;
        render(lastReport);
        return lastReport;
    } catch (error) {
        console.error('[SBI Access Diagnostic] Scan impossible :', error);
        setBadge('Erreur', 'error');
        if (summary) summary.textContent = error?.message || 'Erreur pendant le diagnostic.';
        throw error;
    } finally {
        setButton(scanButton, false, { loading: 'Scan en cours...', idle: 'Scanner les accès' });
    }
}

async function runFormationIndexRepair() {
    const repairButton = el(IDS.repair);
    const summary = el(IDS.summary);

    const confirmed = window.confirm(
        'Relancer la synchronisation users.formationIds / users.formationsAcces depuis les documents formations ?\n\n' +
        'Cette action écrit uniquement sur les index de formation des utilisateurs. Elle ne modifie pas les cours.'
    );

    if (!confirmed) return null;

    setButton(repairButton, true, { loading: 'Réparation...', idle: 'Réparer index users' });
    setBadge('Réparation...', 'warning');
    if (summary) summary.textContent = 'Synchronisation des index utilisateurs en cours...';

    try {
        await assertAdmin();
        const result = await syncAllUserFormationIndexes();
        if (summary) {
            summary.textContent = `Réparation terminée : ${result.updated || 0} utilisateur(s) mis à jour, ${result.skipped || 0} déjà correct(s). Nouveau scan lancé.`;
        }
        await runAccessDiagnostic();
        return result;
    } catch (error) {
        console.error('[SBI Access Diagnostic] Réparation impossible :', error);
        setBadge('Erreur', 'error');
        if (summary) summary.textContent = error?.message || 'Erreur pendant la réparation.';
        throw error;
    } finally {
        setButton(repairButton, false, { loading: 'Réparation...', idle: 'Réparer index users' });
    }
}

function bindUi() {
    const root = el(IDS.root);
    if (!root || root.dataset.sbiCourseAccessDiagnosticsBound === 'true') return;

    root.dataset.sbiCourseAccessDiagnosticsBound = 'true';
    el(IDS.scan)?.addEventListener('click', runAccessDiagnostic);
    el(IDS.repair)?.addEventListener('click', runFormationIndexRepair);
}

export function initCourseAccessDiagnostics() {
    if (initialized) return;
    initialized = true;

    window.SBI_ACCESS_DIAGNOSTIC = runAccessDiagnostic;
    window.SBI_ACCESS_REPAIR = runFormationIndexRepair;
    window.SBI_ACCESS_REPORT = lastReport;

    bindUi();
    window.addEventListener('sbi:admin-tab-changed', bindUi);
    window.addEventListener('sbi:admin-index-restored', bindUi);
    window.addEventListener('sbi:app-shell:navigated', bindUi);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindUi, { once: true });
    }
}
