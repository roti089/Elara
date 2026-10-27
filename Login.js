import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

/* ==========================================================
   ELARA LOGIN / SIGN UP
   Settings come from elara-config.js (one place for the Supabase keys).
   After a successful login the person goes to the dashboard.
========================================================== */

const cfg = window.ELARA_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

const DASHBOARD = new URL(cfg.dashboardPage || "dashboard-content.html", window.location.href).href;
const LOGIN_PAGE = new URL(cfg.loginPage || "Loginpage.html", window.location.href).href;
const $ = (id) => document.getElementById(id);

/* the same rules as Settings > Change password */
const PASSWORD_RULE = "Your password must be 8 to 72 characters with at least one letter and one number.";
function passwordProblem(p) { return p.length < 8 || p.length > 72 || !/[A-Za-z]/.test(p) || !/[0-9]/.test(p) ? PASSWORD_RULE : null; }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------------- toasts ---------------- */
function toast(message, ok) {
    if (typeof Toastify === "undefined") { (ok ? console.log : console.error)(message); return; }
    Toastify({
        text: (ok ? "✔ " : "✖ ") + message, duration: ok ? 3000 : 4500, gravity: "top", position: ok ? "center" : "right", close: true, stopOnFocus: true,
        style: { background: ok ? "linear-gradient(to right, #3F79F8, #69B9FF)" : "linear-gradient(to right, #ff416c, #ff4b2b)", borderRadius: "12px" }
    }).showToast();
}
const showSuccess = (m) => toast(m, true);
const showError = (m) => toast(m, false);

function friendly(message) {
    const m = String(message || "").toLowerCase();
    if (m.includes("invalid login")) return "Incorrect email or password.";
    if (m.includes("email not confirmed")) return "Please confirm your email first. Check your inbox.";
    if (m.includes("already registered")) return "An account with this email already exists. Try signing in.";
    if (m.includes("password should be") || m.includes("weak")) return PASSWORD_RULE;
    if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
    if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "That sign-in method isn't switched on yet in Supabase.";
    if (m.includes("failed to fetch")) return "Can't reach the server. Check your internet connection.";
    return message || "Something went wrong.";
}
function goToDashboard(delay = 900) { setTimeout(() => { window.location.href = DASHBOARD; }, delay); }
function busy(form, on, label) {
    const btn = form.querySelector("button[type=submit]");
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
function mark(input, bad) { input.classList.toggle("invalid", !!bad); if (bad) input.focus(); }

/* ---------------- small dialog (built with textContent: nothing from outside is turned into HTML) ---------------- */
function openModal({ title, text, fields, button, onSubmit, noCancel, onCancel }) {
    const old = $("authModal"); if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.id = "authModal"; overlay.className = "auth-modal";
    const form = document.createElement("form");
    form.className = "auth-box"; form.noValidate = true;
    form.setAttribute("role", "dialog"); form.setAttribute("aria-modal", "true");
    const h = document.createElement("h2"); h.textContent = title;
    const p = document.createElement("p"); p.textContent = text;
    form.append(h, p);
    fields.forEach((f) => {
        const i = document.createElement("input");
        i.type = f.type; i.id = f.id; i.placeholder = f.placeholder || ""; i.value = f.value || "";
        i.setAttribute("aria-label", f.placeholder || f.id);
        if (f.autocomplete) i.autocomplete = f.autocomplete;
        if (f.maxlength) i.maxLength = f.maxlength;
        form.appendChild(i);
    });
    const err = document.createElement("p"); err.className = "auth-err"; err.setAttribute("aria-live", "assertive");
    const actions = document.createElement("div"); actions.className = "auth-actions";
    if (!noCancel) { const c = document.createElement("button"); c.type = "button"; c.className = "hidden"; c.dataset.close = "1"; c.textContent = "Cancel"; actions.appendChild(c); }
    const ok = document.createElement("button"); ok.type = "submit"; ok.textContent = button; actions.appendChild(ok);
    form.append(err, actions);
    overlay.appendChild(form);
    document.body.appendChild(overlay);
    form.querySelector("input").focus();

    const close = () => { overlay.remove(); if (onCancel) onCancel(); };
    overlay.addEventListener("click", (ev) => { if ((ev.target === overlay && !noCancel) || ev.target.closest("[data-close]")) close(); });
    overlay.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !noCancel) close(); });
    form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        err.textContent = ""; ok.disabled = true;
        let done = false;
        try { done = await onSubmit((m) => { err.textContent = m; }); } catch (e) { err.textContent = friendly(e.message); }
        ok.disabled = false;
        if (done) overlay.remove();
    });
}

