/**
 * =======================================================================
 * FOND ANIMÉ GLOBAL SBI
 * -----------------------------------------------------------------------
 * Injecte :
 * - la brume
 * - les particules
 * - le terrain de football
 * - les faisceaux lumineux
 *
 * Le terrain et les lasers sont dans deux calques séparés pour avoir
 * des vitesses de parallaxe différentes.
 *
 * SBI 8.0P.147 : charge le rendu public des blocs conformité formation
 * sur la page Formations, y compris après navigation PJAX.
 * =======================================================================
 */

function loadSbiFormationComplianceRenderer() {
    const page = document.body?.dataset?.sbiPublicPage || '';
    const path = window.location.pathname.toLowerCase();

    if (page !== 'formations' && !path.endsWith('/formations.html') && !path.endsWith('/formations')) return;

    import('/js/sbi-formation-compliance.js?v=8.0P.147')
        .catch((error) => console.warn('[SBI Background] Rendu conformité formation indisponible :', error));
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('[data-sbi-background]')) {
        const reduceBackgroundMotion = window.matchMedia('(max-width: 768px)').matches;
        const particleCount = reduceBackgroundMotion ? 0 : 46;
        const lineCount = reduceBackgroundMotion ? 0 : 20;

        const backgroundRoot = document.createElement('div');
        backgroundRoot.setAttribute('data-sbi-background', '');
        backgroundRoot.setAttribute('aria-hidden', 'true');
        backgroundRoot.className = 'sbi-background-root';

        const particles = Array.from({ length: particleCount }, () => '<div class="sbi-particle"></div>').join('');
        const lines = Array.from({ length: lineCount }, () => '<div class="sbi-line"></div>').join('');

        backgroundRoot.innerHTML = `
            <div class="fixed-bg-glow"></div>

            <div class="sbi-bg-fixed">
                <div class="sbi-fog sbi-fog-1"></div>
                <div class="sbi-fog sbi-fog-2"></div>
                ${particles}
            </div>

            <div class="sbi-field-parallax" id="parallax-field">
                <div class="sbi-football-field"></div>
            </div>

            <div class="sbi-bg-parallax" id="parallax-lines">
                ${lines}
            </div>
        `;

        document.body.prepend(backgroundRoot);
    }

    loadSbiFormationComplianceRenderer();
});

window.addEventListener('sbi:public-shell:navigated', loadSbiFormationComplianceRenderer);
