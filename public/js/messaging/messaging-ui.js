/**
 * =======================================================================
 * SBI 8.0P.167.341 — MESSAGERIE INTERNE (module UI partagé élève / prof)
 * -----------------------------------------------------------------------
 * Modèle « hybride » : une Cloud Function ouvre/valide la conversation
 * (openDirectConversation / ensureGroupChannel), puis le client écrit les
 * messages EN DIRECT (onSnapshot temps réel). Les annonces admin sont en
 * lecture seule. Réutilise loadAssignedFormationsForUser / loadSearchUsersForRole.
 * =======================================================================
 */

import { app, db, auth } from "/js/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    collection, doc, getDoc, setDoc, addDoc, serverTimestamp,
    onSnapshot, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { loadAssignedFormationsForUser, loadSearchUsersForRole, roleOf } from "/js/learning-access.js";

const functions = getFunctions(app, "europe-west1");
const openDirectConversationFn = httpsCallable(functions, "openDirectConversation");
const ensureGroupChannelFn = httpsCallable(functions, "ensureGroupChannel");

const STUDENT_ROLE_KEY = "student";
const TEACHER_ROLE_KEY = "teacher";

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function displayName(user = {}) {
    const name = `${user.prenom || ""} ${user.nom || ""}`.trim();
    return name || user.email || "Utilisateur SBI";
}

function tsToMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    return 0;
}

function formatTime(millis) {
    if (!millis) return "";
    const d = new Date(millis);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

const SHELL_HTML = `
<div class="sbi-msg">
  <aside class="sbi-msg-aside" id="sbi-msg-aside">
    <div class="sbi-msg-aside-head">
      <h1 class="sbi-msg-title">Messagerie</h1>
      <button type="button" class="sbi-msg-new-btn" id="sbi-msg-new-btn">Nouveau message</button>
    </div>
    <div class="sbi-msg-threads" id="sbi-msg-threads">
      <p class="sbi-msg-muted">Chargement…</p>
    </div>
  </aside>
  <section class="sbi-msg-main" id="sbi-msg-main">
    <div class="sbi-msg-placeholder" id="sbi-msg-placeholder">
      <p>Sélectionnez une conversation ou démarrez-en une nouvelle.</p>
    </div>
    <div class="sbi-msg-conv" id="sbi-msg-conv" hidden>
      <header class="sbi-msg-conv-head">
        <button type="button" class="sbi-msg-back" id="sbi-msg-back" aria-label="Retour">&#8592;</button>
        <div class="sbi-msg-conv-meta">
          <span class="sbi-msg-conv-title" id="sbi-msg-conv-title"></span>
          <span class="sbi-msg-conv-sub" id="sbi-msg-conv-sub"></span>
        </div>
      </header>
      <div class="sbi-msg-stream" id="sbi-msg-stream"></div>
      <form class="sbi-msg-composer" id="sbi-msg-composer">
        <textarea id="sbi-msg-input" class="sbi-msg-input" rows="1" placeholder="Votre message…" maxlength="4000"></textarea>
        <button type="submit" class="sbi-msg-send" id="sbi-msg-send">Envoyer</button>
      </form>
      <p class="sbi-msg-readonly" id="sbi-msg-readonly" hidden>Canal d'annonces — lecture seule.</p>
    </div>
  </section>
</div>
<div class="sbi-msg-picker" id="sbi-msg-picker" hidden>
  <div class="sbi-msg-picker-card">
    <div class="sbi-msg-picker-head">
      <h2>Nouveau message</h2>
      <button type="button" class="sbi-msg-picker-close" id="sbi-msg-picker-close" aria-label="Fermer">&times;</button>
    </div>
    <input type="search" class="sbi-msg-picker-search" id="sbi-msg-picker-search" placeholder="Rechercher un contact…">
    <div class="sbi-msg-picker-list" id="sbi-msg-picker-list"><p class="sbi-msg-muted">Chargement des contacts…</p></div>
  </div>
</div>
`;

export function mountMessaging({ role, container } = {}) {
    const host = container || document.querySelector(".content-wrapper") || document.getElementById("main-content");
    if (!host) return () => {};
    host.innerHTML = SHELL_HTML;

    let teardownActive = null;
    const authUnsub = onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.replace("/login.html"); return; }
        let me = { id: user.uid };
        try {
            const snap = await getDoc(doc(db, "users", user.uid));
            me = { id: user.uid, ...(snap.exists() ? snap.data() : {}) };
        } catch (error) {
            console.warn("[SBI Messagerie] profil indisponible :", error);
        }
        const safeRole = roleOf(me, role) || role || STUDENT_ROLE_KEY;
        if (teardownActive) { try { teardownActive(); } catch (_) {} }
        teardownActive = initMessaging(me, safeRole);
    });

    // Cleanup pour la navigation PJAX (et idempotence au remontage).
    return () => {
        try { authUnsub(); } catch (_) {}
        if (teardownActive) { try { teardownActive(); } catch (_) {} teardownActive = null; }
    };
}

