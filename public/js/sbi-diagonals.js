(function () {
    const DIAGONALS_VERSION = '8.0P.23';
    const mobileQuery = window.matchMedia('(max-width: 768px)');

    const sectionSelectors = [
        '.section-parcours',
        '.section-why-sbi',
        '.section-stats',
        '.section-qualiopi, .sbi-qualiopi-section',
        '.section-newsletter'
    ];

    const sparkPositions = ['34%', '28%', '58%', '74%', '48%'];
    let frame = 0;
    let resizeObserver = null;
    let mutationObserver = null;
    const observedSections = new WeakSet();

    function getMain() {
        return document.querySelector('main');
    }

    function getUniqueSections() {
        const seen = new Set();
        const sections = [];

        sectionSelectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((section) => {
                if (!section || seen.has(section)) return;
                seen.add(section);
                sections.push(section);
            });
        });

        return sections;
    }

    function ensureOverlay(main) {
        let overlay = Array.from(main.children).find((child) => child.classList?.contains('sbi-diagonal-overlay'));

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sbi-diagonal-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            main.appendChild(overlay);
        }

        return overlay;
    }

    function removeOverlay() {
        document.querySelectorAll('.sbi-diagonal-overlay').forEach((overlay) => overlay.remove());
    }

    function renderOverlay() {
        frame = 0;

        if (!mobileQuery.matches) {
            removeOverlay();
            return;
        }

        const main = getMain();
        if (!main) return;

        const sections = getUniqueSections();
        if (!sections.length) {
            removeOverlay();
            return;
        }

        const overlay = ensureOverlay(main);
        const mainRect = main.getBoundingClientRect();
        const scrollY = window.scrollY || window.pageYOffset || 0;

        const nextLines = sections
            .map((section, index) => {
                const rect = section.getBoundingClientRect();
                if (!rect.height) return '';

                const top = rect.top + scrollY - (mainRect.top + scrollY);
                const sectionStyles = window.getComputedStyle(section);
                const sectionCut = parseFloat(sectionStyles.getPropertyValue('--sbi-section-cut')) || 34;
                const overlayLineHeight = 46;
                const lineTop = Math.max(0, top + (sectionCut * 0.5) - (overlayLineHeight * 0.5));
                const angle = '-5deg';
                const opacity = section.matches('.section-stats') ? '0.86' : '0.68';
                const spark = sparkPositions[index % sparkPositions.length];

                return `<span class="sbi-diagonal-overlay__line" style="top:${lineTop}px; --sbi-diagonal-overlay-angle:${angle}; --sbi-diagonal-overlay-opacity:${opacity}; --sbi-diagonal-overlay-spark-x:${spark};"></span>`;
            })
            .join('');

        overlay.innerHTML = nextLines;
        overlay.dataset.sbiDiagonalsVersion = DIAGONALS_VERSION;
        overlay.dataset.sbiDiagonalLines = String(overlay.children.length);
    }

    function scheduleRender() {
        if (frame) return;
        frame = window.requestAnimationFrame(renderOverlay);
    }

    function observeLayout() {
        resizeObserver?.disconnect?.();

        if (!('ResizeObserver' in window)) return;

        resizeObserver = new ResizeObserver(scheduleRender);
        const main = getMain();
        if (main) resizeObserver.observe(main);

        getUniqueSections().forEach((section) => {
            if (observedSections.has(section)) return;
            observedSections.add(section);
            resizeObserver.observe(section);
        });
    }

    function observeDom() {
        mutationObserver?.disconnect?.();

        const main = getMain();
        if (!main || !('MutationObserver' in window)) return;

        mutationObserver = new MutationObserver(() => {
            observeLayout();
            scheduleRender();
        });

        mutationObserver.observe(main, {
            childList: true,
            subtree: false
        });
    }

    function initSbiDiagonals() {
        observeLayout();
        observeDom();
        scheduleRender();
    }

    window.SBI_RENDER_DIAGONALS = initSbiDiagonals;
    window.SBI_DIAGONALS_STATUS = function () {
        return {
            version: DIAGONALS_VERSION,
            mobile: mobileQuery.matches,
            hasOverlay: Boolean(document.querySelector('.sbi-diagonal-overlay')),
            lines: document.querySelectorAll('.sbi-diagonal-overlay__line').length
        };
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSbiDiagonals, { once: true });
    } else {
        initSbiDiagonals();
    }

    window.addEventListener('resize', scheduleRender, { passive: true });
    window.addEventListener('orientationchange', scheduleRender, { passive: true });
    window.addEventListener('load', scheduleRender, { passive: true });
    window.addEventListener('sbi:public-shell:navigated', initSbiDiagonals);
    window.addEventListener('sbi:public-shell:chrome-preserved', initSbiDiagonals);

    if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', initSbiDiagonals);
    } else if (typeof mobileQuery.addListener === 'function') {
        mobileQuery.addListener(initSbiDiagonals);
    }
}());
