/**
 * =======================================================================
 * LOGIQUE FRONT-OFFICE PUBLIC (Vanilla JS)
 * =======================================================================
 */

(function () {
    const MOBILE_MEDIA = '(max-width: 768px)';
    const REDUCED_MOTION_MEDIA = '(prefers-reduced-motion: reduce)';

    function initMobileMenu(root = document) {
        const doc = root.ownerDocument || document;
        const header = doc.querySelector('.site-header');
        const toggle = doc.querySelector('.mobile-menu-toggle');

        if (!header || !toggle || header.dataset.sbiMobileMenuReady === 'true') return;

        header.dataset.sbiMobileMenuReady = 'true';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'sbi-mobile-menu');
        header.setAttribute('id', header.id || 'sbi-mobile-menu');

        const setMenuOpen = (isOpen) => {
            header.classList.toggle('is-mobile-menu-open', isOpen);
            doc.body.classList.toggle('sbi-mobile-menu-open', isOpen);
            toggle.classList.toggle('is-active', isOpen);
            toggle.setAttribute('aria-expanded', String(isOpen));
            toggle.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
        };

        toggle.addEventListener('click', () => {
            setMenuOpen(!header.classList.contains('is-mobile-menu-open'));
        });

        header.addEventListener('click', (event) => {
            const link = event.target.closest?.('.main-nav a, .header-actions a');
            if (link) setMenuOpen(false);
        });

        doc.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') setMenuOpen(false);
        });

        window.addEventListener('resize', () => {
            if (!window.matchMedia(MOBILE_MEDIA).matches) setMenuOpen(false);
        }, { passive: true });
    }

    function initScrollAnimations(root = document) {
        const elementsToAnimate = Array.from(root.querySelectorAll('.fade-in'))
            .filter((element) => element.dataset.sbiFadeReady !== 'true');

        if (!elementsToAnimate.length) return;

        if (!('IntersectionObserver' in window)) {
            elementsToAnimate.forEach((element) => {
                element.classList.add('visible');
                element.dataset.sbiFadeReady = 'true';
            });
            return;
        }

        const observer = new IntersectionObserver((entries, observerInstance) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                entry.target.classList.add('visible');
                entry.target.dataset.sbiFadeReady = 'true';
                observerInstance.unobserve(entry.target);
            });
        }, {
            root: null,
            rootMargin: '0px',
            threshold: 0.10
        });

        elementsToAnimate.forEach((element) => {
            element.dataset.sbiFadeReady = 'pending';
            observer.observe(element);
        });
    }

    function initParallax(root = document) {
        if (document.documentElement.dataset.sbiParallaxReady === 'true') return;
        if (window.matchMedia(`${MOBILE_MEDIA}, ${REDUCED_MOTION_MEDIA}`).matches) return;

        const parallaxLines = root.getElementById?.('parallax-lines') || document.getElementById('parallax-lines');
        const parallaxField = root.getElementById?.('parallax-field') || document.getElementById('parallax-field');

        if (!parallaxLines && !parallaxField) return;

        document.documentElement.dataset.sbiParallaxReady = 'true';

        const lineSpeed = 0.12;
        const fieldSpeed = 0.045;
        let ticking = false;

        const updateParallax = () => {
            const scrolled = window.scrollY;

            if (parallaxLines) {
                parallaxLines.style.transform = `translate3d(0, ${scrolled * lineSpeed}px, 0)`;
            }

            if (parallaxField) {
                parallaxField.style.transform = `translate3d(0, ${scrolled * fieldSpeed}px, 0)`;
            }

            ticking = false;
        };

        window.addEventListener('scroll', () => {
            if (ticking) return;

            window.requestAnimationFrame(updateParallax);
            ticking = true;
        }, { passive: true });

        updateParallax();
    }

    function initSignals(root = document) {
        const signals = Array.from(root.querySelectorAll('.sbi-signal'))
            .filter((signal) => signal.dataset.sbiSignalReady !== 'true');

        if (!signals.length || window.matchMedia(REDUCED_MOTION_MEDIA).matches) return;

        const isMobile = window.matchMedia(MOBILE_MEDIA).matches;

        const visibleState = new WeakMap();
        const timers = new WeakMap();

        const clearSignalTimers = (signal) => {
            const signalTimers = timers.get(signal);
            if (signalTimers) signalTimers.forEach((timer) => window.clearTimeout(timer));
            timers.set(signal, []);
        };

        const addSignalTimer = (signal, timer) => {
            const signalTimers = timers.get(signal) || [];
            signalTimers.push(timer);
            timers.set(signal, signalTimers);
        };

        const revealSignal = (signal, duration = 3600, delay = 0) => {
            clearSignalTimers(signal);

            const openTimer = window.setTimeout(() => {
                signal.classList.add('is-revealed', 'is-attention');

                const attentionTimer = window.setTimeout(() => {
                    signal.classList.remove('is-attention');
                }, 1100);

                const closeTimer = window.setTimeout(() => {
                    if (!signal.matches(':hover') && !signal.matches(':focus-within')) {
                        signal.classList.remove('is-revealed', 'is-attention');
                    }
                }, duration);

                addSignalTimer(signal, attentionTimer);
                addSignalTimer(signal, closeTimer);
            }, delay);

            addSignalTimer(signal, openTimer);
        };

        const signalObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const signal = entry.target;
                const wasVisible = visibleState.get(signal) === true;

                if (entry.isIntersecting && !wasVisible) {
                    visibleState.set(signal, true);

                    const isHeroSignal = signal.classList.contains('sbi-signal-hero');
                    const isFounderSignal = signal.classList.contains('sbi-signal-founder');
                    const delay = isMobile
                        ? (isHeroSignal ? 850 : (isFounderSignal ? 220 : 650))
                        : (isHeroSignal ? 1900 : (isFounderSignal ? 350 : 1000));
                    const duration = isMobile
                        ? (isHeroSignal ? 4200 : (isFounderSignal ? 5200 : 3600))
                        : (isHeroSignal ? 3900 : (isFounderSignal ? 6200 : 4300));

                    revealSignal(signal, duration, delay);
                }

                if (!entry.isIntersecting && wasVisible) {
                    visibleState.set(signal, false);
                    signal.classList.remove('is-revealed', 'is-attention');
                    clearSignalTimers(signal);
                }
            });
        }, {
            root: null,
            rootMargin: isMobile ? '-2% 0px -10% 0px' : '-4% 0px -14% 0px',
            threshold: isMobile ? 0.18 : 0.24
        });

        signals.forEach((signal) => {
            signal.dataset.sbiSignalReady = 'true';
            visibleState.set(signal, false);
            signalObserver.observe(signal);

            signal.addEventListener('mouseenter', () => {
                clearSignalTimers(signal);
                signal.classList.add('is-revealed');
            });

            signal.addEventListener('mouseleave', () => {
                signal.classList.remove('is-revealed', 'is-attention');
            });

            signal.addEventListener('focusin', () => {
                clearSignalTimers(signal);
                signal.classList.add('is-revealed');
            });

            signal.addEventListener('focusout', () => {
                signal.classList.remove('is-revealed', 'is-attention');
            });
        });
    }

    function initSbiMain(root = document) {
        initMobileMenu(root);
        initScrollAnimations(root);
        initParallax(root);
        initSignals(root);
    }

    window.SBI_MAIN_INIT = initSbiMain;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initSbiMain(document), { once: true });
    } else {
        initSbiMain(document);
    }
})();
