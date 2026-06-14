/**
 * =======================================================================
 * SBI — Mesure d'audience maison (first-party, anonyme, SANS cookie)
 * -----------------------------------------------------------------------
 * Envoie des évènements de mesure à /api/ingestAnalytics (same-origin,
 * sendBeacon). Aucune donnée personnelle, aucun cookie : un simple
 * marqueur de session en sessionStorage (effacé à la fermeture).
 * Évènements : pageview, dwell (temps passé), formation_open,
 * brochure_download, contact_submit.
 * API publique : window.sbiTrack(type, data).
 * ===================================================================== */
(function () {
  var ENDPOINT = '/api/ingestAnalytics';

  function send(payload) {
    try {
      var json = JSON.stringify(payload);
      if (navigator && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'text/plain' }));
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          body: json,
          keepalive: true,
          headers: { 'Content-Type': 'text/plain' }
        }).catch(function () {});
      }
    } catch (e) { /* noop */ }
  }

  // Marqueur de session (anonyme, sessionStorage uniquement)
  var isNew = 0;
  try {
    if (!sessionStorage.getItem('sbi_an_s')) {
      sessionStorage.setItem('sbi_an_s', '1');
      isNew = 1;
    }
  } catch (e) { /* noop */ }

  function currentPath() {
    try { return location.pathname || '/'; } catch (e) { return '/'; }
  }

  // Vue de page
  send({ t: 'pageview', p: currentPath(), new: isNew });

  // Temps passé (dwell) — envoyé une fois, à la première sortie de page
  var start = Date.now();
  var dwellSent = false;
  function flushDwell() {
    if (dwellSent) return;
    var ms = Date.now() - start;
    if (ms < 1000) return;
    dwellSent = true;
    send({ t: 'dwell', ms: ms });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushDwell();
  });
  window.addEventListener('pagehide', flushDwell);

  // API pour les évènements métier (fiche ouverte, brochure, contact…)
  window.sbiTrack = function (type, data) {
    if (!type) return;
    var p = { t: String(type) };
    if (data && typeof data === 'object') {
      for (var k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) p[k] = data[k];
      }
    }
    send(p);
  };
}());
