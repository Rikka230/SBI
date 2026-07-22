/**
 * =======================================================================
 * ASSISTANT ÉLÈVE SBI — chat intégré au panneau « Continue ton parcours »
 * =======================================================================
 * Ajoute un bouton « Assistant » dans le panneau flottant de l'espace élève
 * (à côté de Mes cours / Notifications / Fermer) et y affiche une barre de chat.
 * Les réponses sont SCOPÉES au compte/cursus de l'élève (le serveur vérifie son
 * jeton Firebase) et les demandes sont triées/routées vers l'employé assigné.
 *
 * Réutilise les styles natifs du panneau (.sbi-assistant__action) → couleurs du thème.
 * Élève uniquement, self-mount quand le panneau apparaît.
 * =======================================================================
 */
import { auth } from '/js/firebase-init.js';

const RELAY = 'https://hermes-agent-dv0g.srv1764492.hstgr.cloud/ene/sbi/assistant';
const history = [];
let mounted = false;

function isStudent() {
  return window.location.pathname.toLowerCase().startsWith('/student/');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function el(tag, css, html) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (html != null) e.innerHTML = html;
  return e;
}

function bubble(role, text) {
  const wrap = el('div', 'display:flex; margin:6px 0; ' +
    (role === 'user' ? 'justify-content:flex-end;' : 'justify-content:flex-start;'));
  const b = el('div',
    'max-width:84%; padding:9px 12px; border-radius:14px; font-size:.83rem; line-height:1.45; white-space:pre-wrap; word-break:break-word; ' +
    (role === 'user'
      ? 'background:var(--accent-blue,#2A57FF); color:#fff; border-bottom-right-radius:4px;'
      : 'background:#f1f2f6; color:#1b1c28; border-bottom-left-radius:4px;'),
    esc(text));
  wrap.appendChild(b);
  return wrap;
}

function mount() {
  if (mounted) return;
  const panel = document.querySelector('.sbi-assistant__panel');
  const actions = panel && panel.querySelector('.sbi-assistant__actions');
  if (!panel || !actions) return;
  mounted = true;

  const text = panel.querySelector('.sbi-assistant__text');
  const notifHost = panel.querySelector('[data-assistant-notification-host]');

  // ---- Bouton "Assistant" dans la barre d'actions (style natif) ----
  const btn = el('button', null,
    '<span aria-hidden="true">💬</span> Assistant');
  btn.type = 'button';
  btn.className = 'sbi-assistant__action secondary';
  btn.setAttribute('data-assistant-chat', '');
  actions.insertBefore(btn, actions.querySelector('[data-assistant-close]'));

  // ---- Zone de chat (cachée par défaut) ----
  const chat = el('div',
    'display:none; flex-direction:column; height:340px; margin-top:10px; border-top:1px solid rgba(0,0,0,.08); padding-top:8px;');
  const msgs = el('div',
    'flex:1; overflow-y:auto; padding:4px 2px; display:flex; flex-direction:column;');
  msgs.appendChild(bubble('ai',
    'Salut 👋 Je suis ton assistant SBI. Une question sur ta formation, ta progression, un cours ou la plateforme ? Je t\'aide tout de suite.'));
  const bar = el('div', 'display:flex; gap:8px; padding-top:8px; align-items:flex-end;');
  const input = el('textarea',
    'flex:1; resize:none; height:38px; max-height:100px; padding:9px 11px; border-radius:10px; background:#fff; color:#1b1c28; border:1px solid #d7d9e3; outline:none; font-size:.83rem; font-family:inherit; box-sizing:border-box;');
  input.placeholder = 'Écris ta question…';
  const send = el('button',
    'flex:none; background:var(--accent-blue,#2A57FF); color:#fff; border:none; border-radius:10px; padding:0 15px; height:38px; font-size:.82rem; font-weight:600; cursor:pointer;',
    'Envoyer');
  bar.appendChild(input);
  bar.appendChild(send);
  chat.appendChild(msgs);
  chat.appendChild(bar);
  panel.appendChild(chat);

  // ---- Bascule chat / vue normale ----
  function showChat(on) {
    chat.style.display = on ? 'flex' : 'none';
    if (text) text.style.display = on ? 'none' : '';
    if (notifHost) notifHost.style.display = on ? 'none' : '';
    btn.classList.toggle('is-active', on);
    if (on) setTimeout(() => input.focus(), 40);
  }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showChat(chat.style.display === 'none');
  });
  // les autres actions ferment le chat
  actions.querySelectorAll('[data-assistant-primary],[data-assistant-notifications],[data-assistant-close]')
    .forEach((b) => b.addEventListener('click', () => showChat(false)));

  // ---- Envoi ----
  let busy = false;
  async function ask() {
    const q = input.value.trim();
    if (!q || busy) return;
    busy = true;
    input.value = ''; input.style.height = '38px';
    msgs.appendChild(bubble('user', q));
    const typing = bubble('ai', '…');
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Reconnecte-toi pour utiliser l\'assistant.');
      const token = await user.getIdToken();
      const res = await fetch(RELAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token, question: q, history: history.slice(-6) })
      });
      const data = await res.json();
      const answer = (data && data.ok && data.answer) ? data.answer
        : (data && data.error) ? ('Souci technique : ' + data.error)
          : 'Désolé, je n\'ai pas pu répondre. Réessaie dans un instant.';
      typing.remove();
      msgs.appendChild(bubble('ai', answer));
      history.push({ role: 'user', text: q });
      history.push({ role: 'ai', text: answer });
    } catch (e) {
      typing.remove();
      msgs.appendChild(bubble('ai', 'Oups : ' + (e && e.message ? e.message : 'erreur réseau') + '. Réessaie.'));
    } finally {
      busy = false;
      msgs.scrollTop = msgs.scrollHeight;
    }
  }
  send.addEventListener('click', ask);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
  });
  input.addEventListener('input', () => {
    input.style.height = '38px';
    input.style.height = Math.min(100, input.scrollHeight) + 'px';
  });
  // ne pas fermer le panneau quand on clique dans le chat
  chat.addEventListener('click', (e) => e.stopPropagation());
}

function boot() {
  if (!isStudent()) return;
  const iv = setInterval(() => {
    if (document.querySelector('.sbi-assistant__panel .sbi-assistant__actions')) {
      clearInterval(iv);
      mount();
    }
  }, 400);
  setTimeout(() => clearInterval(iv), 25000);
}

if (document.readyState !== 'loading') boot();
else document.addEventListener('DOMContentLoaded', boot);
