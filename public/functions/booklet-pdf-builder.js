/**
 * =======================================================================
 * SBI — Livret d'apprentissage : construction du DOSSIER PDF complet
 * -----------------------------------------------------------------------
 * Cloud Function helper. Rend le corps du livret (HTML fourni par le client)
 * en PDF via Puppeteer + paged.js (sommaire à numéros de pages RÉELS, deux
 * passes), puis FUSIONNE les annexes PDF rattachées à la formation (via
 * pdf-lib) dans le bon ordre. Retourne une URL signée V4 du PDF final.
 *
 * Aucune impression navigateur : displayHeaderFooter:false, printBackground:true,
 * A4, pas de about:blank / en-tête / pied navigateur.
 *
 * Contrat d'entrée (data) :
 *   - bookletId : string
 *   - withAnnexes : bool (l'admin peut demander sans annexes)
 *   - bodyHtml : string — document HTML COMPLET du corps, avec :
 *       · un placeholder sommaire `<div data-sbi-toc-placeholder></div>`
 *       · des sections annotées `<section data-toc="Titre">…`
 *       · un placeholder annexes `<div data-sbi-annex-intro></div>`
 *       · PAS de <script> d'auto-impression
 * =======================================================================
 */

const puppeteer = require("puppeteer-core");
// @sparticuz/chromium v149 est publié en ESM : require() renvoie un wrapper
// d'interop dont la vraie API (executablePath/args/headless/defaultViewport)
// est sur `.default`. Sans `.default`, chromium.executablePath est undefined
// -> "TypeError: chromium.executablePath is not a function" à chaque appel.
const chromium = require("@sparticuz/chromium").default || require("@sparticuz/chromium");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");

// Catégories institutionnelles jointes AUTOMATIQUEMENT au livret (mode hybride),
// sauf opt-out explicite (includeInApprenticeshipBooklet === false).
const AUTO_ANNEX_CATEGORIES = ["livret", "reglement", "referentiel", "planning"];
// Ordre d'affichage par défaut des annexes (si appendixOrder non défini).
const CATEGORY_ORDER = { livret: 1, reglement: 2, referentiel: 3, planning: 4, autre: 5 };
const CATEGORY_LABEL = {
    livret: "Livret d'accueil",
    reglement: "Règlement intérieur",
    referentiel: "Référentiel / certification",
    planning: "Planning de formation",
    autre: "Document de formation"
};

// Visibilité d'une annexe -> rôles autorisés à la recevoir.
// Un doc sans appendixVisibility est considéré 'tous'.
function allowedVisibilitiesForRole(role) {
    if (role === "admin") return ["tous", "eleve", "tuteur", "admin"];
    if (role === "teacher") return ["tous", "eleve", "tuteur"];
    if (role === "student") return ["tous", "eleve"];
    if (role === "tutor") return ["tous", "tuteur"];
    return ["tous"];
}

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Extrait, dans l'ordre du document, les titres de section annotés data-toc.
function extractTocTitles(bodyHtml) {
    const titles = [];
    const re = /data-toc="([^"]*)"/g;
    let m;
    while ((m = re.exec(bodyHtml)) !== null) {
        const t = m[1].trim();
        if (t) titles.push(t);
    }
    return titles;
}

// Construit le <nav> sommaire. `rows` = [{ title, page|null, isAnnex }].
function buildTocHtml(rows) {
    const lis = rows.map((r) => {
        const num = (r.page && Number.isFinite(r.page)) ? String(r.page) : "—";
        const cls = r.isAnnex ? "sbi-toc-row sbi-toc-annex" : "sbi-toc-row";
        return `<li class="${cls}"><span class="sbi-toc-title">${escapeHtml(r.title)}</span>`
            + `<span class="sbi-toc-dots"></span><span class="sbi-toc-page">${num}</span></li>`;
    }).join("");
    return `<nav class="sbi-toc"><h2 class="sbi-toc-h">Sommaire</h2><ul class="sbi-toc-list">${lis}</ul></nav>`;
}

