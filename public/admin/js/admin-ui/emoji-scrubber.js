export function initEmojiScrubber() {
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
    const root = document.getElementById('app-container') || document.body;

    const cleanTextNode = (node) => {
        if (!node.nodeValue || !emojiRegex.test(node.nodeValue)) return;
        node.nodeValue = node.nodeValue.replace(emojiRegex, '').replace(/\s{2,}/g, ' ');
    };

    const cleanElement = (element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('script, style, svg')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        textNodes.forEach(cleanTextNode);
    };

    cleanElement(root);

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    cleanTextNode(node);
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    cleanElement(node);
                }
            });
        });
    });

    observer.observe(root, { childList: true, subtree: true });
}
