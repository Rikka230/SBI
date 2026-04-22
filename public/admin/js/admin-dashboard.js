/**
 * =======================================================================
 * ADMIN DASHBOARD - Statistiques en temps réel
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    
    // Attendre que Firebase confirme la connexion avant de charger les stats
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadDashboardStats();
        }
    });

    // Rendre la carte "En attente" cliquable pour aller valider directement
    const pendingCard = document.getElementById('card-pending');
    if (pendingCard) {
        pendingCard.addEventListener('click', () => {
            window.location.href = 'formations-cours.html';
        });
    }
});

async function loadDashboardStats() {
    try {
        // 1. Comptage des Utilisateurs (Profs / Étudiants)
        const usersSnap = await getDocs(collection(db, "users"));
        let studentCount = 0;
        let teacherCount = 0;

        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.role === 'student') studentCount++;
            if (data.role === 'teacher') teacherCount++;
        });

        // 2. Comptage des Cours (Total / À Valider)
        const coursesSnap = await getDocs(collection(db, "courses"));
        let totalCourses = 0;
        let pendingCourses = 0;

        coursesSnap.forEach(doc => {
            const data = doc.data();
            totalCourses++;
            // On compte les cours qui ont le statut "pending"
            if (data.statutValidation === 'pending') pendingCourses++;
        });

        // 3. Injection dans l'interface HTML
        animateValue('stat-students', 0, studentCount, 800);
        animateValue('stat-teachers', 0, teacherCount, 800);
        animateValue('stat-courses', 0, totalCourses, 800);
        animateValue('stat-pending', 0, pendingCourses, 800);

    } catch (error) {
        console.error("Erreur de chargement du dashboard :", error);
        document.getElementById('stat-students').textContent = "-";
        document.getElementById('stat-teachers').textContent = "-";
        document.getElementById('stat-courses').textContent = "-";
        document.getElementById('stat-pending').textContent = "-";
    }
}

// Petite fonction sympa pour faire défiler les chiffres de 0 au résultat
function animateValue(id, start, end, duration) {
    if (start === end) {
        document.getElementById(id).textContent = end;
        return;
    }
    const obj = document.getElementById(id);
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