// Page d'introduction des annexes (+ notes « non joint »).
function buildAnnexIntroHtml(merged, missing) {
    if (!merged.length && !missing.length) {
        return `<section class="annex-intro page-break"><h2>Annexes</h2>`
            + `<p class="sub">Aucune annexe disponible pour cette formation.</p></section>`;
    }
    const okRows = merged.map((a, i) =>
        `<li>Annexe ${i + 1} : ${escapeHtml(a.title)}${a.version ? ` <span class="sub-inline">(v. ${escapeHtml(a.version)})</span>` : ""}</li>`
    ).join("");
    const missRows = missing.map((t) =>
        `<li class="annex-missing">Document non joint : ${escapeHtml(t)}</li>`
    ).join("");
    return `<section class="annex-intro page-break">
        <h2>Annexes</h2>
        <p class="sub">Documents officiels de la formation joints à la suite du livret.</p>
        <ul class="annex-list">${okRows}${missRows}</ul>
    </section>`;
}

const TOC_CSS = `
  .sbi-toc{page-break-after:always;break-after:page;}
  .sbi-toc-h{font-size:18px;color:#101828;border-left:4px solid #0051ff;padding:2px 0 2px 10px;margin:0 0 14px;}
  .sbi-toc-list{list-style:none;margin:0;padding:0;}
  .sbi-toc-row{display:flex;align-items:baseline;font-size:13px;color:#253047;padding:5px 0;border-bottom:1px dotted #dce4f2;}
  .sbi-toc-title{white-space:nowrap;}
  .sbi-toc-dots{flex:1;}
  .sbi-toc-page{font-weight:700;color:#0051ff;padding-left:8px;}
  .sbi-toc-annex .sbi-toc-title{font-style:italic;}
  .annex-list{font-size:13px;line-height:1.8;color:#253047;}
  .annex-missing{color:#b91c1c;}
`;

// Injecte le CSS du sommaire juste avant </style>, le sommaire dans son
// placeholder, et l'intro annexes dans le sien.
function assembleHtml(bodyHtml, tocHtml, annexIntroHtml) {
    let html = bodyHtml;
    if (html.indexOf("</style>") !== -1) {
        html = html.replace("</style>", `${TOC_CSS}</style>`);
    }
    html = html.replace(/<div data-sbi-toc-placeholder><\/div>/, tocHtml);
    html = html.replace(/<div data-sbi-annex-intro><\/div>/, annexIntroHtml);
    return html;
}

let cachedPagedScript = null;
function pagedPolyfillScript() {
    if (cachedPagedScript) return cachedPagedScript;
    let p;
    try { p = require.resolve("pagedjs/dist/paged.polyfill.min.js"); }
    catch (_) { p = require.resolve("pagedjs/dist/paged.polyfill.js"); }
    cachedPagedScript = fs.readFileSync(p, "utf8");
    return cachedPagedScript;
}

// Lance Chromium et pagine `html` via paged.js. Retourne { pageOf, totalPages, pdf? }.
async function renderWithPaged(html, { withPdf }) {
    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
        executablePath: await chromium.executablePath(),
        headless: true
    });
    try {
        const page = await browser.newPage();
        await page.emulateMediaType("print");
        await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
        await page.addScriptTag({ content: pagedPolyfillScript() });
        // paged.js pagine sur chargement du script ; on attend la fin du rendu.
        await page.waitForSelector(".pagedjs_page", { timeout: 60000 });
        await page.waitForFunction(
            () => window.PagedPolyfill === undefined || document.querySelectorAll(".pagedjs_page").length > 0,
            { timeout: 60000 }
        );
        // Petit délai pour laisser paged.js stabiliser les compteurs de page.
        await new Promise((r) => setTimeout(r, 300));

        const measure = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll("[data-toc]").forEach((el) => {
                const pg = el.closest(".pagedjs_page");
                const n = pg ? parseInt(pg.getAttribute("data-page-number") || "0", 10) : 0;
                out.push({ title: el.getAttribute("data-toc"), page: n || null });
            });
            return { titles: out, total: document.querySelectorAll(".pagedjs_page").length };
        });

        let pdf = null;
        if (withPdf) {
            pdf = await page.pdf({
                printBackground: true,
                preferCSSPageSize: true,
                displayHeaderFooter: false,
                margin: { top: "0", right: "0", bottom: "0", left: "0" }
            });
        }
        return { titles: measure.titles, totalPages: measure.total || 1, pdf };
    } finally {
        await browser.close();
    }
}

/**
 * Construit le dossier PDF complet (corps + sommaire paginé + annexes fusionnées).
 * @param {{admin:object, db:object, caller:object, data:object, HttpsError:Function, cleanString:Function}} ctx
 */
