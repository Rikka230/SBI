/* ================= 1. IMPORTS FIREBASE ================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";

/* ================= 2. CONFIGURATION FIREBASE ================= */
const firebaseConfig = {
  apiKey: "AIzaSyDd7OvBbX35PaQPlm6saccOGTQyvI3UEoU",
  authDomain: "usm-football-b56ba.firebaseapp.com",
  projectId: "usm-football-b56ba",
  storageBucket: "usm-football-b56ba.firebasestorage.app",
  messagingSenderId: "1004955626049",
  appId: "1:1004955626049:web:1982ac82e68599946f74c0",
  measurementId: "G-5FCYP7CMQD"
};

const app = initializeApp(firebaseConfig);

const firebaseHost = window.location.hostname;
const isFirebasePreviewHost = firebaseHost.startsWith('usm-football-b56ba--') && firebaseHost.endsWith('.web.app');
const isStableFirebaseHost = [
  'usm-football-b56ba.web.app',
  'usm-football-b56ba.firebaseapp.com',
  'usmfootball.com',
  'www.usmfootball.com',
  'localhost',
  '127.0.0.1'
].includes(firebaseHost);

// --- BOUCLIER ANTI-DDOS (APP CHECK + RECAPTCHA V3) ---
if (isStableFirebaseHost) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6LdF2rUsAAAAAOUCVKJt2DCDKWQIEQXHyBkYETT1'),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.warn('App Check non initialise:', error);
  }
} else if (isFirebasePreviewHost) {
  console.info('App Check ignore sur preview Firebase:', firebaseHost);
}

const db = getFirestore(app);
let analytics = null;
if (isStableFirebaseHost) {
  try { analytics = getAnalytics(app); }
  catch (error) { console.warn('Analytics non initialise:', error); }
}

/* ================= 2. SYSTEME DE CACHE ANTI-COÛT ================= */
const CACHE_TIME_24H = 1000 * 60 * 60 * 24; 

const Cache = {
    get: (key) => {
        const item = localStorage.getItem(key);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (Date.now() - parsed.timestamp > CACHE_TIME_24H) {
            localStorage.removeItem(key);
            return null;
        }
        return parsed.data;
    },
    set: (key, data) => localStorage.setItem(key, JSON.stringify({timestamp: Date.now(), data}))
};



/* ================= 2B. CHARGEMENT PROGRESSIF PUBLIC ================= */
const LoadingUI = {
    showServices() {
        const container = document.getElementById('services-container');
        if (!container || container.dataset.ready === 'true' || container.children.length) return;
        container.classList.add('is-loading', 'progressive-zone');
        container.innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton-card skeleton-service-card" aria-hidden="true"></div>').join('');
    },
    showRoster() {
        return;
    },
    showPresse() {
        ['videos-container', 'articles-container', 'presse-videos-container', 'presse-articles-container'].forEach((id) => {
            const container = document.getElementById(id);
            if (!container || container.dataset.ready === 'true' || container.children.length) return;
            container.classList.add('is-loading', 'progressive-zone');
            container.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton-card skeleton-press-card" aria-hidden="true"></div>').join('');
        });
    },
    markReady(target) {
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return;
        el.dataset.ready = 'true';
        el.classList.remove('is-loading');
        el.classList.add('is-ready', 'progressive-zone');
    },
    imageLoaded(img) {
        if (!img) return;
        img.classList.add('loaded');
    }
};

/* ================= 3. TRADUCTION i18n ================= */
const translations = {
    fr: {
        nav_agency: "L'Agence", nav_services: "Services", nav_talents: "Les Talents", nav_press: "Presse", nav_button: "Contact",
        hero_subtitle: "Ensemble, développons vos talents.",
        stat_1_label: "Activité & Transactions", stat_1_desc: "Opérations réalisées sur le marché des transferts.",
        stat_4_label: "Réseau Mondial", stat_4_desc: "Contacts directs avec des clubs à travers le monde.",
        stat_2_label: "Confiance & Roster", stat_2_desc: "Joueurs gérés depuis 1998. +100 joueurs professionnels actuellement représentés.",
        stat_3_label: "Impact Digital (N°3 Mondial)", stat_3_sub: "Abonnés cumulés",
        services_label: "Accompagnement Global", services_title: "Services Exclusifs",
        vip_badge: "Fondateur & CEO", vip_quote: "...", vip_desc: "",
        roster_title: "USM FAMILY", filter_all: "Tous", filter_gk: "Gardiens", filter_def: "Défenseurs",
        legal_mentions: "Mentions Légales",
        contact_title: "Contact", contact_subtitle: "Discutons de votre avenir.",
        contact_info_title: "Nos Coordonnées", contact_hq: "Siège Social", contact_hq_val: "351, chemin des Gourettes - 06370 Mouans-Sartoux - France",
        contact_phone: "Téléphone", contact_phone_val: "+33 492 90 90 25",
        contact_email: "Email", contact_email_val: "contact@usmfootball.com",
        contact_form_title: "Envoyer un message",
        contact_ph_name: "Votre nom complet", contact_ph_email: "Votre adresse email", contact_ph_phone: "Votre numéro de téléphone",
        contact_opt_player: "Je suis un joueur", contact_opt_club: "Je représente un club", contact_opt_coach: "Je suis coach", contact_opt_staff: "Je suis membre du staff", contact_opt_other: "Autre demande",
        contact_ph_msg: "Votre message...", contact_btn_send: "Envoyer le message",
        back_services: "❮ Retour à l'accueil", other_services: "Naviguer"
    },
    en: {
        nav_agency: "The Agency", nav_services: "Services", nav_talents: "Talents", nav_press: "Press", nav_button: "Contact",
        hero_subtitle: "Together, let's develop your talents.",
        stat_1_label: "Activity & Transactions", stat_1_desc: "Transfer market operations completed.",
        stat_4_label: "Global Network", stat_4_desc: "Direct contacts with clubs worldwide.",
        stat_2_label: "Trust & Roster", stat_2_desc: "Players managed since 1998. +100 pro players currently represented.",
        stat_3_label: "Digital Impact (#3 Worldwide)", stat_3_sub: "Total Followers",
        services_label: "Global Support", services_title: "Exclusive Services",
        vip_badge: "Founder & CEO", vip_quote: "...", vip_desc: "", 
        roster_title: "USM FAMILY", filter_all: "All", filter_gk: "Goalkeepers", filter_def: "Defenders",
        legal_mentions: "Legal Notice",
        contact_title: "Contact", contact_subtitle: "Let's discuss your future.",
        contact_info_title: "Our Details", contact_hq: "Headquarters", contact_hq_val: "351, chemin des Gourettes - 06370 Mouans-Sartoux - France",
        contact_phone: "Phone", contact_phone_val: "+33 492 90 90 25",
        contact_email: "Email", contact_email_val: "contact@usmfootball.com",
        contact_form_title: "Send a message",
        contact_ph_name: "Your full name", contact_ph_email: "Your email address", contact_ph_phone: "Your phone number",
        contact_opt_player: "I am a player", contact_opt_club: "I represent a club", contact_opt_coach: "I am a coach", contact_opt_staff: "I am a staff member", contact_opt_other: "Other request",
        contact_ph_msg: "Your message...", contact_btn_send: "Send message",
        back_services: "❮ Back to Home", other_services: "Navigate"
    },
    es: {
        nav_agency: "La Agencia", nav_services: "Servicios", nav_talents: "Los Talentos", nav_press: "Prensa", nav_button: "Contacto",
        hero_subtitle: "Juntos, desarrollemos tus talentos.",
        stat_1_label: "Actividad y Transacciones", stat_1_desc: "Operaciones realizadas en el mercado de fichajes.",
        stat_4_label: "Red Mundial", stat_4_desc: "Contactos directos con clubes de todo el mundo.",
        stat_2_label: "Confianza y Roster", stat_2_desc: "Jugadores gestionados desde 1998. +100 jugadores profesionales representados actualmente.",
        stat_3_label: "Impacto Digital (N°3 Mundial)", stat_3_sub: "Seguidores totales",
        services_label: "Acompañamiento Global", services_title: "Servicios Exclusivos",
        vip_badge: "Fundador y CEO", vip_quote: "...", vip_desc: "", 
        roster_title: "USM FAMILY", filter_all: "Todos", filter_gk: "Porteros", filter_def: "Defensas",
        legal_mentions: "Aviso Legal",
        contact_title: "Contacto", contact_subtitle: "Hablemos de tu futuro.",
        contact_info_title: "Nuestros Datos", contact_hq: "Sede Central", contact_hq_val: "351, chemin des Gourettes - 06370 Mouans-Sartoux - Francia",
        contact_phone: "Teléfono", contact_phone_val: "+33 492 90 90 25",
        contact_email: "Email", contact_email_val: "contact@usmfootball.com",
        contact_form_title: "Enviar un mensaje",
        contact_ph_name: "Tu nombre completo", contact_ph_email: "Tu correo electrónico", contact_ph_phone: "Tu número de teléfono",
        contact_opt_player: "Soy jugador", contact_opt_club: "Represento a un club", contact_opt_coach: "Soy entrenador", contact_opt_staff: "Soy miembro del staff", contact_opt_other: "Otra consulta",
        contact_ph_msg: "Tu mensaje...", contact_btn_send: "Enviar mensaje",
        back_services: "❮ Volver al inicio", other_services: "Navegar"
    },
    pt: {
        nav_agency: "A Agência", nav_services: "Serviços", nav_talents: "Os Talentos", nav_press: "Imprensa", nav_button: "Contato",
        hero_subtitle: "Juntos, vamos desenvolver seus talentos.",
        stat_1_label: "Atividade e Transações", stat_1_desc: "Operações realizadas no mercado de transferências.",
        stat_4_label: "Rede Global", stat_4_desc: "Contactos diretos com clubes em todo o mundo.",
        stat_2_label: "Confiança e Roster", stat_2_desc: "Jogadores gerenciados desde 1998. +100 jogadores profissionais atualmente representados.",
        stat_3_label: "Impacto Digital (N°3 Mundial)", stat_3_sub: "Seguidores totais",
        services_label: "Acompanhamento Global", services_title: "Serviços Exclusivos",
        vip_badge: "Fundador e CEO", vip_quote: "...", vip_desc: "", 
        roster_title: "USM FAMILY", filter_all: "Todos", filter_gk: "Goleiros", filter_def: "Defensores",
        legal_mentions: "Aviso Legal",
        contact_title: "Contato", contact_subtitle: "Vamos discutir o seu futuro.",
        contact_info_title: "Nossos Dados", contact_hq: "Sede", contact_hq_val: "351, chemin des Gourettes - 06370 Mouans-Sartoux - França",
        contact_phone: "Telefone", contact_phone_val: "+33 492 90 90 25",
        contact_email: "Email", contact_email_val: "contact@usmfootball.com",
        contact_form_title: "Enviar uma mensagem",
        contact_ph_name: "Seu nome completo", contact_ph_email: "Seu endereço de email", contact_ph_phone: "Seu número de telefone",
        contact_opt_player: "Sou jogador", contact_opt_club: "Represento um clube", contact_opt_coach: "Sou treinador", contact_opt_staff: "Sou membro da equipa", contact_opt_other: "Outro pedido",
        contact_ph_msg: "Sua mensagem...", contact_btn_send: "Enviar mensagem",
        back_services: "❮ Voltar ao Início", other_services: "Navegar"
    }
};

