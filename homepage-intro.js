/* plays the intro once per browser session, then shows the homepage */
(function () {
    var intro = document.getElementById("intro-screen"), homepage = document.getElementById("homepage");
    if (!homepage) return;
    var played = false;
    try { played = !!sessionStorage.getItem("introPlayed"); sessionStorage.setItem("introPlayed", "true"); } catch (e) { /* private mode */ }
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!intro || played || reduce) { if (intro) intro.remove(); homepage.style.opacity = "1"; return; }
    setTimeout(function () {
        intro.style.opacity = "0"; homepage.style.opacity = "1";
        setTimeout(function () { intro.remove(); }, 1200);
    }, 4200);
})();