async function build(ctx) {
    const { admin, db, caller, data, HttpsError, cleanString } = ctx;
    const bookletId = cleanString(data.bookletId, 200);
    if (!bookletId) throw new HttpsError("invalid-argument", "Livret manquant.");
    const bodyHtml = typeof data.bodyHtml === "string" ? data.bodyHtml : "";
    if (!bodyHtml || bodyHtml.length < 100) throw new HttpsError("invalid-argument", "Contenu du livret manquant.");
    const withAnnexes = data.withAnnexes !== false;

    const snap = await db.collection("apprenticeshipBooklets").doc(bookletId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Livret introuvable.");
    const booklet = snap.data() || {};

    // --- Permission : mêmes droits que la lecture du livret. ---
    let role = null;
    if (caller.isAdmin) role = "admin";
    else if (cleanString(booklet.studentId, 200) === caller.uid) role = "student";
    else if (cleanString(booklet.tutorId, 200) === caller.uid) role = "tutor";
    else if (caller.isTeacher) {
        // Prof rattaché à la formation du livret (formation.profs).
        const fId = cleanString(booklet.formationId, 200);
        if (fId) {
            const fSnap = await db.collection("formations").doc(fId).get();
            const profs = (fSnap.exists && Array.isArray(fSnap.data().profs)) ? fSnap.data().profs : [];
            if (profs.includes(caller.uid)) role = "teacher";
        }
    }
    if (!role) throw new HttpsError("permission-denied", "Vous n'êtes pas autorisé à télécharger ce livret.");

    // --- Annexes : mode HYBRIDE (auto institutionnel + opt-in « autres »). ---
    const merged = [];   // { title, version, bytes }
    const missing = [];  // titres attendus mais non joignables
    if (withAnnexes) {
        // Formation du livret, avec fallback élève -> promotion si absente.
        let fId = cleanString(booklet.formationId, 200);
        if (!fId) {
            try {
                const sId = cleanString(booklet.studentId, 200);
                if (sId) {
                    const sSnap = await db.collection("users").doc(sId).get();
                    const fids = sSnap.exists && Array.isArray(sSnap.data().formationIds) ? sSnap.data().formationIds : [];
                    if (fids.length) fId = cleanString(fids[0], 200);
                }
                if (!fId) {
                    const pId = cleanString(booklet.promotionId, 200);
                    if (pId) {
                        const pSnap = await db.collection("promotions").doc(pId).get();
                        if (pSnap.exists) fId = cleanString(pSnap.data().formationId, 200);
                    }
                }
            } catch (err) {
                console.warn("[booklet-pdf] fallback formationId échoué :", err && err.message);
            }
        }

        if (fId) {
            const allowed = allowedVisibilitiesForRole(role);
            const promotionId = cleanString(booklet.promotionId, 200);
            const docsSnap = await db.collection("formationDocuments")
                .where("formationId", "==", fId)
                .get();
            let entries = [];
            docsSnap.forEach((d) => entries.push({ id: d.id, ...(d.data() || {}) }));

            // Portée élève : doc « formation-wide » (promotionId vide) OU ciblé sur SA promotion.
            entries = entries.filter((e) => {
                const ep = cleanString(e.promotionId, 200);
                return !ep || ep === promotionId;
            });
            // Planning : si une entrée ciblée sur la promotion existe, on écarte la version formation.
            const planningTargeted = entries.some((e) => e.category === "planning" && cleanString(e.promotionId, 200) === promotionId && promotionId);
            if (planningTargeted) {
                entries = entries.filter((e) => !(e.category === "planning" && !cleanString(e.promotionId, 200)));
            }

            // Règle hybride : institutionnel = auto (sauf opt-out), « autre » = opt-in.
            entries = entries.filter((e) => {
                if (e.includeInApprenticeshipBooklet === false) return false;
                if (AUTO_ANNEX_CATEGORIES.includes(e.category)) return true;
                return e.includeInApprenticeshipBooklet === true;
            });

            // Tri : appendixOrder explicite sinon ordre de catégorie, puis titre.
            const orderKey = (e) => Number.isFinite(Number(e.appendixOrder)) && e.appendixOrder !== "" && e.appendixOrder != null
                ? Number(e.appendixOrder) : (CATEGORY_ORDER[e.category] || 9) * 100;
            entries.sort((a, b) => (orderKey(a) - orderKey(b))
                || String(a.appendixTitle || a.title || "").localeCompare(String(b.appendixTitle || b.title || "")));

            const bucket = admin.storage().bucket();
            for (const e of entries) {
                const vis = cleanString(e.appendixVisibility || "tous", 20) || "tous";
                if (!allowed.includes(vis)) continue; // doc réservé : ignoré pour ce rôle
                const title = cleanString(e.appendixTitle || CATEGORY_LABEL[e.category] || e.title || "Annexe", 200);
                const isPdf = String(e.contentType || e.mimeType || "").indexOf("pdf") !== -1
                    || /\.pdf$/i.test(String(e.fileName || e.filePath || ""));
                const filePath = cleanString(e.filePath, 500);
                // Planning généré depuis un cursus (sans fichier) : déjà présent dans le
                // corps du livret -> on l'ignore silencieusement (pas « non joint »).
                if (!filePath) { if (e.category !== "planning") missing.push(title); continue; }
                if (!isPdf) { missing.push(title); continue; }
                try {
                    const [bytes] = await bucket.file(filePath).download();
                    merged.push({ title, version: cleanString(e.version, 60), bytes });
                } catch (err) {
                    console.warn("[booklet-pdf] annexe non téléchargeable :", filePath, err && err.message);
                    missing.push(title);
                }
            }
        }
    }

    // --- Sommaire (2 passes paged.js, nombre de lignes stable). ---
    const sectionTitles = extractTocTitles(bodyHtml);
    const annexRows = merged.map((a) => ({ title: a.title, page: null, isAnnex: true }));
    const baseRows = sectionTitles.map((t) => ({ title: t, page: null, isAnnex: false }));
    const annexIntroHtml = buildAnnexIntroHtml(merged, missing);

    // Passe 1 : mesure des pages de chaque section + total du corps.
    const pass1Html = assembleHtml(bodyHtml, buildTocHtml(baseRows.concat(annexRows)), annexIntroHtml);
    const pass1 = await renderWithPaged(pass1Html, { withPdf: false });
    const bodyPages = pass1.totalPages;

    // Page de chaque section = mesure paged.js (ordre identique à l'extraction).
    const measuredRows = baseRows.map((r, i) => ({
        title: r.title,
        page: pass1.titles[i] ? pass1.titles[i].page : null,
        isAnnex: false
    }));
    // Pages de début des annexes : juste après le corps, cumul des pages d'annexes.
    let cursor = bodyPages;
    const annexCounts = [];
    for (const a of merged) {
        try {
            const doc = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
            annexCounts.push(doc.getPageCount());
        } catch (_) { annexCounts.push(1); }
    }
    const annexFinalRows = merged.map((a, i) => {
        const startPage = cursor + 1;
        cursor += annexCounts[i];
        return { title: a.title, page: startPage, isAnnex: true };
    });

    // Passe 2 : rendu final du corps avec les vrais numéros (même nb de lignes).
    const pass2Html = assembleHtml(bodyHtml, buildTocHtml(measuredRows.concat(annexFinalRows)), annexIntroHtml);
    const pass2 = await renderWithPaged(pass2Html, { withPdf: true });

    // --- Fusion pdf-lib : corps + annexes. ---
    const finalDoc = await PDFDocument.create();
    const bodyDoc = await PDFDocument.load(pass2.pdf, { ignoreEncryption: true });
    const bodyCopied = await finalDoc.copyPages(bodyDoc, bodyDoc.getPageIndices());
    bodyCopied.forEach((p) => finalDoc.addPage(p));
    for (const a of merged) {
        try {
            const doc = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
            const copied = await finalDoc.copyPages(doc, doc.getPageIndices());
            copied.forEach((p) => finalDoc.addPage(p));
        } catch (err) {
            console.warn("[booklet-pdf] fusion annexe échouée :", a.title, err && err.message);
        }
    }
    const finalBytes = await finalDoc.save();

    // --- Upload + URL signée V4 (1h). ---
    const safeName = cleanString(booklet.studentName, 80).replace(/[^a-zA-Z0-9-_]/g, "_") || bookletId;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `apprenticeship-booklets/${bookletId}/dossier-${stamp}.pdf`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    await file.save(Buffer.from(finalBytes), {
        contentType: "application/pdf",
        metadata: { metadata: { generatedBy: caller.uid, bookletId } }
    });
    const [url] = await file.getSignedUrl({
        action: "read",
        version: "v4",
        expires: Date.now() + 60 * 60 * 1000
    });

    return {
        success: true,
        url,
        fileName: `Livret_${safeName}.pdf`,
        bodyPages,
        annexCount: merged.length,
        missing
    };
}

module.exports = { build };