window.currentServiceData = null; 
window.currentServiceId = null;

/* ================= 4. LOGIQUE GLOBALE ================= */
document.addEventListener("DOMContentLoaded", async () => { 
    const langSelect = document.getElementById('lang-select');
    let currentLang = localStorage.getItem('usm_lang') || 'fr';
    if (!translations[currentLang]) currentLang = 'fr';
    if(langSelect) langSelect.value = currentLang;

    // LOGIQUE DES ONGLETS AGENCE / FONDATEUR - DOUBLE IMAGE STABLE
    const vipTabs = {
        founder: document.getElementById('tab-founder'),
        agency: document.getElementById('tab-agency')
    };

    const vipEls = {
        section: document.querySelector('.founder-vip-section'),
        photoWrapper: document.querySelector('.vip-photo-wrapper'),
        image: document.getElementById('vip-img-display'),
        agencyImage: null,
        content: document.querySelector('.vip-content'),
        title: document.getElementById('vip-title-display'),
        quote: document.getElementById('vip-quote-display'),
        desc: document.getElementById('vip-desc-display'),
        licenses: document.getElementById('vip-licenses-display')
    };

    const vipImageCache = new Map();
    let vipAgencyPromise = null;
    let vipSwitchId = 0;
    let currentVipMode = 'founder';
    let founderImageUrl = '';
    let agencyImageUrl = '';

    const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const smallDelay = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));

    const normalizeVipUrl = (url) => {
        if (!url) return '';
        try { return new URL(url, window.location.href).href; }
        catch (e) { return url; }
    };

    const preloadVipImage = (url, timeout = 6500) => {
        const normalizedUrl = normalizeVipUrl(url);
        if (!normalizedUrl) return Promise.resolve(false);
        if (vipImageCache.has(normalizedUrl)) return vipImageCache.get(normalizedUrl);

        const promise = new Promise((resolve) => {
            const img = new Image();
            let done = false;
            const finish = (ok) => {
                if (done) return;
                done = true;
                resolve(ok);
            };

            img.decoding = 'async';
            img.onload = async () => {
                try { if (img.decode) await img.decode(); } catch (e) {}
                finish(true);
            };
            img.onerror = () => finish(false);
            setTimeout(() => finish(false), timeout);
            img.src = normalizedUrl;
        });

        vipImageCache.set(normalizedUrl, promise);
        return promise;
    };

    const ensureVipPhotoLayers = () => {
        if (!vipEls.photoWrapper || !vipEls.image) return;

        vipEls.image.classList.add('vip-layer-founder');
        vipEls.image.dataset.vipLayer = 'founder';
        vipEls.image.style.opacity = '1';

        let agencyLayer = document.getElementById('vip-agency-img-display');
        if (!agencyLayer) {
            agencyLayer = document.createElement('img');
            agencyLayer.id = 'vip-agency-img-display';
            agencyLayer.className = 'vip-layer-agency';
            agencyLayer.alt = 'Agence USM Football';
            agencyLayer.decoding = 'async';
            agencyLayer.loading = 'eager';
            agencyLayer.setAttribute('aria-hidden', 'true');
            vipEls.image.insertAdjacentElement('afterend', agencyLayer);
        }
        vipEls.agencyImage = agencyLayer;
    };

    const getVipLang = () => localStorage.getItem('usm_lang') || currentLang || 'fr';

    const getFounderData = () => {
        const settings = Cache.get('site_settings') || {};
        const lang = getVipLang();
        const image = normalizeVipUrl(settings.founderImg || founderImageUrl || vipEls.image?.dataset.currentVipSrc || vipEls.image?.currentSrc || vipEls.image?.src || '');
        return {
            titleHTML: 'Christophe<br><span>Mongai</span>',
            quote: settings[`founderQuote_${lang}`] || translations[lang]?.vip_quote || '',
            desc: settings[`founderDesc_${lang}`] || translations[lang]?.vip_desc || '',
            image
        };
    };

    const syncFounderImage = (url) => {
        if (!vipEls.image || !url) return;
        const normalizedUrl = normalizeVipUrl(url);
        if (!normalizedUrl) return;
        founderImageUrl = normalizedUrl;
        preloadVipImage(normalizedUrl);
        const current = normalizeVipUrl(vipEls.image.dataset.currentVipSrc || vipEls.image.currentSrc || vipEls.image.src);
        if (current !== normalizedUrl) {
            vipEls.image.src = normalizedUrl;
            vipEls.image.dataset.currentVipSrc = normalizedUrl;
        }
    };

    const prepareAgencyImage = async (url) => {
        ensureVipPhotoLayers();
        if (!vipEls.agencyImage || !url) return false;
        const normalizedUrl = normalizeVipUrl(url);
        if (!normalizedUrl) return false;
        agencyImageUrl = normalizedUrl;

        const current = normalizeVipUrl(vipEls.agencyImage.dataset.currentVipSrc || vipEls.agencyImage.currentSrc || vipEls.agencyImage.src);
        if (current !== normalizedUrl) {
            vipEls.agencyImage.classList.remove('is-ready');
            vipEls.agencyImage.src = normalizedUrl;
            vipEls.agencyImage.dataset.currentVipSrc = normalizedUrl;
        }

        const ok = await preloadVipImage(normalizedUrl);
        vipEls.agencyImage.classList.add('is-ready');
        return ok;
    };

    const getAgencyData = async () => {
        const cached = Cache.get('site_agency');
        if (cached) {
            if (cached.image) prepareAgencyImage(cached.image);
            return cached;
        }

        if (vipAgencyPromise) return vipAgencyPromise;

        vipAgencyPromise = (async () => {
            try {
                const snap = await getDoc(doc(db, 'settings', 'agency'));
                const data = snap.exists() ? snap.data() : { empty: true };
                Cache.set('site_agency', data);
                if (data.image) await prepareAgencyImage(data.image);
                return data;
            } catch (e) {
                console.error('Erreur Agence:', e);
                vipAgencyPromise = null;
                return null;
            }
        })();

        return vipAgencyPromise;
    };

    const setVipTabsState = (mode) => {
        if (!vipTabs.founder || !vipTabs.agency) return;
        const isFounder = mode === 'founder';
        vipTabs.founder.classList.toggle('active', isFounder);
        vipTabs.agency.classList.toggle('active', !isFounder);
        vipTabs.founder.style.background = isFounder ? 'var(--usm-pink)' : 'rgba(255,255,255,0.1)';
        vipTabs.founder.style.color = isFounder ? '#fff' : '#aaa';
        vipTabs.agency.style.background = !isFounder ? 'var(--usm-pink)' : 'rgba(255,255,255,0.1)';
        vipTabs.agency.style.color = !isFounder ? '#fff' : '#aaa';
    };

    const setVipTextHidden = (hidden) => {
        [vipEls.title, vipEls.quote, vipEls.desc, vipEls.licenses].forEach(el => {
            if (el) el.classList.toggle('vip-panel-switching', hidden);
        });
    };

    const setVipLicensesVisible = (visible) => {
        if (!vipEls.licenses) return;
        vipEls.licenses.style.display = 'flex';
        vipEls.licenses.classList.toggle('vip-licenses-hidden', !visible);
        vipEls.licenses.setAttribute('aria-hidden', String(!visible));
    };

    const setAgencyLayerVisible = (visible) => {
        ensureVipPhotoLayers();
        if (!vipEls.agencyImage) return;
        vipEls.agencyImage.classList.toggle('is-active', visible);
        vipEls.agencyImage.setAttribute('aria-hidden', String(!visible));
    };

    const lockVipLayout = () => {
        if (!vipEls.section || !vipEls.content) return;
        const mobile = window.matchMedia('(max-width: 768px)').matches;

        if (mobile) {
            vipEls.section.style.height = '';
            vipEls.section.style.minHeight = '';
            vipEls.section.style.maxHeight = '';
            if (vipEls.photoWrapper) {
                vipEls.photoWrapper.style.height = '';
                vipEls.photoWrapper.style.minHeight = '';
                vipEls.photoWrapper.style.maxHeight = '';
            }
            vipEls.content.style.height = '';
            vipEls.content.style.minHeight = '';
            vipEls.content.style.maxHeight = '';
            return;
        }

        const targetHeight = Math.round(Math.min(760, Math.max(640, window.innerWidth * 0.46)));
        vipEls.section.style.height = `${targetHeight}px`;
        vipEls.section.style.minHeight = `${targetHeight}px`;
        vipEls.section.style.maxHeight = `${targetHeight}px`;
        if (vipEls.photoWrapper) {
            vipEls.photoWrapper.style.height = '100%';
            vipEls.photoWrapper.style.minHeight = '0';
            vipEls.photoWrapper.style.maxHeight = 'none';
        }
        vipEls.content.style.height = '100%';
        vipEls.content.style.minHeight = '0';
        vipEls.content.style.maxHeight = 'none';
    };

    const showFounderVip = async () => {
        if (currentVipMode === 'founder') return;
        currentVipMode = 'founder';
        const switchId = ++vipSwitchId;
        const founder = getFounderData();

        setVipTabsState('founder');
        setAgencyLayerVisible(false);
        setVipTextHidden(true);
        await smallDelay(130);
        if (switchId !== vipSwitchId) return;

        if (vipEls.title) vipEls.title.innerHTML = founder.titleHTML;
        if (vipEls.quote) vipEls.quote.textContent = founder.quote || '';
        if (vipEls.desc) vipEls.desc.textContent = founder.desc || '';
        setVipLicensesVisible(true);
        if (founder.image) syncFounderImage(founder.image);
        setAgencyLayerVisible(false);

        lockVipLayout();
        await nextFrame();
        if (switchId !== vipSwitchId) return;
        setVipTextHidden(false);
    };

    const showAgencyVip = async () => {
        if (currentVipMode === 'agency') return;
        currentVipMode = 'agency';
        const switchId = ++vipSwitchId;

        setVipTabsState('agency');
        setVipTextHidden(true);
        await smallDelay(130);
        if (switchId !== vipSwitchId) return;

        const agency = await getAgencyData();
        if (switchId !== vipSwitchId) return;

        const lang = getVipLang();
        if (vipEls.title) vipEls.title.innerHTML = "L'Agence<br><span>USM Football</span>";
        if (agency && !agency.empty) {
            if (vipEls.quote) vipEls.quote.textContent = agency[`quote_${lang}`] || '';
            if (vipEls.desc) vipEls.desc.textContent = agency[`desc_${lang}`] || '';
            if (agency.image) await prepareAgencyImage(agency.image);
        } else {
            if (vipEls.quote) vipEls.quote.textContent = '';
            if (vipEls.desc) vipEls.desc.textContent = "Informations de l'agence à venir.";
        }

        if (switchId !== vipSwitchId) return;
        setVipLicensesVisible(false);
        setAgencyLayerVisible(true);
        lockVipLayout();
        await nextFrame();
        if (switchId !== vipSwitchId) return;
        setVipTextHidden(false);
    };

    const warmFounderAssets = () => {
        const founder = getFounderData();
        if (founder.image) syncFounderImage(founder.image);
    };

    const warmAgencyAssets = () => {
        getAgencyData();
    };

    if (vipTabs.founder && vipTabs.agency && vipEls.section) {
        ensureVipPhotoLayers();
        setVipTabsState('founder');
        setVipLicensesVisible(true);
        setAgencyLayerVisible(false);
        warmFounderAssets();
        warmAgencyAssets();
        lockVipLayout();

        vipTabs.founder.addEventListener('click', showFounderVip);
        vipTabs.agency.addEventListener('click', showAgencyVip);

        ['pointerenter', 'mouseenter', 'focus', 'touchstart'].forEach(eventName => {
            vipTabs.founder.addEventListener(eventName, warmFounderAssets, { passive: true });
            vipTabs.agency.addEventListener(eventName, warmAgencyAssets, { passive: true });
        });

        const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 350));
        idle(() => {
            warmFounderAssets();
            warmAgencyAssets();
            lockVipLayout();
        });

        window.addEventListener('resize', lockVipLayout);
    }

    const updateContent = (lang) => {
        document.querySelectorAll('[data-i18n]').forEach(el => { 
            const key = el.getAttribute('data-i18n'); 
            if (translations[lang] && translations[lang][key]) el.textContent = translations[lang][key]; 
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { 
            const key = el.getAttribute('data-i18n-placeholder'); 
            if (translations[lang] && translations[lang][key]) el.placeholder = translations[lang][key]; 
        });
        document.documentElement.lang = lang;
        
        renderServices(); 
        
        if(window.currentServiceData) {
            const srv = window.currentServiceData;
            const titleText = srv[`title_${lang}`] || srv.title_fr;
            const subText = srv[`subtitle_${lang}`] || srv.subtitle_fr;
            const descText = srv[`desc_${lang}`] || srv.desc_fr;
            const seoText = srv[`seo_${lang}`] || srv.seo_fr;
            
            const titleEl = document.getElementById('srv-page-title'); 
            const subEl = document.getElementById('srv-page-subtitle');
            const descEl = document.getElementById('srv-page-desc');
            const imgEl = document.getElementById('srv-hero-img');
            
            if(titleEl) titleEl.textContent = titleText;
            if(subEl) subEl.textContent = subText;
            if(descEl) descEl.textContent = descText;
            if(imgEl) imgEl.alt = titleText;
            
            document.title = `${titleText} | USM Football`;
            
            if (descText) {
                let metaDesc = document.querySelector('meta[name="description"]');
                if (!metaDesc) {
                    metaDesc = document.createElement('meta');
                    metaDesc.name = "description";
                    document.head.appendChild(metaDesc);
                }
                metaDesc.content = descText.length > 155 ? descText.substring(0, 155) + "..." : descText;
            }
            if (seoText) {
                let metaKeys = document.querySelector('meta[name="keywords"]');
                if (!metaKeys) {
                    metaKeys = document.createElement('meta');
                    metaKeys.name = "keywords";
                    document.head.appendChild(metaKeys);
                }
                metaKeys.content = seoText;
            }
            renderOtherServices(window.currentServiceId, lang);
        }
    };
    
    if(langSelect) {
        langSelect.addEventListener('change', (e) => { 
            localStorage.setItem('usm_lang', e.target.value); 
            updateContent(e.target.value); 
        });
    }

    const mobileBtn = document.getElementById('mobile-menu-btn');
    const closeBtn = document.getElementById('close-menu-btn');
    const navLinks = document.getElementById('nav-links');
    
    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => navLinks.classList.add('active'));
        closeBtn.addEventListener('click', () => navLinks.classList.remove('active'));
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => navLinks.classList.remove('active'));
        });
    }

    // Scroll navbar vraiment centrÃ© sur le module ciblÃ©, pas juste collÃ© sous la navbar.
    const getNavHeight = () => Math.ceil(document.querySelector('.navbar')?.getBoundingClientRect().height || 78);

    const getAnchorFocusHeight = (target) => {
        const rect = target.getBoundingClientRect();
        const viewport = window.innerHeight;
        if (target.id === 'services') return Math.min(Math.max(rect.height, 360), viewport * 0.62);
        if (target.id === 'agence') return Math.min(Math.max(rect.height, 560), viewport * 0.76);
        if (target.id === 'joueurs') return Math.min(560, viewport * 0.68);
        return Math.min(rect.height, viewport * 0.7);
    };

    const scrollSectionToVisualCenter = (target) => {
        if (!target) return;
        const navHeight = getNavHeight();
        const availableHeight = Math.max(320, window.innerHeight - navHeight);
        const rect = target.getBoundingClientRect();
        const focusHeight = getAnchorFocusHeight(target);
        const desiredTop = navHeight + Math.max(22, (availableHeight - focusHeight) / 2);
        const nextTop = Math.max(0, window.scrollY + rect.top - desiredTop);

        window.scrollTo({ top: nextTop, behavior: 'smooth' });
    };

    document.querySelectorAll('.nav-links a[href^="#"]').forEach(link => {
        link.addEventListener('click', (event) => {
            const hash = link.getAttribute('href');
            if (!hash || hash === '#') return;
            const target = document.querySelector(hash);
            if (!target) return;
            event.preventDefault();
            navLinks?.classList.remove('active');
            scrollSectionToVisualCenter(target);
            if (history.pushState) history.pushState(null, '', hash);
        });
    });
    
    updateContent(currentLang);

    const observer = new IntersectionObserver((entries) => { 
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); }); 
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    

