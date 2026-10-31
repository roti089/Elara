/* ==========================================================
   ELARA APP (PWA): makes Elara installable on phones, tablets and computers.
   Registers the service worker and remembers the browser's "install" offer
   so Settings can show an Install button.
========================================================== */
(function () {
    "use strict";
    var deferred = null;
    var ua = navigator.userAgent || "";
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    if (standalone) document.documentElement.classList.add("elara-app");

    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
        window.addEventListener("load", function () {
            navigator.serviceWorker.register("elara-sw.js").catch(function (e) { console.warn("[Elara] service worker:", e.message); });
        });
    }
    window.addEventListener("beforeinstallprompt", function (e) {
        e.preventDefault(); deferred = e;
        document.dispatchEvent(new CustomEvent("elara:installable"));
    });
    window.addEventListener("appinstalled", function () {
        deferred = null; standalone = true;
        document.dispatchEvent(new CustomEvent("elara:installed"));
    });

    window.ElaraInstall = {
        get installed() { return standalone; },
        get canPrompt() { return !!deferred; },
        isIOS: isIOS,
        secure: location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1",
        prompt: function () {
            if (!deferred) return Promise.resolve(false);
            var d = deferred; deferred = null;
            d.prompt();
            return d.userChoice.then(function (c) { return c.outcome === "accepted"; });
        }
    };

    /* phones: a one-time, dismissible "install" banner on the dashboard pages */
    var KEY = "pwa-install-dismissed";       // not an "elara..." key, so it stays on this device only
    // closing the banner hides it for 14 days on this device
    function dismissed() { try { var t = Number(localStorage.getItem(KEY) || 0); return t > 1 && Date.now() - t < 14 * 86400000; } catch (e) { return true; } }
    function banner(text, withButton) {
        if (standalone || dismissed() || !/dashboard-/.test(location.pathname) || window.innerWidth > 900 || document.getElementById("elaraInstallBar")) return;
        var bar = document.createElement("div");
        bar.id = "elaraInstallBar"; bar.className = "elara-install-bar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Install Elara");
        bar.innerHTML = '<img src="icons/icon-192.png" alt=""><span></span>' + (withButton ? '<button type="button" data-i="go">Install</button>' : "") + '<button type="button" data-i="x" aria-label="Not now">&times;</button>';
        bar.querySelector("span").textContent = text;
        document.body.appendChild(bar);
        bar.addEventListener("click", function (e) {
            var b = e.target.closest("[data-i]"); if (!b) return;
            if (b.dataset.i === "go") window.ElaraInstall.prompt();
            try { localStorage.setItem(KEY, String(Date.now())); } catch (x) { /* ignore */ }
            bar.remove();
        });
    }
    document.addEventListener("elara:installable", function () { setTimeout(function () { banner("Add Elara to your home screen for the full app.", true); }, 4000); });
    if (isIOS && !standalone) window.addEventListener("load", function () { setTimeout(function () { banner("Install Elara: tap Share, then \u201cAdd to Home Screen\u201d.", false); }, 4000); });
})();
