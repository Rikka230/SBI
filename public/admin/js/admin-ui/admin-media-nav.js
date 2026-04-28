function emitNavigationMutation() {
    window.dispatchEvent(new CustomEvent('sbi:navigation-mutated'));
}

export function initAdminMediaNav() {
    if (!window.location.pathname.toLowerCase().startsWith('/admin/')) return;

    const inject = () => {
        const menu = document.querySelector('#left-panel .nav-menu');
        if (!menu) return;

        if (document.getElementById('nav-site-index')) {
            emitNavigationMutation();
            return;
        }

        const item = document.createElement('li');
        item.className = `nav-item ${window.location.pathname.includes('site-index-settings.html') ? 'active' : ''}`;
        item.id = 'nav-site-index';
        item.setAttribute('data-sbi-href', '/admin/site-index-settings.html');
        item.setAttribute('data-href', '/admin/site-index-settings.html');
        item.setAttribute('role', 'link');
        item.setAttribute('tabindex', '0');
        item.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm2 2h4v3H8V9zm6 0h3v1.5h-3V9zm0 2.5h3V13h-3v-1.5zM8 14h9v1.5H8V14z"/></svg>
            <span class="nav-text">Gestion Accueil</span>
        `;

        const settings = document.getElementById('nav-settings');
        if (settings && settings.parentElement === menu) {
            menu.insertBefore(item, settings);
        } else {
            menu.appendChild(item);
        }

        emitNavigationMutation();
    };

    window.setTimeout(inject, 80);
}