function setupDynamicImageReveal() {
    const selector = '.press-card img, .article-card img, .video-card img';
    const prepare = (img) => {
        if (!img || img.dataset.fadeReady === 'true') return;
        img.dataset.fadeReady = 'true';
        img.classList.add('soft-load-img');
        const reveal = () => img.classList.add('is-loaded');
        if (img.complete && img.naturalWidth > 0) reveal();
        else {
            img.addEventListener('load', reveal, { once: true });
            img.addEventListener('error', reveal, { once: true });
        }
    };

    document.querySelectorAll(selector).forEach(prepare);

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof HTMLElement)) return;
                if (node.matches?.(selector)) prepare(node);
                node.querySelectorAll?.(selector).forEach(prepare);
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

    setupDynamicImageReveal();

    const startApp = async () => {
        LoadingUI.showServices();
        LoadingUI.showPresse();
        await loadSettings(); 
        warmFounderAssets();
        warmAgencyAssets();
        lockVipLayout();
        updateContent(localStorage.getItem('usm_lang') || currentLang);
        requestAnimationFrame(lockVipLayout);
        await loadSocialLinks();
        await loadServices(); 
        await loadPlayers('gardien'); 
        ['defenseur', 'milieu', 'attaquant', 'feminine', 'coach'].forEach(cat => setTimeout(() => warmRosterCategory(cat), 400));
        await loadSingleServicePage(); 
    };
    startApp();
}); /* <-- 🪄 LA FERMETURE GLOBALE DU DOMCONTENTLOADED EST ICI */

