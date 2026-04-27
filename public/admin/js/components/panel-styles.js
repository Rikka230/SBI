export function injectPanelStyles() {
  if (document.getElementById('sbi-components-style-fix')) return;

  const style = document.createElement('style');
  style.id = 'sbi-components-style-fix';
  style.textContent = `
    .nav-item { white-space: nowrap !important; overflow: hidden !important; }
    .nav-text { display: inline-block; transition: opacity 0.2s ease; }
    .left-collapsed .nav-text { opacity: 0; pointer-events: none; }
    .left-collapsed .nav-item { padding-left: 15px; padding-right: 15px; justify-content: center; }

    .global-search-results { position: absolute; top: calc(100% + 5px); left: 0; right: 0; background: var(--bg-card, #ffffff); z-index: 9999; border-radius: 8px; display: none; max-height: 350px; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 1px solid var(--border-color, #e5e7eb); }
    .admin-theme .global-search-results { background: #1e1e1e; border-color: #333; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
    .search-result-item { padding: 12px 15px; cursor: pointer; border-bottom: 1px solid var(--border-color, #f3f4f6); display: flex; align-items: center; gap: 12px; color: var(--text-main, #1f2937); transition: 0.2s; }
    .admin-theme .search-result-item { border-color: #333; color: #fff; }
    .search-result-item:hover { background: rgba(42, 87, 255, 0.08); }
    .search-result-title { font-weight: bold; font-size: 0.9rem; margin-bottom: 2px; }
    .search-result-sub { font-size: 0.75rem; color: var(--text-muted, #6b7280); }

    .admin-return-link { display: none !important; width: 100%; padding: 0.75rem 0.8rem; margin-bottom: 0.7rem; background: rgba(42, 87, 255, 0.08); color: var(--accent-blue, #2a57ff); border: 1px solid rgba(42, 87, 255, 0.25); border-radius: 10px; font-weight: 800; cursor: pointer; align-items: center; justify-content: center; gap: 0.5rem; transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease; white-space: nowrap; }
    body.sbi-admin-visitor .admin-return-link { display: flex !important; }
    .admin-return-link:hover { transform: translateY(-1px); background: rgba(42, 87, 255, 0.14); border-color: rgba(42, 87, 255, 0.45); }
    .admin-return-link svg { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }

    .course-delete-icon-btn svg { display: block; width: 18px; height: 18px; fill: currentColor; }

    .left-collapsed #left-panel .admin-return-link,
    .left-collapsed #left-panel #logout-btn-student,
    .left-collapsed #left-panel #logout-btn-teacher {
      width: 46px !important;
      min-width: 46px !important;
      height: 46px !important;
      padding: 0 !important;
      margin-left: auto !important;
      margin-right: auto !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0 !important;
      border-radius: 12px !important;
      overflow: hidden !important;
    }

    .left-collapsed #left-panel .admin-return-link .nav-text,
    .left-collapsed #left-panel #logout-btn-student .nav-text,
    .left-collapsed #left-panel #logout-btn-teacher .nav-text {
      display: none !important;
    }

    .left-collapsed #left-panel .admin-return-link svg,
    .left-collapsed #left-panel #logout-btn-student svg,
    .left-collapsed #left-panel #logout-btn-teacher svg {
      width: 20px !important;
      height: 20px !important;
      margin: 0 !important;
      flex: 0 0 auto !important;
      fill: currentColor !important;
    }

    .left-collapsed #left-panel > div[style*="margin-top:auto"] {
      padding-left: 0.5rem !important;
      padding-right: 0.5rem !important;
    }
  `;
  document.head.appendChild(style);
}
