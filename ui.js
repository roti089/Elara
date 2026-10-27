/* switches between the Sign In and Sign Up panels (desktop buttons and the mobile links) */
(function () {
    var container = document.getElementById("container");
    if (!container) return;
    function showSignup(on) { container.classList.toggle("active", on); }
    var reg = document.getElementById("show-register"), log = document.getElementById("show-login");
    if (reg) reg.addEventListener("click", function () { showSignup(true); });
    if (log) log.addEventListener("click", function () { showSignup(false); });
    document.querySelectorAll(".link-switch").forEach(function (b) {
        b.addEventListener("click", function () { showSignup(b.dataset.show === "signup"); window.scrollTo({ top: 0, behavior: "smooth" }); });
    });
    if (/[?&]signup=1/.test(location.search)) showSignup(true);
})();