/* ================= 5. CHARGEMENT PARAMÈTRES AVEC CACHE ================= */

function loadSmoothImage(selector, url, finalOpacity = '1') {
    const img = document.querySelector(selector);
    if (img && url) {
        img.classList.add('dynamic-img');
        img.style.setProperty('--final-opacity', finalOpacity);
        img.onload = () => {
            img.style.opacity = finalOpacity;
            LoadingUI.imageLoaded(img);
        };
        img.src = url;
        if (selector === '.vip-photo-wrapper img' || img.id === 'vip-img-display') img.dataset.currentVipSrc = url;
        if (img.complete) {
            img.style.opacity = finalOpacity;
            LoadingUI.imageLoaded(img);
        }
    }
}

async function loadSettings() {
    let data = Cache.get('site_settings');
    if(!data) {
        try {
            const d = await getDoc(doc(db, "settings", "general"));
            if (d.exists()) {
                data = d.data();
                Cache.set('site_settings', data);
            }
        } catch (e) { console.error("Erreur Settings:", e); return; }
    }
    if(data) {
        ['stat1', 'stat2', 'stat3', 'stat4'].forEach(s => { 
            if(data[s] && document.getElementById(`stat-${s.replace('stat','')}`)) 
                document.getElementById(`stat-${s.replace('stat','')}`).textContent = data[s]; 
        });
        
        if(data.logoNav) {
            loadSmoothImage('#nav-logo-dyn', data.logoNav);
            loadSmoothImage('#footer-logo-dyn', data.logoNav);
        }
        if(data.logoHero) loadSmoothImage('.massive-eagle-wrapper img', data.logoHero);
        if(data.founderImg) loadSmoothImage('.vip-photo-wrapper img', data.founderImg);

        ['fr', 'en', 'es', 'pt'].forEach(lang => { 
            if(data[`founderQuote_${lang}`]) translations[lang].vip_quote = data[`founderQuote_${lang}`]; 
            if(data[`founderDesc_${lang}`]) translations[lang].vip_desc = data[`founderDesc_${lang}`]; 
        });
        
        const currentLang = localStorage.getItem('usm_lang') || 'fr';
        document.querySelectorAll('[data-i18n]').forEach(el => { 
            const key = el.getAttribute('data-i18n'); 
            if (translations[currentLang] && translations[currentLang][key]) el.textContent = translations[currentLang][key]; 
        });
    }
}

