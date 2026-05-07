(function () {
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const sectionSelectors = [
        '.section-parcours',
        '.section-why-sbi',
        '.section-stats',
        '.section-qualiopi, .sbi-qualiopi-section',
        '.section-newsletter'
    ];
    const sparkPositions = ['32%', '34%', '58%', '74%', '48%'];
    let frame = 0;

    const getMain = () => document.querySelector('main');

    const ensureOverlay = (main) => {
        let overlay = main.querySelector(':scope > .sbi-diagonal-overlay');

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sbi-diagonal-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            main.appendChild(overlay);
        }

        return overlay;
    };

    const removeOverlay = () => {
        document.querySelectorAll('.sbi-diagonal-overlay').forEach((overlay) => overlay.remove());
    };

    const getUniqueSections = () => {
        const seen = new Set();

        return sectionSelectors
            .map((selector) => document.querySelector(selector))
            .filter((section) => {
                if (!section || seen.has(section)) return false;
                seen.add(section);
                return true;
            });
    };

    const renderOverlay = () => {
        frame = 0;

        if (!mobileQuery.matches) {
            removeOverlay();
            return;
        }

        const main = getMain();
        if (!main) return;

        const overlay = ensureOverlay(main);
        const mainTop = main.getBoundingClientRect().top + window.scrollY;

        overlay.replaceChildren();

        getUniqueSections().forEach((section, index) => {
            const rect = section.getBoundingClientRect();
            const top = rect.top + window.scrollY - mainTop;
            const line = document.createElement('span');

            line.className = 'sbi-diagonal-overlay__line';
            line.style.top = `${Math.round(top)}px`;
            line.style.setProperty('--sbi-diagonal-overlay-spark-x', sparkPositions[index] || '62%');
            line.style.setProperty('--sbi-diagonal-overlay-opacity', index === 4 ? '0.44' : '0.54');
            line.style.animationDelay = `${index * 0.32}s`;

            overlay.appendChild(line);
        });
    };

    const scheduleRender = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(renderOverlay);
    };

    const init = () => {
        scheduleRender();
        window.addEventListener('resize', scheduleRender, { passive: true });
        window.addEventListener('orientationchange', scheduleRender, { passive: true });

        document.querySelectorAll('img').forEach((img) => {
            if (!img.complete) img.addEventListener('load', scheduleRender, { once: true });
        });

        if (document.fonts?.ready) {
            document.fonts.ready.then(scheduleRender).catch(() => {});
        }
    };

    mobileQuery.addEventListener?.('change', scheduleRender);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}());