/* ---------------- what did the address bar bring us? (read it before Supabase cleans it) ---------------- */
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const linkType = hashParams.get("type");
const linkError = hashParams.get("error_description");
if (linkError) showError(/expired|invalid/i.test(linkError) ? "That link has expired or was already used. Please request a new one." : linkError);

function askNewPassword(title, text) {
    openModal({
        title, text,
        fields: [{ type: "password", id: "new-password", placeholder: "New password", autocomplete: "new-password", maxlength: 72 },
                 { type: "password", id: "new-password2", placeholder: "Repeat the password", autocomplete: "new-password", maxlength: 72 }],
        button: "Save & continue",
        noCancel: true,
        onSubmit: async (fail) => {
            const password = $("new-password").value, again = $("new-password2").value;
            const problem = passwordProblem(password);
            if (problem) { fail(problem); return false; }
            if (password !== again) { fail("The two passwords don't match."); return false; }
            const { error } = await supabase.auth.updateUser({ password });
            if (error) { fail(friendly(error.message)); return false; }
            showSuccess("All set! Taking you to your dashboard...");
            goToDashboard();
            return true;
        }
    });
}

/* an invited person clicked the link in their email: they are logged in but have no password yet */
async function handleInvite() {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return showError("That invitation link has expired. Ask the home owner to send it again.");
    const who = String(data.session.user.user_metadata?.full_name || "").trim().split(/\s+/)[0].slice(0, 40);
    askNewPassword(who ? "Welcome, " + who + "!" : "Welcome to Elara!", "Choose a password for your account. You'll join the home that invited you.");
}

/* ---------------- two-factor ---------------- */
async function needsMfa() {
    try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        return !error && !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
    } catch (e) { return false; }
}
function promptMfa() {
    return new Promise((resolve) => {
        openModal({
            title: "Two-step verification",
            text: "Open your authenticator app and enter the 6-digit code for Elara.",
            fields: [{ type: "text", id: "mfa-code", placeholder: "123456", autocomplete: "one-time-code", maxlength: 7 }],
            button: "Verify",
            onCancel: () => resolve(false),
            onSubmit: async (fail) => {
                const code = $("mfa-code").value.replace(/\s/g, "");
                if (!/^\d{6}$/.test(code)) { fail("Enter the 6-digit code."); return false; }
                const { data: fl, error: fe } = await supabase.auth.mfa.listFactors();
                const factor = (fl?.totp || []).find((f) => f.status === "verified");
                if (fe || !factor) { fail("No authenticator is set up on this account."); return false; }
                const ch = await supabase.auth.mfa.challenge({ factorId: factor.id });
                if (ch.error) { fail(friendly(ch.error.message)); return false; }
                const v = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code });
                if (v.error) { fail("That code is not correct. Try the newest one."); return false; }
                resolve(true);
                return true;
            }
        });
        const input = $("mfa-code"); if (input) input.setAttribute("inputmode", "numeric");
    });
}
async function passMfaGate() {
    if (!(await needsMfa())) return true;
    if (await promptMfa()) return true;
    await supabase.auth.signOut();
    showError("Sign-in cancelled.");
    return false;
}