/* ================= 5.5 CHARGEMENT DES RÉSEAUX SOCIAUX ================= */
async function loadSocialLinks() {
    let socialData = Cache.get('site_social');
    
    if (!socialData) {
        try {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            const docSnap = await getDoc(doc(db, "settings", "social"));
            if (docSnap.exists()) {
                socialData = docSnap.data();
                Cache.set('site_social', socialData);
            }
        } catch (e) { 
            console.error("Erreur chargement réseaux:", e); 
            return; 
        }
    }

    if (socialData) {
        const platforms = [
            { key: 'tiktok', title: 'TikTok' },
            { key: 'linkedin', title: 'LinkedIn' },
            { key: 'instagram', title: 'Instagram' },
            { key: 'facebook', title: 'Facebook' },
            { key: 'youtube', title: 'YouTube' }
        ];

        platforms.forEach(platform => {
            const icons = document.querySelectorAll(`.social-icon[title="${platform.title}"], .sticky-icon[title="${platform.title}"], .dyn-social[title="${platform.title}"]`);
            const url = socialData[platform.key];
            
            icons.forEach(iconEl => {
                if (url && url.trim() !== '') {
                    iconEl.href = url;
                    iconEl.style.display = 'flex'; 
                } else {
                    iconEl.style.display = 'none'; 
                }
            });
        });
    }
}

/* ================= 6. CHARGEMENT DES SERVICES AVEC CACHE ================= */
let allServicesData = [];

async function loadServices() {
    const container = document.getElementById('services-container'); 
    let cachedServices = Cache.get('site_services');
    
    if(cachedServices) {
        allServicesData = cachedServices;
    } else {
        try {
            const querySnapshot = await getDocs(collection(db, "services")); 
            allServicesData = [];
            querySnapshot.forEach((docSnap) => allServicesData.push({ id: docSnap.id, ...docSnap.data() }));
            allServicesData.sort((a, b) => (a.order || 999) - (b.order || 999)); 
            Cache.set('site_services', allServicesData);
        } catch (error) { 
            if(container) container.innerHTML = '<p style="color:red;">Erreur de chargement.</p>'; 
            return;
        }
    }
    renderServices();
    if(window.currentServiceId) renderOtherServices(window.currentServiceId, localStorage.getItem('usm_lang') || 'fr');
}

function renderServices() {
    const container = document.getElementById('services-container'); 
    if(!container) return;
    if(allServicesData.length === 0) { container.innerHTML = '<p style="color:#aaa;">Aucun service disponible.</p>'; return; }
    
    const currentLang = localStorage.getItem('usm_lang') || 'fr'; 
    let html = '';
    
    allServicesData.forEach(srv => {
        const title = srv[`title_${currentLang}`] || srv.title_fr || 'Service';
        const sub = srv[`subtitle_${currentLang}`] || srv.subtitle_fr || '';
        const bgImg = srv.image_url ? `url('${srv.image_url}')` : 'none';
        html += `
        <a href="page-dynamique.html?id=${srv.id}" class="bento-service-card" style="background-image: linear-gradient(to top, rgba(5,5,7,0.95) 10%, rgba(5,5,7,0.2) 100%), ${bgImg}; background-size: cover; background-position: center;">
            <div class="srv-card-content"><h3>${title}</h3><p>${sub}</p></div>
            <div class="srv-card-arrow">En savoir plus ➔</div>
        </a>`;
    });
    container.innerHTML = html;
    LoadingUI.markReady(container);

    const btnSrvPrev = document.getElementById('btn-srv-prev');
    const btnSrvNext = document.getElementById('btn-srv-next');
  
    if (btnSrvPrev && container) {
        const newBtnPrev = btnSrvPrev.cloneNode(true);
        btnSrvPrev.parentNode.replaceChild(newBtnPrev, btnSrvPrev);
        newBtnPrev.addEventListener('click', () => container.scrollBy({ left: -(container.clientWidth * 0.8), behavior: 'smooth' }));
    }
    if (btnSrvNext && container) {
        const newBtnNext = btnSrvNext.cloneNode(true);
        btnSrvNext.parentNode.replaceChild(newBtnNext, btnSrvNext);
        newBtnNext.addEventListener('click', () => container.scrollBy({ left: (container.clientWidth * 0.8), behavior: 'smooth' }));
    }
}

function renderOtherServices(currentId, lang) {
    const container = document.getElementById('other-services-container'); 
    if(!container) return;
    let html = '';
    allServicesData.forEach(srv => {
        const title = srv[`title_${lang}`] || srv.title_fr || 'Service';
        const isActive = srv.id === currentId ? 'active' : '';
        html += `
        <a href="page-dynamique.html?id=${srv.id}" class="sidebar-srv-link ${isActive}">
            <span>${title}</span><span>➔</span>
        </a>`;
    });
    container.innerHTML = html;
}

/* ================= 7. PAGE SERVICE UNIQUE ================= */
async function loadSingleServicePage() {
    const urlParams = new URLSearchParams(window.location.search);
    const srvId = urlParams.get('id');
    if(!srvId) return;

    try {
        const docSnap = await getDoc(doc(db, "services", srvId));
        if(docSnap.exists()) {
            window.currentServiceId = srvId;
            window.currentServiceData = docSnap.data();
            const srv = window.currentServiceData;
            const currentLang = localStorage.getItem('usm_lang') || 'fr';
            
            const titleText = srv[`title_${currentLang}`] || srv.title_fr || "Service";
            const subText = srv[`subtitle_${currentLang}`] || srv.subtitle_fr || "";
            const descText = srv[`desc_${currentLang}`] || srv.desc_fr || "";
            const seoText = srv[`seo_${currentLang}`] || srv.seo_fr || "";
            
            const imgEl = document.getElementById('srv-hero-img');
            if(imgEl && srv.image_url) { 
                loadSmoothImage('#srv-hero-img', srv.image_url, '0.4');
                imgEl.alt = titleText; 
            }
            
            const titleEl = document.getElementById('srv-page-title'); if(titleEl) titleEl.textContent = titleText;
            const subEl = document.getElementById('srv-page-subtitle'); if(subEl) subEl.textContent = subText;
            const descEl = document.getElementById('srv-page-desc'); if(descEl) descEl.textContent = descText;

            // 🪄 SEO DYNAMIQUE : Mise à jour du Titre de l'onglet
            document.title = `${titleText} | USM Football`;

            // 🪄 SEO DYNAMIQUE : Mise à jour de la Meta Description
            if (descText) {
                let metaDesc = document.querySelector('meta[name="description"]');
                if (!metaDesc) {
                    metaDesc = document.createElement('meta');
                    metaDesc.name = "description";
                    document.head.appendChild(metaDesc);
                }
                metaDesc.content = descText.length > 150 ? descText.substring(0, 150) + "..." : descText;
            }

            // 🪄 SEO DYNAMIQUE : Mise à jour des Mots-clés (Keywords)
            if (seoText) {
                let metaKeys = document.querySelector('meta[name="keywords"]');
                if (!metaKeys) {
                    metaKeys = document.createElement('meta');
                    metaKeys.name = "keywords";
                    document.head.appendChild(metaKeys);
                }
                metaKeys.content = seoText;
            }

            renderOtherServices(srvId, currentLang);
        } else {
            const titleEl = document.getElementById('srv-page-title'); if(titleEl) titleEl.textContent = "Service Introuvable";
            const descEl = document.getElementById('srv-page-desc'); if(descEl) descEl.textContent = "Ce service n'existe pas ou a été supprimé.";
        }
    } catch(e) { console.error("Erreur Service: ", e); }
}
/* ================= 8. CHARGEMENT OPTIMISÉ DU ROSTER ================= */

const rosterImageCache = new Map();
const rosterDecodedUrls = new Set();

