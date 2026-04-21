/**
 * =======================================================================
 * NOTIFICATIONS - Écoute temps réel et Interface du panneau
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, query, onSnapshot, doc, updateDoc, arrayUnion, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUid = null;
let currentUserProfile = null;

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            const userSnap = await getDoc(doc(db, "users", currentUid));
            if(userSnap.exists()) currentUserProfile = userSnap.data();
            initNotificationsRealtime();
        }
    });

    const bellBtn = document.getElementById('notif-bell-btn');
    const profileSection = document.getElementById('profile-section');
    const notifSection = document.getElementById('notifications-section');
    const titleNotif = document.getElementById('notif-panel-title');

    if(bellBtn) {
        bellBtn.addEventListener('click', () => {
            if(notifSection.style.display === 'none') {
                profileSection.style.display = 'none';
                notifSection.style.display = 'block';
                titleNotif.style.display = 'block';
                bellBtn.querySelector('svg').style.fill = 'var(--accent-blue)';
            } else {
                profileSection.style.display = 'block';
                notifSection.style.display = 'none';
                titleNotif.style.display = 'none';
                bellBtn.querySelector('svg').style.fill = 'var(--text-muted)';
            }
        });
    }
});

function initNotificationsRealtime() {
    const q = query(collection(db, "notifications"));
    
    onSnapshot(q, (snapshot) => {
        const notifs = [];
        let unreadCount = 0;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // 1. Si la notification t'est adressée spécifiquement (ex: Le Prof qui reçoit la validation)
            if (data.destinataireId) {
                if (data.destinataireId === currentUid) {
                    notifs.push({ id: docSnap.id, ...data });
                    if (!data.readBy || !data.readBy.includes(currentUid)) unreadCount++;
                }
            } 
            // 2. Sinon, c'est une alerte pour les Admins (ex: Un prof a soumis un cours)
            else if (currentUserProfile && (currentUserProfile.role === 'admin' || currentUserProfile.isGod)) {
                if (data.auteurId !== currentUid) {
                    notifs.push({ id: docSnap.id, ...data });
                    if (!data.readBy || !data.readBy.includes(currentUid)) unreadCount++;
                }
            }
        });

        updateRedBadges(unreadCount);
        renderNotificationsList(notifs);
    });
}

function updateRedBadges(count) {
    const bellBadge = document.getElementById('bell-badge');
    const avatarBadge = document.getElementById('avatar-badge');
    
    if (count > 0) {
        const displayCount = count > 9 ? '9+' : count;
        if(bellBadge) { bellBadge.textContent = displayCount; bellBadge.style.display = 'flex'; }
        if(avatarBadge) { avatarBadge.textContent = displayCount; avatarBadge.style.display = 'flex'; }
    } else {
        if(bellBadge) bellBadge.style.display = 'none';
        if(avatarBadge) avatarBadge.style.display = 'none';
    }
}

function renderNotificationsList(notifs) {
    const container = document.getElementById('notifications-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (notifs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 2rem;">Aucune nouvelle notification.</p>';
        return;
    }

    notifs.sort((a,b) => (b.dateCreation?.toMillis() || 0) - (a.dateCreation?.toMillis() || 0));

    notifs.forEach(notif => {
        const isUnread = !notif.readBy || !notif.readBy.includes(currentUid);
        const dotIndicator = isUnread ? `<div style="width:8px; height:8px; background:var(--accent-red); border-radius:50%; flex-shrink:0; margin-top: 5px;"></div>` : '';
        
        let titleText = "";
        let bodyText = "";
        let iconSvg = "";
        
        // Affichage différent selon le type de notification
        if (notif.type === 'course_approved') {
            titleText = "🎉 Cours Validé !";
            bodyText = `Votre cours "<span style="color:white;">${notif.courseTitle}</span>" a été validé et publié.`;
            iconSvg = `<svg width="20" height="20" fill="var(--accent-green)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
        } else {
            titleText = "Validation Requise";
            bodyText = `<strong>${notif.auteurName}</strong> a soumis le cours "<span style="color:white;">${notif.courseTitle}</span>".`;
            iconSvg = `<svg width="20" height="20" fill="var(--accent-yellow)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
        }

        const html = `
            <div class="notif-item ${isUnread ? 'unread' : ''}" data-id="${notif.id}" data-course="${notif.courseId}">
                ${dotIndicator}
                <div style="flex-shrink:0;">${iconSvg}</div>
                <div>
                    <p style="margin:0; font-size:0.85rem; color:var(--text-main); font-weight:bold;">${titleText}</p>
                    <p style="margin:0.3rem 0 0 0; font-size:0.8rem; color:var(--text-muted); line-height: 1.4;">
                        ${bodyText}
                    </p>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });

    document.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            const notifId = e.currentTarget.getAttribute('data-id');
            const courseId = e.currentTarget.getAttribute('data-course');
            
            await updateDoc(doc(db, "notifications", notifId), {
                readBy: arrayUnion(currentUid)
            });

            // Si on clique, on ouvre l'éditeur de cours direct
            if(window.location.pathname.includes('formations-cours.html')) {
                if(typeof window.editCourse === 'function') window.editCourse(courseId);
            } else {
                window.location.href = `formations-cours.html?tab=tab-editor&edit=${courseId}`;
            }
        });
    });
}