/* ---------------- already logged in? go straight to the dashboard ---------------- */
async function checkSession() {
    if (linkType === "invite") return handleInvite();
    if (linkType === "recovery") return;                       // handled by PASSWORD_RECOVERY below
    if (new URLSearchParams(window.location.search).has("stay")) return;
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user) return;
    if (!(await passMfaGate())) return;
    const bounced = Number(sessionStorage.getItem("elaraBounced") || 0);   // the dashboard just sent them here: don't loop
    if (Date.now() - bounced < 8000) return;
    window.location.replace(DASHBOARD);
}
checkSession();

/* ---------------- sign up ---------------- */
$("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const nameEl = $("signup-name"), emailEl = $("signup-email"), passEl = $("signup-password");
    const name = nameEl.value.trim().replace(/\s+/g, " "), email = emailEl.value.trim().toLowerCase(), password = passEl.value;
    [nameEl, emailEl, passEl].forEach((i) => mark(i, false));

    if (name.length < 2 || name.length > 60 || !/^[\p{L}][\p{L}\p{M}' .-]*$/u.test(name)) { mark(nameEl, true); return showError("Please enter your name (2 to 60 letters)."); }
    if (!EMAIL_RE.test(email) || email.length > 120) { mark(emailEl, true); return showError("Please enter a valid email address."); }
    const problem = passwordProblem(password);
    if (problem) { mark(passEl, true); return showError(problem); }

    busy(form, true, "Creating...");
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: LOGIN_PAGE } });
    busy(form, false);
    if (error) return showError(friendly(error.message));
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return showError("An account with this email already exists. Try signing in.");

    form.reset();
    if (data?.session) { showSuccess("Account created! Taking you to your dashboard..."); return goToDashboard(); }
    showSuccess("Account created! Please confirm your email, then sign in.");
    $("container").classList.remove("active");
    $("signin-email").value = email;
});

/* ---------------- sign in ---------------- */
$("signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const emailEl = $("signin-email"), passEl = $("signin-password");
    const email = emailEl.value.trim().toLowerCase(), password = passEl.value;
    mark(emailEl, false); mark(passEl, false);
    if (!EMAIL_RE.test(email)) { mark(emailEl, true); return showError("Please enter a valid email address."); }
    if (!password) { mark(passEl, true); return showError("Please enter your password."); }

    busy(form, true, "Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { busy(form, false); return showError(friendly(error.message)); }
    sessionStorage.removeItem("elaraBounced");
    if (!(await passMfaGate())) { busy(form, false); return; }
    showSuccess("Welcome back!");
    goToDashboard();
});

/* ---------------- forgot password ---------------- */
$("forgot-link").addEventListener("click", (e) => {
    e.preventDefault();
    openModal({
        title: "Reset your password",
        text: "Enter your email and we'll send you a link to choose a new password.",
        fields: [{ type: "email", id: "reset-email", placeholder: "Email", value: $("signin-email").value.trim(), autocomplete: "email", maxlength: 120 }],
        button: "Send link",
        onSubmit: async (fail) => {
            const email = $("reset-email").value.trim().toLowerCase();
            if (!EMAIL_RE.test(email)) { fail("Please enter a valid email address."); return false; }
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: LOGIN_PAGE });
            if (error) { fail(friendly(error.message)); return false; }
            showSuccess("If that email has an account, a reset link is on its way.");
            return true;
        }
    });
});
supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") askNewPassword("Choose a new password", "At least 8 characters, with a letter and a number.");
});

/* ---------------- social sign-in (only the buttons that exist on the page) ---------------- */
[
    { provider: "google", ids: ["signupGoogleBtn", "signinGoogleBtn"] },
    { provider: "github", ids: ["signupGithubBtn", "signinGithubBtn"] },
    { provider: "linkedin_oidc", ids: ["signupLinkedinBtn", "signinLinkedinBtn"] }
].forEach(({ provider, ids }) => ids.forEach((id) => {
    const btn = $(id);
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
        e.preventDefault();
        sessionStorage.removeItem("elaraBounced");
        const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: LOGIN_PAGE } });
        if (error) showError(friendly(error.message));
    });
}));