function preloadRosterImage(url, timeout = 4500) {
    if (!url) return Promise.resolve(false);
    if (rosterImageCache.has(url)) return rosterImageCache.get(url);

    const promise = new Promise((resolve) => {
        const img = new Image();
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            resolve(ok);
        };
        img.decoding = 'async';
        img.onload = async () => {
            try { if (img.decode) await img.decode(); } catch (e) {}
            rosterDecodedUrls.add(url);
            finish(true);
        };
        img.onerror = () => finish(false);
        setTimeout(() => finish(false), timeout);
        img.src = url;
    });

    rosterImageCache.set(url, promise);
    return promise;
}

async function preloadRosterImages(players, limit = 10, timeout = 1200) {
    const urls = (players || []).slice(0, limit).map(player => player.image_url).filter(Boolean);
    if (!urls.length) return;
    await Promise.race([
        Promise.all(urls.map(url => preloadRosterImage(url))),
        new Promise(resolve => setTimeout(resolve, timeout))
    ]);
}

function rosterHue(seed = 'USM') {
    let hash = 0;
    for (const char of seed) hash = ((hash << 5) - hash) + char.charCodeAt(0);
    return Math.abs(hash) % 360;
}

function escapeHTML(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function prepareRosterImages(scope = document) {
    Array.from(scope.querySelectorAll('.player-img-container img')).forEach((img, index) => {
        if (img.dataset.rosterPrepared === 'true') return;
        img.dataset.rosterPrepared = 'true';
        img.classList.remove('is-loaded', 'loaded', 'roster-img-ready');

        const src = img.currentSrc || img.src || '';
        const baseDelay = rosterDecodedUrls.has(src) ? 90 : 130;
        img.style.transitionDelay = `${Math.min(baseDelay + index * 34, 420)}ms`;

        const reveal = () => {
            if (img.dataset.rosterRevealQueued === 'true') return;
            img.dataset.rosterRevealQueued = 'true';
            const delay = rosterDecodedUrls.has(src) ? 70 : 110;
            setTimeout(() => {
                requestAnimationFrame(() => {
                    img.classList.add('roster-img-ready');
                    img.closest('.player-img-container')?.classList.add('roster-holder-ready');
                });
            }, delay);
        };

        img.addEventListener('load', reveal, { once: true });
        img.addEventListener('error', reveal, { once: true });

        if (img.complete && img.naturalWidth > 0) {
            rosterDecodedUrls.add(src);
            reveal();
        } else {
            preloadRosterImage(src).then(reveal);
        }
    });
}

function getPlayerPlaceholderStyle(player) {
    const hue = rosterHue(player.name || player.image_url || 'USM');
    return `--roster-hue:${hue};`;
}

async function warmRosterCategory(category) {
    if (!category) return;
    let players = Cache.get(`players_${category}`);
    if (!players) {
        try {
            const q = query(collection(db, "players"), where("category", "==", category));
            const snap = await getDocs(q);
            players = [];
            snap.forEach(docSnap => players.push(docSnap.data()));
            players.sort((a, b) => (a.order || 999) - (b.order || 999));
            Cache.set(`players_${category}`, players);
        } catch (e) {
            return;
        }
    }
    preloadRosterImages(players, 20, 2200);
}

let allPlayersData = []; 
let currentFrontCat = 'gardien'; 
let currentFrontSearch = '';
let searchTimeout;

async function loadPlayers(category = 'gardien') {
    const container = document.getElementById('roster-categories-container'); 
    if (!container) return;
    
    if (currentFrontCat === category && container.dataset.currentRosterCategory === category && container.querySelector('.player-card') && currentFrontSearch.length === 0) {
        return;
    }
    currentFrontCat = category;
    let players = Cache.get(`players_${category}`);
    const previousHeight = Math.ceil(container.getBoundingClientRect().height);
    if (previousHeight > 80) container.style.minHeight = `${previousHeight}px`;
    container.classList.add('roster-is-preparing');
    
    if(!players) {
        try {
            const q = query(collection(db, "players"), where("category", "==", category));
            const querySnapshot = await getDocs(q); 
            players = [];
            querySnapshot.forEach((docSnap) => players.push(docSnap.data())); 
            players.sort((a, b) => (a.order || 999) - (b.order || 999));
            Cache.set(`players_${category}`, players);
        } catch (error) { 
            container.innerHTML = '<p style="color:red; text-align:center;">Erreur base de données.</p>'; 
            container.classList.remove('roster-is-preparing');
            return;
        }
    }
    
    await preloadRosterImages(players, 20, 2200);
    allPlayersData = players;
    renderCategorySlider();
    container.dataset.currentRosterCategory = category;
    container.classList.remove('roster-is-preparing');
    setTimeout(() => { container.style.minHeight = ''; }, 450);
}

function renderCategorySlider() {
    const container = document.getElementById('roster-categories-container'); 
    if(!container) return;
    
    let filteredPlayers = currentFrontSearch.length > 0 
        ? allPlayersData.filter(p => p.name.toLowerCase().includes(currentFrontSearch)) 
        : allPlayersData;
        
    if (filteredPlayers.length === 0) { 
        container.innerHTML = '<p style="text-align:center; color:#888; padding: 40px;">Aucun joueur trouvé.</p>'; 
        return; 
    }
    
    let sliderHTML = `<div class="category-block reveal visible"><div class="category-header"><h3 class="category-title" style="color: #fff; text-transform:none;">${currentFrontSearch.length > 0 ? `Résultats pour "${currentFrontSearch}"` : `✦ <span style="color:var(--usm-pink)">${filteredPlayers.length}</span> Profils`}</h3><div class="slider-controls"><button class="slider-btn prev-btn">❮</button><button class="slider-btn next-btn">❯</button></div></div><div class="slider-container"><div class="horizontal-scroller" id="active-scroller">`;
    
    filteredPlayers.forEach(player => { 
        const playerName = escapeHTML(player.name || '');
        const playerCategory = escapeHTML(player.category || '');
        const playerStat = escapeHTML(player.stat || '');
        const playerImage = escapeHTML(player.image_url || '');
        const playerTransfermarkt = escapeHTML(player.transfermarkt || '');
        sliderHTML += `<div class="player-card"><div class="player-img-container roster-gradient-holder" style="${getPlayerPlaceholderStyle(player)}"><img src="${playerImage}" alt="${playerName}" decoding="async" loading="eager"></div><div class="player-info"><div><h3>${playerName}</h3>${currentFrontSearch.length > 0 ? `<p style="color:#888; font-size:0.75rem; text-transform:uppercase; margin-top:2px;">${playerCategory}</p>` : ''}${playerTransfermarkt ? `<a href="${playerTransfermarkt}" target="_blank" rel="noopener" style="color:var(--usm-pink); font-size:0.8rem; text-decoration:none; display:inline-block; margin-top:5px;">🔗 Transfermarkt</a>` : ''}</div></div><div style="padding: 0 15px 15px;"><div class="player-stat">${playerStat}</div></div></div>`; 
    });
    
    container.innerHTML = sliderHTML + `</div></div></div>`;
    prepareRosterImages(container);
    
    const scroller = document.getElementById('active-scroller');
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    
    if(prevBtn) prevBtn.addEventListener('click', () => scroller.scrollBy({ left: -(scroller.clientWidth * 0.8), behavior: 'smooth' })); 
    if(nextBtn) nextBtn.addEventListener('click', () => scroller.scrollBy({ left: (scroller.clientWidth * 0.8), behavior: 'smooth' }));
}

function setupTabs() { 
    document.querySelectorAll('.filter-btn').forEach(tab => { 
        ['pointerenter', 'mouseenter', 'focus', 'touchstart'].forEach(eventName => {
            tab.addEventListener(eventName, () => warmRosterCategory(tab.getAttribute('data-tab')), { passive: true });
        });
        tab.addEventListener('click', (e) => { 
            const fSearch = document.getElementById('front-search');
            if(fSearch) fSearch.value = ''; 
            currentFrontSearch = ''; 
            document.querySelectorAll('.filter-btn').forEach(t => t.classList.remove('active')); 
            e.target.classList.add('active'); 
            loadPlayers(e.target.getAttribute('data-tab')); 
        }); 
    }); 
}
setupTabs(); 

const searchInput = document.getElementById('front-search');
if(searchInput) {
    searchInput.addEventListener('input', (e) => { 
        clearTimeout(searchTimeout);
        
        // 🪄 OPTIMISATION 1 : Délai augmenté à 600ms (Debounce)
        searchTimeout = setTimeout(async () => {
            currentFrontSearch = e.target.value.trim().toLowerCase(); 
            
            // 🪄 OPTIMISATION 2 : On ne lance la recherche qu'à partir de 2 caractères minimum
            if(currentFrontSearch.length >= 2) {
                document.querySelectorAll('.filter-btn').forEach(t => t.classList.remove('active')); 
                
                let all = Cache.get('players_all');
                if (!all) {
                    try {
                        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                        const querySnapshot = await getDocs(collection(db, "players"));
                        all = [];
                        querySnapshot.forEach(d => all.push(d.data()));
                        Cache.set('players_all', all); 
                    } catch(err) { console.error("Erreur recherche globale:", err); all = []; }
                }
                
                allPlayersData = all; 
                await preloadRosterImages(allPlayersData, 20, 1800);
                renderCategorySlider(); 
                
            } else if (currentFrontSearch.length === 0) {
                // Si la barre de recherche est vidée, on réaffiche la catégorie sélectionnée
                const activeTab = document.querySelector(`.filter-btn[data-tab="${currentFrontCat}"]`);
                if(activeTab) activeTab.classList.add('active'); 
                
                allPlayersData = Cache.get(`players_${currentFrontCat}`) || [];
                if (allPlayersData.length === 0) loadPlayers(currentFrontCat);
                else renderCategorySlider();
            }
        }, 600); 
    });
}
/* ================= 9. PAGE PRESSE (VIDEOS & ARTICLES) ================= */

function getYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

window.openPresseLightbox = (type, mediaUrl, title, desc, linkUrl, source, currentIndex) => {
    const lb = document.getElementById('presse-lightbox');
    const mediaContainer = document.getElementById('lightbox-media');
    const titleEl = document.getElementById('lightbox-title');
    const descEl = document.getElementById('lightbox-desc');
    const linkContainer = document.getElementById('lightbox-link-container');
    const miniSlider = document.getElementById('lightbox-mini-slider');
    
    if(lb && mediaContainer) {
        if(type === 'video') {
            let embedUrl = mediaUrl;
            if(embedUrl.includes('watch?v=')) {
                embedUrl = embedUrl.replace('watch?v=', 'embed/');
                const amp = embedUrl.indexOf('&');
                if(amp !== -1) embedUrl = embedUrl.substring(0, amp);
            }
            mediaContainer.innerHTML = `<iframe src="${embedUrl}?autoplay=1" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
        } else {
            mediaContainer.innerHTML = `<img src="${mediaUrl}" alt="Presse">`;
        }
        
        titleEl.textContent = title;
        descEl.textContent = desc || '';
        if(linkUrl && linkUrl.length > 5) {
            linkContainer.innerHTML = `<a href="${linkUrl}" target="_blank" class="btn-premium" style="display:inline-block; margin-top:20px; text-decoration:none; text-align:center; width:100%;">Lire l'article complet ➔</a>`;
        } else {
            linkContainer.innerHTML = '';
        }
        
        if (miniSlider && source && source !== 'null') {
            if (miniSlider.getAttribute('data-current-source') !== source) {
                let items = [];
                if (source === 'tv') items = Cache.get('site_presse_videos') || [];
                if (source === 'yt') items = window.site_presse_yt || [];
                if (source === 'articles') items = Cache.get('site_presse_articles') || [];
                
                miniSlider.innerHTML = items.map((item, i) => {
                    let thumb = '', itemType = 'video', itemUrl = '', itemTitle = '', itemDesc = '', itemLink = '', extraClass = '';
                    
                    if (source === 'tv') {
                        const ytId = getYouTubeId(item.url);
                        thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '';
                        itemUrl = item.url; itemTitle = item.title; itemDesc = item.description;
                    } else if (source === 'yt') {
                        const ytId = getYouTubeId(item.link);
                        thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : item.thumbnail;
                        itemUrl = item.link; itemTitle = item.title;
                    } else if (source === 'articles') {
                        itemType = 'image'; thumb = item.image_url; itemUrl = item.image_url;
                        itemTitle = item.title; itemDesc = item.description; itemLink = item.link; extraClass = 'is-article';
                    }
                    
                    return `
                    <div class="mini-slider-item ${extraClass} presse-trigger" 
                         id="mini-item-${i}"
                         data-type="${itemType}" data-url="${itemUrl}" 
                         data-title="${encodeURIComponent(itemTitle || '')}" 
                         data-desc="${encodeURIComponent(itemDesc || '')}" 
                         data-link="${encodeURIComponent(itemLink || '')}" 
                         data-source="${source}" data-index="${i}">
                        <img src="${thumb}">
                    </div>`;
                }).join('');
                
                miniSlider.setAttribute('data-current-source', source);
            }

            document.querySelectorAll('.mini-slider-item').forEach(el => el.classList.remove('active'));
            const activeItem = document.getElementById(`mini-item-${currentIndex}`);
            if (activeItem) {
                activeItem.classList.add('active');
                setTimeout(() => {
                    const scrollPos = activeItem.offsetLeft - (miniSlider.clientWidth / 2) + (activeItem.clientWidth / 2);
                    miniSlider.scrollTo({ left: scrollPos, behavior: 'smooth' });
                }, 50);
            }
        } else if (miniSlider) {
             miniSlider.innerHTML = '';
             miniSlider.removeAttribute('data-current-source');
        }

        lb.classList.add('active'); 
        document.body.style.overflow = 'hidden'; 
    }
};

window.closeLightbox = () => {
    const lb = document.getElementById('presse-lightbox');
    if(lb) {
        lb.classList.remove('active');
        document.body.style.overflow = ''; 
        document.getElementById('lightbox-media').innerHTML = ''; 
    }
};

document.addEventListener('click', (e) => {
    if (e.target.id === 'presse-lightbox') {
        closeLightbox();
        return;
    }

    const trigger = e.target.closest('.presse-trigger');
    if (trigger) {
        const type = trigger.getAttribute('data-type');
        const url = trigger.getAttribute('data-url');
        
        const safeDecode = (str) => { try { return decodeURIComponent(str || ''); } catch(err) { return str || ''; } };
        const decodeHTML = (html) => { const txt = document.createElement("textarea"); txt.innerHTML = html; return txt.value; };

        const title = decodeHTML(safeDecode(trigger.getAttribute('data-title')));
        const desc = decodeHTML(safeDecode(trigger.getAttribute('data-desc')));
        const link = safeDecode(trigger.getAttribute('data-link'));
        const source = trigger.getAttribute('data-source');
        const index = parseInt(trigger.getAttribute('data-index'), 10);
        
        openPresseLightbox(type, url, title, desc, link, source, index);
    }
});

async function loadPresseData() {
    const vidContainer = document.getElementById('presse-video-container');
    const mosContainer = document.getElementById('presse-mosaic-container');
    if(!vidContainer || !mosContainer) return; 

    let videos = Cache.get('site_presse_videos');
    if(!videos || videos.length === 0) {
        try {
            const { query, collection, getDocs, limit } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            const q = query(collection(db, "presse_videos"), limit(50));
            const snap = await getDocs(q);
            videos = [];
            snap.forEach(d => videos.push({id: d.id, ...d.data()}));
            videos.sort((a, b) => (a.order || 999) - (b.order || 999));
            if(videos.length > 0) Cache.set('site_presse_videos', videos);
        } catch(e) { console.error(e); }
    }
    
    if(videos && videos.length > 0) {
        vidContainer.innerHTML = videos.map((v, index) => {
            const ytId = getYouTubeId(v.url);
            const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '';
            return `
            <div class="video-card presse-trigger" style="cursor:pointer;" data-type="video" data-url="${v.url}" data-title="${encodeURIComponent(v.title || '')}" data-desc="${encodeURIComponent(v.description || '')}" data-link="" data-source="tv" data-index="${index}">
                <div class="video-container">
                    <img src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;">
                    <div style="position:absolute; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center;">
                        <div style="width:50px; height:50px; background:var(--usm-pink); border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:1.5rem; padding-left:4px;">▶</div>
                    </div>
                </div>
                <div class="video-title">${v.title || ''}</div>
            </div>`;
        }).join('');
    } else {
        vidContainer.innerHTML = '<p style="color:#888; margin-left:20px;">Aucune vidéo pour le moment.</p>';
    }

    const ytContainer = document.getElementById('youtube-feed-container');
    if (ytContainer) {
        let ytItems = Cache.get('usm_yt_feed');
        if (!ytItems || ytItems.length === 0) {
            const YOUTUBE_CHANNEL_ID = "UCuaiYfKTeTWvQyz4tJXMlug"; 
            const rssUrl = encodeURIComponent(`https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`);
            const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`;

            try {
                const response = await fetch(apiUrl);
                const data = await response.json();
                
                if(data.status === 'ok' && data.items && data.items.length > 0) {
                    ytItems = data.items;
                    Cache.set('usm_yt_feed', ytItems); 
                }
            } catch(e) { console.error("Erreur YouTube:", e); }
        }

        if (ytItems && ytItems.length > 0) {
            window.site_presse_yt = ytItems; 
            
            ytContainer.innerHTML = ytItems.map((item, index) => {
                const ytId = getYouTubeId(item.link);
                const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : item.thumbnail;
                const safeTitle = encodeURIComponent(item.title);
                
                return `
                <div class="video-card presse-trigger" style="cursor:pointer;" data-type="video" data-url="${item.link}" data-title="${safeTitle}" data-desc="" data-link="" data-source="yt" data-index="${index}">
                    <div class="video-container">
                        <img src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;">
                        <div style="position:absolute; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center;">
                            <div style="width:50px; height:50px; background:#ff0000; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:1.5rem; padding-left:4px; box-shadow: 0 4px 15px rgba(255,0,0,0.4);">▶</div>
                        </div>
                    </div>
                    <div class="video-title">${item.title}</div>
                </div>`;
            }).join('');
        } else {
            ytContainer.innerHTML = '<p style="color:#888; margin-left:20px;">Aucune vidéo récente (ou limite de connexion API atteinte).</p>';
        }

        const btnYtPrev = document.getElementById('btn-yt-prev');
        const btnYtNext = document.getElementById('btn-yt-next');
        if(btnYtPrev) btnYtPrev.addEventListener('click', () => ytContainer.scrollBy({ left: -400, behavior: 'smooth' }));
        if(btnYtNext) btnYtNext.addEventListener('click', () => ytContainer.scrollBy({ left: 400, behavior: 'smooth' }));
    }

    let articles = Cache.get('site_presse_articles');
    if(!articles || articles.length === 0) {
        try {
            const { query, collection, getDocs, limit } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            const q = query(collection(db, "presse_articles"), limit(80)); 
            const snap = await getDocs(q);
            articles = [];
            snap.forEach(d => articles.push({id: d.id, ...d.data()}));
            articles.sort((a, b) => (a.order || 999) - (b.order || 999));
            if(articles.length > 0) Cache.set('site_presse_articles', articles);
        } catch(e) { console.error(e); }
    }
    
    window.presseArticles = articles || [];
    window.currentArtPage = 1;

    window.renderArticlesPage = () => {
        if(!mosContainer) return;
        const pageInfo = document.getElementById('art-page-info');
        
        if(window.presseArticles.length === 0) {
            mosContainer.innerHTML = '<p style="color:#888; grid-column: 1/-1;">Aucun article pour le moment.</p>';
            if(pageInfo) pageInfo.textContent = '0 / 0';
            return;
        }

        const ART_PER_PAGE = 16;
        const totalPages = Math.ceil(window.presseArticles.length / ART_PER_PAGE);
        if(window.currentArtPage > totalPages) window.currentArtPage = totalPages;
        
        const start = (window.currentArtPage - 1) * ART_PER_PAGE;
        const pageItems = window.presseArticles.slice(start, start + ART_PER_PAGE);

        mosContainer.innerHTML = pageItems.map((a, i) => {
            const globalIndex = start + i;
            return `
            <div class="mosaic-item presse-trigger" data-type="image" data-url="${a.image_url}" data-title="${encodeURIComponent(a.title || '')}" data-desc="${encodeURIComponent(a.description || '')}" data-link="${encodeURIComponent(a.link || '')}" data-source="articles" data-index="${globalIndex}">
                <img src="${a.image_url}" loading="lazy" alt="Presse">
            </div>`;
        }).join('');

        if(pageInfo) pageInfo.textContent = `${window.currentArtPage} / ${totalPages}`;
    };

    window.renderArticlesPage(); 

    const btnArtPrev = document.getElementById('btn-art-prev');
    const btnArtNext = document.getElementById('btn-art-next');
    if(btnArtPrev) btnArtPrev.addEventListener('click', () => { 
        if(window.currentArtPage > 1) { 
            window.currentArtPage--; 
            window.renderArticlesPage(); 
        } 
    });
    if(btnArtNext) btnArtNext.addEventListener('click', () => { 
        const maxP = Math.ceil(window.presseArticles.length / 16); 
        if(window.currentArtPage < maxP) { 
            window.currentArtPage++; 
            window.renderArticlesPage(); 
        } 
    });

    const btnPrev = document.getElementById('btn-vid-prev');
    const btnNext = document.getElementById('btn-vid-next');
    if(btnPrev) btnPrev.addEventListener('click', () => vidContainer.scrollBy({ left: -400, behavior: 'smooth' }));
    if(btnNext) btnNext.addEventListener('click', () => vidContainer.scrollBy({ left: 400, behavior: 'smooth' }));
}

const startPresse = () => { if(document.getElementById('presse-video-container')) loadPresseData(); };
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', startPresse); } else { startPresse(); }

/* ================= 10. BANDEROLE IMAGES (LAZY LOAD & CACHE 1H) ================= */
document.addEventListener("DOMContentLoaded", () => {
    const marqueeSection = document.getElementById('marquee-section');
    const marqueeTrack = document.getElementById('marquee-track');
    
    if (!marqueeSection || !marqueeTrack) return;

    let marqueeLoaded = false;
    const CACHE_TIME_1H = 1000 * 60 * 60; // 1 heure

    const loadMarqueeImages = async () => {
        if (marqueeLoaded) return;
        marqueeLoaded = true;

        let marqueeData = null;
        const cachedItem = localStorage.getItem('site_marquee');
        
        if (cachedItem) {
            const parsed = JSON.parse(cachedItem);
            if (Date.now() - parsed.timestamp < CACHE_TIME_1H) {
                marqueeData = parsed.data;
            }
        }

        if (!marqueeData) {
            try {
                const { collection, getDocs, limit, query } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const q = query(collection(db, "marquee_images"), limit(20));
                const snap = await getDocs(q);
                marqueeData = [];
                snap.forEach(doc => marqueeData.push(doc.data().image_url));
                
                if (marqueeData.length > 0) {
                    localStorage.setItem('site_marquee', JSON.stringify({timestamp: Date.now(), data: marqueeData}));
                }
            } catch(e) { console.error("Erreur Marquee:", e); return; }
        }

        if (marqueeData && marqueeData.length > 0) {
            const itemsHTML = marqueeData.map(url => `
                <div class="marquee-item">
                    <img src="${url}" loading="lazy" alt="Gallery">
                </div>
            `).join('');

            marqueeTrack.innerHTML = itemsHTML + itemsHTML;
        } else {
            marqueeSection.style.display = 'none'; 
        }
    };

    const marqueeObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadMarqueeImages();
            marqueeObserver.disconnect();
        }
    }, { rootMargin: '300px' });

    marqueeObserver.observe(marqueeSection);
});

// Public loading safety flag
document.addEventListener('DOMContentLoaded', () => document.body.classList.add('dom-ready'));
