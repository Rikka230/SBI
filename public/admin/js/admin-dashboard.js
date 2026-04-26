/**
 * =======================================================================
 * ADMIN DASHBOARD - Statistiques admin query-safe
 * =======================================================================
 *
 * Étape 5.2.4 :
 * - remplace les scans users/courses par des count queries serveur
 * - évite de télécharger tous les documents juste pour afficher les stats
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import {
    collection,
    getCountFromServer,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadDashboardStats();
        }
    });

    const pendingCard = document.getElementById('card-pending');
    if (pendingCard) {
        pendingCard.addEventListener('click', () => {
            window.location.href = 'formations-cours.html';
        });
    }
});

async function countCollection(collectionName, constraints = []) {
    const baseRef = collection(db, collectionName);
    const countQuery = constraints.length > 0
        ? query(baseRef, ...constraints)
        : baseRef;

    const snap = await getCountFromServer(countQuery);
    return snap.data().count || 0;
}

async function loadDashboardStats() {
    try {
        const [studentCount, teacherCount, totalCourses, pendingCourses] = await Promise.all([
            countCollection('users', [where('role', '==', 'student')]),
            countCollection('users', [where('role', '==', 'teacher')]),
            countCollection('courses'),
            countCollection('courses', [where('statutValidation', '==', 'pending')])
        ]);

        animateValue('stat-students', 0, studentCount, 800);
        animateValue('stat-teachers', 0, teacherCount, 800);
        animateValue('stat-courses', 0, totalCourses, 800);
        animateValue('stat-pending', 0, pendingCourses, 800);

    } catch (error) {
        console.error("Erreur de chargement du dashboard :", error);

        ['stat-students', 'stat-teachers', 'stat-courses', 'stat-pending'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = "-";
        });
    }
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;

    if (start === end) {
        obj.textContent = end;
        return;
    }

    let startTimestamp = null;

    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;

        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.textContent = Math.floor(progress * (end - start) + start);

        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };

    window.requestAnimationFrame(step);
}