function initMessaging(me, role) {
    const roleKey = role === TEACHER_ROLE_KEY ? TEACHER_ROLE_KEY : STUDENT_ROLE_KEY;
    const el = (id) => document.getElementById(id);

    const conversations = new Map();  // cid -> data
    const reads = new Map();          // cid -> lastReadMillis (local)
    let activeCid = "";
    let messagesUnsub = null;
    let renderQueued = false;
    let currentMessages = [];         // messages du fil ouvert (pour re-render reçu de lecture)
    let otherReadMillis = 0;          // pointeur de lecture de l'autre (DM) → accusé « Lu »
    let otherReadUnsub = null;

    const unsubs = [];
    const trackUnsub = (fn) => { if (typeof fn === "function") unsubs.push(fn); };
    function teardown() {
        unsubs.forEach((u) => { try { u(); } catch (_) {} });
        unsubs.length = 0;
        if (messagesUnsub) { try { messagesUnsub(); } catch (_) {} messagesUnsub = null; }
        if (otherReadUnsub) { try { otherReadUnsub(); } catch (_) {} otherReadUnsub = null; }
    }
    const onBeforeUnload = () => teardown();
    window.addEventListener("beforeunload", onBeforeUnload);

    // --- Réception d'un doc conversation (toutes sources) -----------------
    function upsertConversation(cid, data) {
        if (!data) { conversations.delete(cid); }
        else conversations.set(cid, { id: cid, ...data });
        if (!reads.has(cid)) seedReadPointer(cid);
        scheduleRender();
    }

    async function seedReadPointer(cid) {
        reads.set(cid, reads.get(cid) || 0);
        try {
            const snap = await getDoc(doc(db, "conversations", cid, "reads", me.id));
            if (snap.exists()) {
                reads.set(cid, Math.max(reads.get(cid) || 0, tsToMillis(snap.data().lastReadAt)));
                scheduleRender();
            }
        } catch (_) { /* pas de pointeur encore */ }
    }

    function isUnread(conv) {
        const last = tsToMillis(conv.lastMessageAt);
        if (!last) return false;
        if (conv.lastMessageSenderUid === me.id) return false;
        return last > (reads.get(conv.id) || 0);
    }

    function totalUnread() {
        let n = 0;
        conversations.forEach((c) => { if (isUnread(c)) n += 1; });
        return n;
    }

    function broadcastUnread() {
        const n = totalUnread();
        window.__SBI_MESSAGING_UNREAD__ = n;
        try { window.dispatchEvent(new CustomEvent("sbi-messaging-unread", { detail: { count: n } })); } catch (_) {}
    }

    // --- Rendu de la liste de conversations -------------------------------
    function scheduleRender() {
        if (renderQueued) return;
        renderQueued = true;
        Promise.resolve().then(() => { renderQueued = false; renderThreadList(); broadcastUnread(); });
    }

    function convLabel(conv) {
        if (conv.kind === "dm") {
            const names = conv.participantNames || {};
            const otherUid = (conv.participants || []).find((u) => u !== me.id);
            return names[otherUid] || "Conversation";
        }
        return conv.title || (conv.kind === "announcement" ? "Annonces" : "Salon");
    }

    function convTag(conv) {
        if (conv.kind === "group") return "Salon";
        if (conv.kind === "announcement") return "Annonces";
        return "";
    }

    function renderThreadList() {
        const wrap = el("sbi-msg-threads");
        if (!wrap) return;
        const list = [...conversations.values()].sort((a, b) => tsToMillis(b.lastMessageAt) - tsToMillis(a.lastMessageAt));
        if (!list.length) {
            wrap.innerHTML = `<p class="sbi-msg-muted">Aucune conversation pour l'instant.</p>`;
            return;
        }
        wrap.innerHTML = list.map((conv) => {
            const unread = isUnread(conv);
            const tag = convTag(conv);
            const preview = conv.lastMessageText
                ? `${conv.lastMessageSenderUid === me.id ? "Vous : " : ""}${escapeHtml(conv.lastMessageText)}`
                : "Nouvelle conversation";
            return `
              <button type="button" class="sbi-msg-thread${conv.id === activeCid ? " is-active" : ""}${unread ? " is-unread" : ""}" data-cid="${escapeHtml(conv.id)}">
                <span class="sbi-msg-thread-top">
                  <span class="sbi-msg-thread-name">${escapeHtml(convLabel(conv))}${tag ? ` <span class="sbi-msg-thread-tag">${tag}</span>` : ""}</span>
                  <span class="sbi-msg-thread-time">${formatTime(tsToMillis(conv.lastMessageAt))}</span>
                </span>
                <span class="sbi-msg-thread-preview">${preview}</span>
                ${unread ? '<span class="sbi-msg-dot" aria-label="non lu"></span>' : ""}
              </button>`;
        }).join("");
        wrap.querySelectorAll(".sbi-msg-thread").forEach((btn) => {
            btn.addEventListener("click", () => openConversation(btn.getAttribute("data-cid")));
        });
    }

    // --- Ouverture d'une conversation -------------------------------------
    function openConversation(cid) {
        if (!cid || !conversations.has(cid)) return;
        activeCid = cid;
        const conv = conversations.get(cid);
        el("sbi-msg-placeholder").hidden = true;
        el("sbi-msg-conv").hidden = false;
        document.querySelector(".sbi-msg").classList.add("is-conv-open");
        el("sbi-msg-conv-title").textContent = convLabel(conv);
        el("sbi-msg-conv-sub").textContent = convTag(conv) || (conv.kind === "dm" ? "Message privé" : "");

        const isAnnouncement = conv.kind === "announcement";
        el("sbi-msg-composer").hidden = isAnnouncement;
        el("sbi-msg-readonly").hidden = !isAnnouncement;

        listenOtherRead(cid, conv);
        listenMessages(cid);
        markRead(cid);
        renderThreadList();
    }

    // Accusé de lecture : on suit le pointeur de lecture de l'autre participant (DM).
    function listenOtherRead(cid, conv) {
        if (otherReadUnsub) { try { otherReadUnsub(); } catch (_) {} otherReadUnsub = null; }
        otherReadMillis = 0;
        if (!conv || conv.kind !== "dm") return;
        const otherUid = (conv.participants || []).find((u) => u !== me.id);
        if (!otherUid) return;
        otherReadUnsub = onSnapshot(
            doc(db, "conversations", cid, "reads", otherUid),
            (snap) => {
                if (cid !== activeCid) return;
                otherReadMillis = snap.exists() ? tsToMillis(snap.data().lastReadAt) : 0;
                renderMessages(currentMessages);
            },
            () => {}
        );
    }

    function listenMessages(cid) {
        if (messagesUnsub) { try { messagesUnsub(); } catch (_) {} messagesUnsub = null; }
        const stream = el("sbi-msg-stream");
        stream.innerHTML = `<p class="sbi-msg-muted">Chargement…</p>`;
        const q = query(collection(db, "conversations", cid, "messages"), orderBy("createdAt", "asc"), limit(300));
        messagesUnsub = onSnapshot(q, (snap) => {
            if (cid !== activeCid) return;
            const msgs = [];
            snap.forEach((d) => msgs.push({ id: d.id, ...d.data() }));
            currentMessages = msgs;
            renderMessages(msgs);
            markRead(cid);
        }, (error) => {
            console.warn("[SBI Messagerie] messages indisponibles :", error);
            stream.innerHTML = `<p class="sbi-msg-muted">Messages indisponibles.</p>`;
        });
    }

    function renderMessages(msgs) {
        const stream = el("sbi-msg-stream");
        if (!msgs.length) { stream.innerHTML = `<p class="sbi-msg-muted">Aucun message. Écrivez le premier !</p>`; return; }
        const isDm = conversations.get(activeCid)?.kind === "dm";
        let lastMineIdx = -1;
        for (let i = 0; i < msgs.length; i++) { if (msgs[i].senderUid === me.id) lastMineIdx = i; }
        stream.innerHTML = msgs.map((m, i) => {
            const mine = m.senderUid === me.id;
            const when = formatTime(tsToMillis(m.createdAt));
            // Accusé de lecture sous MON dernier message d'un DM.
            let receipt = "";
            if (mine && isDm && i === lastMineIdx) {
                const createdMs = tsToMillis(m.createdAt);
                const read = Boolean(otherReadMillis && createdMs && otherReadMillis >= createdMs);
                receipt = ` <span class="sbi-msg-receipt${read ? " is-read" : ""}">${read ? "✓✓ Lu" : "✓ Envoyé"}</span>`;
            }
            return `
              <div class="sbi-msg-bubble-row${mine ? " is-mine" : ""}">
                <div class="sbi-msg-bubble">
                  ${mine ? "" : `<span class="sbi-msg-bubble-author">${escapeHtml(m.senderName || "—")}</span>`}
                  ${m.title ? `<span class="sbi-msg-bubble-title">${escapeHtml(m.title)}</span>` : ""}
                  <span class="sbi-msg-bubble-text">${escapeHtml(m.text || "").replace(/\n/g, "<br>")}</span>
                  <span class="sbi-msg-bubble-time">${when}${receipt}</span>
                </div>
              </div>`;
        }).join("");
        stream.scrollTop = stream.scrollHeight;
    }

    async function markRead(cid) {
        reads.set(cid, Date.now());
        scheduleRender();
        try {
            await setDoc(doc(db, "conversations", cid, "reads", me.id), { lastReadAt: serverTimestamp() }, { merge: true });
        } catch (_) { /* non bloquant */ }
    }

    // --- Envoi d'un message ----------------------------------------------
    async function sendMessage(text) {
        const trimmed = (text || "").trim();
        if (!trimmed || !activeCid) return;
        const conv = conversations.get(activeCid);
        if (!conv || conv.kind === "announcement") return;
        const body = trimmed.slice(0, 4000);
        const cid = activeCid;
        try {
            await addDoc(collection(db, "conversations", cid, "messages"), {
                senderUid: me.id,
                senderName: displayName(me),
                text: body,
                createdAt: serverTimestamp()
            });
            // Dénormalisation de l'aperçu côté client (robuste même si le trigger
            // serveur ne se déclenche pas) : le listener de l'autre participant
            // rafraîchit alors sa liste + l'indicateur de non-lu.
            try {
                await setDoc(doc(db, "conversations", cid), {
                    lastMessageAt: serverTimestamp(),
                    lastMessageText: body.slice(0, 140),
                    lastMessageSenderUid: me.id,
                    lastMessageSenderName: displayName(me),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } catch (e) { /* le trigger prendra le relais s'il est actif */ }
        } catch (error) {
            console.error("[SBI Messagerie] envoi impossible :", error);
            alert("Le message n'a pas pu être envoyé.");
        }
    }

    // --- Sélecteur de contacts (nouveau DM) -------------------------------
    let contactsCache = null;
    let contactsLoading = false;
    async function openPicker() {
        const picker = el("sbi-msg-picker");
        picker.hidden = false;
        const listEl = el("sbi-msg-picker-list");
        if (contactsCache) { renderContacts(""); return; }
        if (contactsLoading) return;
        contactsLoading = true;
        listEl.innerHTML = `<p class="sbi-msg-muted">Chargement des contacts…</p>`;

        let settled = false;
        const showRetry = (msg) => {
            if (settled) return;
            settled = true;
            contactsLoading = false;
            listEl.innerHTML = `<p class="sbi-msg-muted">${escapeHtml(msg)} <button type="button" class="sbi-msg-new-btn" id="sbi-msg-contacts-retry">Réessayer</button></p>`;
            const retry = el("sbi-msg-contacts-retry");
            if (retry) retry.addEventListener("click", () => { contactsCache = null; openPicker(); });
        };
        // Garde-fou anti « spin infini » : au-delà de 12 s on propose un retry.
        const guard = setTimeout(() => showRetry("Chargement trop long."), 12000);

        try {
            const formations = await loadAssignedFormationsForUser({ uid: me.id, userData: me, role: roleKey });
            const users = await loadSearchUsersForRole({ uid: me.id, userData: me, role: roleKey, formations });
            if (settled) return;
            clearTimeout(guard);
            settled = true;
            contactsLoading = false;
            contactsCache = Array.isArray(users) ? users : [];
            renderContacts("");
        } catch (error) {
            clearTimeout(guard);
            console.error("[SBI Messagerie] contacts indisponibles :", error);
            showRetry("Contacts indisponibles.");
        }
    }

    function renderContacts(filter) {
        const listEl = el("sbi-msg-picker-list");
        const f = (filter || "").toLowerCase();
        const items = (contactsCache || [])
            .filter((u) => !f || displayName(u).toLowerCase().includes(f) || String(u.email || "").toLowerCase().includes(f))
            .sort((a, b) => displayName(a).localeCompare(displayName(b), "fr"));
        if (!items.length) { listEl.innerHTML = `<p class="sbi-msg-muted">Aucun contact trouvé.</p>`; return; }
        listEl.innerHTML = items.map((u) => `
          <button type="button" class="sbi-msg-contact" data-uid="${escapeHtml(u.id)}">
            <span class="sbi-msg-contact-name">${escapeHtml(displayName(u))}</span>
            <span class="sbi-msg-contact-role">${escapeHtml(roleLabel(u.role))}</span>
          </button>`).join("");
        listEl.querySelectorAll(".sbi-msg-contact").forEach((btn) => {
            btn.addEventListener("click", () => startDirect(btn.getAttribute("data-uid")));
        });
    }

    function roleLabel(r) {
        const v = String(r || "").toLowerCase();
        if (["teacher", "prof", "professeur", "enseignant"].includes(v)) return "Enseignant";
        return "Élève";
    }

    async function startDirect(targetUid) {
        if (!targetUid) return;
        el("sbi-msg-picker").hidden = true;
        try {
            const res = await openDirectConversationFn({ targetUid });
            const cid = res?.data?.conversationId;
            if (!cid) throw new Error("conversationId manquant");
            // Le listener DM finira par capter le doc ; on l'ajoute déjà pour ouvrir tout de suite.
            if (!conversations.has(cid)) {
                const snap = await getDoc(doc(db, "conversations", cid));
                if (snap.exists()) upsertConversation(cid, snap.data());
            }
            scheduleRender();
            setTimeout(() => openConversation(cid), 50);
        } catch (error) {
            console.error("[SBI Messagerie] ouverture conversation impossible :", error);
            alert(error?.message || "Impossible d'ouvrir la conversation avec ce contact.");
        }
    }

    // --- Branchement des listeners temps réel -----------------------------
    // 1) DMs : toutes les conversations où je suis participant.
    trackUnsub(onSnapshot(
        query(collection(db, "conversations"), where("participants", "array-contains", me.id)),
        (snap) => { snap.forEach((d) => upsertConversation(d.id, d.data())); maybeOpenFromQuery(); },
        (error) => console.warn("[SBI Messagerie] DMs indisponibles :", error)
    ));

    // 2) Salons de formation + annonces (ids déterministes).
    (async () => {
        let formations = [];
        try {
            formations = await loadAssignedFormationsForUser({ uid: me.id, userData: me, role: roleKey });
        } catch (error) {
            console.warn("[SBI Messagerie] formations indisponibles :", error);
        }
        // Annonces par rôle.
        listenChannelDoc(`announce_role_${roleKey}`);
        // Les listeners sont posés tout de suite (ils capteront le doc dès sa création) ;
        // les provisionnements de salon partent EN PARALLÈLE (avant : séquentiel = lent).
        const ensures = [];
        for (const f of formations) {
            if (!f || !f.id) continue;
            ensures.push(ensureGroupChannelFn({ formationId: f.id }).catch(() => {}));
            listenChannelDoc(`group_formation_${f.id}`);
            listenChannelDoc(`announce_formation_${f.id}`);
        }
        await Promise.all(ensures);
        maybeOpenFromQuery();
    })();

    function listenChannelDoc(cid) {
        trackUnsub(onSnapshot(doc(db, "conversations", cid),
            (snap) => { if (snap.exists()) upsertConversation(cid, snap.data()); },
            (error) => console.warn("[SBI Messagerie] canal indisponible :", cid, error)
        ));
    }

    // Ouverture auto depuis ?c=<conversationId> (clic notification).
    let openedFromQuery = false;
    function maybeOpenFromQuery() {
        if (openedFromQuery) return;
        const cid = new URLSearchParams(window.location.search).get("c");
        if (cid && conversations.has(cid)) { openedFromQuery = true; openConversation(cid); }
    }

    // --- Évènements UI ----------------------------------------------------
    el("sbi-msg-new-btn").addEventListener("click", openPicker);
    el("sbi-msg-picker-close").addEventListener("click", () => { el("sbi-msg-picker").hidden = true; });
    el("sbi-msg-picker").addEventListener("click", (e) => { if (e.target.id === "sbi-msg-picker") el("sbi-msg-picker").hidden = true; });
    el("sbi-msg-picker-search").addEventListener("input", (e) => renderContacts(e.target.value));
    el("sbi-msg-back").addEventListener("click", () => {
        document.querySelector(".sbi-msg").classList.remove("is-conv-open");
        activeCid = "";
        if (messagesUnsub) { try { messagesUnsub(); } catch (_) {} messagesUnsub = null; }
        if (otherReadUnsub) { try { otherReadUnsub(); } catch (_) {} otherReadUnsub = null; }
        renderThreadList();
    });
    el("sbi-msg-composer").addEventListener("submit", (e) => {
        e.preventDefault();
        const input = el("sbi-msg-input");
        const text = input.value;
        input.value = "";
        input.style.height = "auto";
        sendMessage(text);
    });
    const input = el("sbi-msg-input");
    input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el("sbi-msg-composer").requestSubmit(); }
    });

    scheduleRender();

    // Teardown (navigation PJAX / remontage) : coupe tous les listeners temps réel.
    return () => {
        window.removeEventListener("beforeunload", onBeforeUnload);
        teardown();
    };
}
