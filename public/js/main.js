/**
 * =======================================================================
 * LOGIQUE FRONT-OFFICE PUBLIC (Vanilla JS)
 * =======================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

    /* --- SECTION 1 : ANIMATION D'APPARITION AU SCROLL --- */
    const initScrollAnimations = () => {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.10
        };

        const observer = new IntersectionObserver((entries, observerInstance) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observerInstance.unobserve(entry.target);
                }
            });
        }, observerOptions);

        const elementsToAnimate = document.querySelectorAll('.fade-in');
        elementsToAnimate.forEach(el => observer.observe(el));
    };

    /* --- SECTION 2 : EFFET PARALLAXE SUR LES FONDS --- */
    const initParallax = () => {
        const parallaxLines = document.getElementById('parallax-lines');
        const parallaxField = document.getElementById('parallax-field');

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
            if (!ticking) {
                window.requestAnimationFrame(updateParallax);
                ticking = true;
            }
        }, { passive: true });

        updateParallax();
    };

    /* --- SECTION 3 : SIGNALS INTERACTIFS SBI --- */
    const initSignals = () => {
        const signals = document.querySelectorAll('.sbi-signal');
        if (!signals.length) return;

        const visibleState = new WeakMap();
        const timers = new WeakMap();

        const clearSignalTimers = (signal) => {
            const signalTimers = timers.get(signal);

            if (signalTimers) {
                signalTimers.forEach(timer => window.clearTimeout(timer));
            }

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
            entries.forEach(entry => {
                const signal = entry.target;
                const wasVisible = visibleState.get(signal) === true;

                if (entry.isIntersecting && !wasVisible) {
                    visibleState.set(signal, true);

                    const isHeroSignal = signal.classList.contains('sbi-signal-hero');
                    const delay = isHeroSignal ? 1900 : 1500;
                    const duration = isHeroSignal ? 3900 : 3700;

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
            rootMargin: '-10% 0px -20% 0px',
            threshold: 0.4
        });

        signals.forEach(signal => {
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
    };

    /* --- SECTION 4 : INITIALISATION GLOBALE --- */
    initScrollAnimations();
    initParallax();
    initSignals();
});