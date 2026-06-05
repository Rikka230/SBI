/**
 * SBI 8.0P.167.341 — Admin : composer d'annonces (messagerie unidirectionnelle).
 * L'admin publie une annonce vers « tous les élèves », « tous les enseignants »
 * ou « une formation ». Écriture serveur (sendAdminAnnouncement) → fil lecture
 * seule côté destinataires + notification cloche (+ email optionnel).
 */

import { app, db, auth } from "/js/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { loadAssignedFormationsForUser } from "/js/learning-access.js";

const functions = getFunctions(app, "europe-west1");
const sendAdminAnnouncementFn = httpsCallable(functions, "sendAdminAnnouncement");

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function tsToMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    return 0;
}

const SHELL = `
<div class="sbi-annc">
  <header class="sbi-annc-head">
    <p class="sbi-annc-kicker">Messagerie · Direction</p>
    <h2>Annonces</h2>
    <p class="sbi-annc-lead">Publiez une annonce à l'attention des enseignants ou des élèves. Le message apparaît en lecture seule dans leur messagerie (canal « Annonces ») et déclenche une notification.</p>
  </header>
  <div class="sbi-annc-grid">
    <form class="sbi-annc-form" id="annc-form">
      <fieldset class="sbi-annc-fieldset">
        <legend>Destinataires</legend>
        <label class="sbi-annc-radio"><input type="radio" name="aud" value="role:student" checked> Tous les élèves</label>
        <label class="sbi-annc-radio"><input type="radio" name="aud" value="role:teacher"> Tous les enseignants</label>
        <label class="sbi-annc-radio"><input type="radio" name="aud" value="formation"> Une formation</label>
        <select class="sbi-annc-select" id="annc-formation" disabled><option value="">Chargement des formations…</option></select>
      </fieldset>
      <label class="sbi-annc-label">Titre (optionnel)
        <input type="text" class="sbi-annc-input" id="annc-title" maxlength="200" placeholder="Ex. Fermeture exceptionnelle">
      </label>
      <label class="sbi-annc-label">Message
        <textarea class="sbi-annc-textarea" id="annc-body" rows="6" maxlength="4000" placeholder="Votre annonce…" required></textarea>
      </label>
      <label class="sbi-annc-check"><input type="checkbox" id="annc-email"> Envoyer aussi par email (Brevo)</label>
      <div class="sbi-annc-actions">
        <button type="submit" class="sbi-annc-send" id="annc-send">Publier l'annonce</button>
        <span class="sbi-annc-status" id="annc-status"></span>
      </div>
    </form>
    <section class="sbi-annc-history" id="annc-history">
      <h3>Dernières annonces</h3>
      <div id="annc-history-list"><p class="sbi-annc-muted">Chargement…</p></div>
    </section>
  </div>
</div>
`;

async function init() {
    const host = document.querySelector(".content-wrapper") || document.getElementById("main-content");
    if (!host) return;
    host.innerHTML = SHELL;

    const el = (id) => document.getElementById(id);
    let formations = [];

    try {
        formations = await loadAssignedFormationsForUser({ uid: auth.currentUser?.uid, userData: { role: "admin", isGod: true }, role: "admin" });
    } catch (error) {
        console.warn("[SBI Annonces] formations indisponibles :", error);
    }
    const select = el("annc-formation");
    select.innerHTML = `<option value="">— choisir —</option>` + formations
        .map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.titre || f.nom || f.id)}</option>`).join("");

    el("annc-form").querySelectorAll('input[name="aud"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            const isFormation = el("annc-form").querySelector('input[name="aud"]:checked').value === "formation";
            select.disabled = !isFormation;
        });
    });

    el("annc-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const aud = el("annc-form").querySelector('input[name="aud"]:checked').value;
        const title = el("annc-title").value.trim();
        const body = el("annc-body").value.trim();
        const sendEmail = el("annc-email").checked;
        const status = el("annc-status");
        if (!body) { status.textContent = "Le message est vide."; return; }

        let payload = { title, body, sendEmail };
        if (aud === "role:student") payload = { ...payload, audienceType: "role", audienceRole: "student" };
        else if (aud === "role:teacher") payload = { ...payload, audienceType: "role", audienceRole: "teacher" };
        else {
            const fid = select.value;
            if (!fid) { status.textContent = "Sélectionnez une formation."; return; }
            payload = { ...payload, audienceType: "formation", audienceFormationId: fid };
        }

        el("annc-send").disabled = true;
        status.textContent = "Publication…";
        try {
            const res = await sendAdminAnnouncementFn(payload);
            const d = res?.data || {};
            status.textContent = `Annonce publiée — ${d.recipients || 0} destinataire(s)${d.emailed ? `, ${d.emailed} email(s)` : ""}.`;
            el("annc-body").value = "";
            el("annc-title").value = "";
            loadHistory(formations);
        } catch (error) {
            console.error("[SBI Annonces] échec :", error);
            status.textContent = error?.message || "La publication a échoué.";
        } finally {
            el("annc-send").disabled = false;
        }
    });

    loadHistory(formations);
}

async function loadHistory(formations) {
    const listEl = document.getElementById("annc-history-list");
    if (!listEl) return;
    const channelIds = ["announce_role_student", "announce_role_teacher", ...formations.map((f) => `announce_formation_${f.id}`)];
    const items = [];
    for (const cid of channelIds) {
        try {
            const snap = await getDocs(query(collection(db, "conversations", cid, "messages"), orderBy("createdAt", "desc"), limit(5)));
            snap.forEach((d) => {
                const m = d.data() || {};
                items.push({ cid, when: tsToMillis(m.createdAt), title: m.title || "", text: m.text || "", audience: audienceLabel(cid, formations) });
            });
        } catch (_) { /* canal pas encore créé */ }
    }
    items.sort((a, b) => b.when - a.when);
    if (!items.length) { listEl.innerHTML = `<p class="sbi-annc-muted">Aucune annonce pour l'instant.</p>`; return; }
    listEl.innerHTML = items.slice(0, 15).map((it) => `
      <article class="sbi-annc-item">
        <div class="sbi-annc-item-top">
          <span class="sbi-annc-item-aud">${escapeHtml(it.audience)}</span>
          <span class="sbi-annc-item-when">${it.when ? new Date(it.when).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
        </div>
        ${it.title ? `<strong>${escapeHtml(it.title)}</strong>` : ""}
        <p>${escapeHtml(it.text).replace(/\n/g, "<br>")}</p>
      </article>`).join("");
}

function audienceLabel(cid, formations) {
    if (cid === "announce_role_student") return "Tous les élèves";
    if (cid === "announce_role_teacher") return "Tous les enseignants";
    const fid = cid.replace("announce_formation_", "");
    const f = formations.find((x) => x.id === fid);
    return f ? `Formation — ${f.titre || f.nom || fid}` : "Formation";
}

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.replace("/login.html"); return; }
    init();
});
