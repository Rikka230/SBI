import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

function setAdminReturnVisible(isVisible) {
    document.body.classList.toggle('sbi-admin-visitor', isVisible);

    document.querySelectorAll('.admin-return-link').forEach((button) => {
        button.setAttribute('aria-hidden', String(!isVisible));
        button.tabIndex = isVisible ? 0 : -1;
    });
}

export function initAdminVisitorShortcut() {
    const path = window.location.pathname;
    const isRoleSpace = path.startsWith('/teacher/') || path.startsWith('/student/');

    // Sécurité : invisible par défaut, même si le panel est rétracté.
    setAdminReturnVisible(false);

    if (!isRoleSpace || !document.querySelector('.admin-return-link')) {
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            setAdminReturnVisible(false);
            return;
        }

        try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const userData = userSnap.exists() ? userSnap.data() : null;
            const canReturnToAdmin = userData?.isGod === true || userData?.role === 'admin';
            setAdminReturnVisible(canReturnToAdmin);
        } catch (error) {
            console.warn('[SBI UI] Impossible de vérifier le raccourci admin :', error);
            setAdminReturnVisible(false);
        }
    });
}
