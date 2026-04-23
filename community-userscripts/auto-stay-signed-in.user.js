// ==UserScript==
// @name         Auto check "keep me signed in"
// @description  Auto-checks any "stay signed in / remember me / keep me logged in" box on login screens so you don't have to.
// @author       nexus
// @version      1.0.0
// @match        https://*/*
// @run-at       document-end
// ==/UserScript==

new MutationObserver(() => {
  document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    const label = (cb.closest('label')?.innerText || '').toLowerCase();
    if (/stay signed in|keep me logged in|remember me/.test(label) && !cb.checked) {
      cb.click();
    }
  });
}).observe(document.body, { childList: true, subtree: true });
