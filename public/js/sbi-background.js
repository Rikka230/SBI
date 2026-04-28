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
 * =======================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('[data-sbi-background]')) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const particleCount = prefersReducedMotion ? 12 : 25;
    const lineCount = prefersReducedMotion ? 3 : 7;

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
});