export function initSafeComponentPolish() {
    import('/admin/js/sbi-component-polish.js').catch((error) => {
        console.warn('[SBI UI] Component polish désactivé :', error);
    });
}
