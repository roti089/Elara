import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* ==========================================================
   ELARA LOGIN / SIGN UP
   After a successful login the person is taken to THEIR dashboard.
========================================================== */

const supabaseUrl = "https://shyvyrvxashetxnmosnd.supabase.co";
const supabaseKey = "sb_publishable_8G0vG3r2UW8Sx-ltfWQazQ_l2oWS3NX";

const supabase = createClient(supabaseUrl, supabaseKey);

/* Where things live (this file is in /Interface, the dashboards are in /pages) */
const DASHBOARD = new URL("dashboard-content.html", window.location.href).href;
const LOGIN_PAGE = new URL("Loginpage.html", window.location.href).href;

const $ = (id) => document.getElementById(id);


/* ---------------- toasts ---------------- */

function showSuccess(message) {
    if (typeof Toastify === "undefined") return console.log(message);
    Toastify({
        text: "✔ " + message, duration: 3000, gravity: "top", position: "center", close: true, stopOnFocus: true,
        style: { background: "linear-gradient(to right, #3F79F8, #69B9FF)", borderRadius: "12px" }
    }).showToast();
}

function showError(message) {
    if (typeof Toastify === "undefined") return console.error(message);
    Toastify({
        text: "✖ " + message, duration: 4500, gravity: "top", position: "right", close: true, stopOnFocus: true,
        style: { background: "linear-gradient(to right, #ff416c, #ff4b2b)", borderRadius: "12px" }
    }).showToast();
}

function friendly(message) {
    const m = String(message || "").toLowerCase();
    if (m.includes("invalid login")) return "Incorrect email or password.";
    if (m.includes("email not confirmed")) return "Please confirm your email first. Check your inbox.";
    if (m.includes("already registered")) return "An account with this email already exists. Try signing in.";
    if (m.includes("password should be")) return "Your password must be at least 6 characters.";
    if (m.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
    if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "That sign-in method isn't switched on yet in Supabase.";
    return message;
}

function goToDashboard(delay = 900) {
    setTimeout(() => { window.location.href = DASHBOARD; }, delay);
}

/* disables a form's button while we wait, so nobody double-submits */
function busy(form, on, label) {
    const btn = form.querySelector("button[type=submit], button:not([type])");
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}


/* ---------------- what did the address bar bring us? (read it before Supabase cleans it) ---------------- */

const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const isInvite = hashParams.get("type") === "invite";
const linkError = hashParams.get("error_description");   // e.g. expired confirmation / reset / invitation link

if (linkError) {
    const text = linkError;   // URLSearchParams has already decoded it
    showError(/expired|invalid/i.test(text) ? "That link has expired or was already used. Please request a new one." : text);
}

/* an invited person has just clicked the link in their email: they are logged in but have no password yet */
async function handleInvite() {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return showError("That invitation link has expired. Ask for a new invitation.");

    const who = data.session.user.user_metadata?.full_name || "";
    openModal({
        title: who ? `Welcome, ${who.split(" ")[0]}!` : "Welcome to Elara!",
        text: "Choose a password for your new account.",
        fields: [{ type: "password", id: "invite-password", placeholder: "Password (6+ characters)" }],
        button: "Save & continue",
        noCancel: true,
        onSubmit: async () => {
            const password = $("invite-password").value;
            if (password.length < 6) { showError("Your password must be at least 6 characters."); return false; }
            const { error } = await supabase.auth.updateUser({ password });
            if (error) { showError(friendly(error.message)); return false; }
            showSuccess("All set! Taking you to your dashboard...");
            goToDashboard();
            return true;
        }
    });
}



/* ---------------- two-factor: ask for the authenticator code when it is switched on ---------------- */

async function needsMfa() {
    try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        return !error && !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
    } catch (e) { return false; }
}

/* resolves true once the code is right, false if they cancel */
function promptMfa() {
    return new Promise((resolve) => {
        openModal({
            title: "Two-step verification",
            text: "Open your authenticator app and enter the 6-digit code for Elara.",
            fields: [{ type: "text", id: "mfa-code", placeholder: "123456" }],
            button: "Verify",
            onCancel: () => resolve(false),
            onSubmit: async () => {
                const code = $("mfa-code").value.replace(/\s/g, "");
                if (!/^\d{6}$/.test(code)) { showError("Enter the 6-digit code."); return false; }
                const { data: fl, error: fe } = await supabase.auth.mfa.listFactors();
                const factor = fl?.totp?.[0];
                if (fe || !factor) { showError("No authenticator is set up on this account."); return false; }
                const ch = await supabase.auth.mfa.challenge({ factorId: factor.id });
                if (ch.error) { showError(friendly(ch.error.message)); return false; }
                const v = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code });
                if (v.error) { showError("That code is not correct. Try the newest one."); return false; }
                resolve(true);
                return true;
            }
        });
        const input = $("mfa-code");
        if (input) { input.setAttribute("inputmode", "numeric"); input.setAttribute("autocomplete", "one-time-code"); input.setAttribute("maxlength", "7"); }
    });
}

/* true = they may continue; false = they cancelled and were signed out */
async function passMfaGate() {
    if (!(await needsMfa())) return true;
    if (await promptMfa()) return true;
    await supabase.auth.signOut();
    showError("Sign-in cancelled.");
    return false;
}

/* ---------------- already logged in? go straight to the dashboard ---------------- */

async function checkSession() {
    // arriving from an invitation email: ask them to choose a password first
    if (isInvite) return handleInvite();
    // arriving from a "reset password" email: let the person set a new password instead
    if (hashParams.get("type") === "recovery") return;
    if (new URLSearchParams(window.location.search).has("stay")) return;

    const { data, error } = await supabase.auth.getSession();
    if (error) return console.log("Session error:", error.message);

    if (data?.session?.user) {
        console.log("Already logged in:", data.session.user.email);
        if (!(await passMfaGate())) return;

        // the dashboard just sent them here because it found no valid session: show the form, don't bounce back (prevents a redirect loop)
        const bounced = Number(sessionStorage.getItem("elaraBounced") || 0);
        if (Date.now() - bounced < 8000) return;

        window.location.replace(DASHBOARD);
    }
}

checkSession();


/* ---------------- sign up ---------------- */

$("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;

    const name = $("signup-name").value.trim();
    const email = $("signup-email").value.trim();
    const password = $("signup-password").value;

    if (!name || !email || !password) return showError("Please fill in your name, email and password.");
    if (password.length < 6) return showError("Your password must be at least 6 characters.");

    busy(form, true, "Creating...");
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: name },
            emailRedirectTo: LOGIN_PAGE          // the confirmation link brings them back here, then on to the dashboard
        }
    });
    busy(form, false);

    if (error) return showError(friendly(error.message));

    // Supabase hides "this email already exists" by returning a user with no identities
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return showError("An account with this email already exists. Try signing in.");
    }

    form.reset();

    if (data?.session) {
        // email confirmation is switched off in Supabase: they are already logged in
        showSuccess("Account created! Taking you to your dashboard...");
        return goToDashboard();
    }

    // email confirmation is on: they must click the link first, so show the sign-in side
    showSuccess("Account created! Please confirm your email, then sign in.");
    $("container").classList.remove("active");
    $("signin-email").value = email;
});


/* ---------------- sign in ---------------- */

$("signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;

    const email = $("signin-email").value.trim();
    const password = $("signin-password").value;

    if (!email || !password) return showError("Please enter your email and password.");

    busy(form, true, "Signing in...");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        busy(form, false);
        return showError(friendly(error.message));
    }

    console.log("Logged in:", data.user.email);
    if (!(await passMfaGate())) { busy(form, false); return; }
    showSuccess("Welcome back!");
    goToDashboard();
});


/* ---------------- forgot password ---------------- */

function openModal({ title, text, fields, button, onSubmit, noCancel, onCancel }) {
    const old = $("authModal"); if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.id = "authModal";
    overlay.className = "auth-modal";
    overlay.innerHTML =
        `<form class="auth-box"><h2>${title}</h2><p>${text}</p>` +
        fields.map((f) => `<input type="${f.type}" id="${f.id}" placeholder="${f.placeholder}" value="${f.value || ""}" required>`).join("") +
        `<div class="auth-actions">${noCancel ? "" : '<button type="button" class="hidden" data-close>Cancel</button>'}<button type="submit">${button}</button></div></form>`;
    document.body.appendChild(overlay);
    overlay.querySelector("input").focus();

    overlay.addEventListener("click", (ev) => { if ((ev.target === overlay && !noCancel) || ev.target.closest("[data-close]")) { overlay.remove(); if (onCancel) onCancel(); } });
    overlay.querySelector("form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const btn = ev.currentTarget.querySelector("button[type=submit]");
        btn.disabled = true;
        const ok = await onSubmit(overlay);
        btn.disabled = false;
        if (ok) overlay.remove();
    });
}

$("forgot-link").addEventListener("click", (e) => {
    e.preventDefault();
    openModal({
        title: "Reset your password",
        text: "Enter your email and we'll send you a link to choose a new password.",
        fields: [{ type: "email", id: "reset-email", placeholder: "Email", value: $("signin-email").value.trim() }],
        button: "Send link",
        onSubmit: async () => {
            const email = $("reset-email").value.trim();
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: LOGIN_PAGE });
            if (error) { showError(friendly(error.message)); return false; }
            showSuccess("If that email has an account, a reset link is on its way.");
            return true;
        }
    });
});

/* the reset link brings the person back here: ask for the new password */
supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth Event:", event);
    if (session?.user) console.log("Current User:", session.user.email);

    if (event === "PASSWORD_RECOVERY") {
        openModal({
            title: "Choose a new password",
            text: "Use at least 6 characters.",
            fields: [{ type: "password", id: "new-password", placeholder: "New password" }],
            button: "Save password",
            onSubmit: async () => {
                const password = $("new-password").value;
                if (password.length < 6) { showError("Your password must be at least 6 characters."); return false; }
                const { error } = await supabase.auth.updateUser({ password });
                if (error) { showError(friendly(error.message)); return false; }
                showSuccess("Password updated! Taking you to your dashboard...");
                goToDashboard();
                return true;
            }
        });
    }
});


/* ---------------- logout (used by other pages if needed) ---------------- */

async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) return console.log(error.message);
    window.location.href = LOGIN_PAGE;
}
window.logout = logout;


/* ---------------- social sign-in ---------------- */

const providers = [
    { provider: "google", ids: ["signupGoogleBtn", "signinGoogleBtn"] },
    { provider: "github", ids: ["signupGithubBtn", "signinGithubBtn"] },
    { provider: "facebook", ids: ["signupFacebookBtn", "signinFacebookBtn"] },
    { provider: "linkedin_oidc", ids: ["signupLinkedinBtn", "signinLinkedinBtn"] }
];

providers.forEach(({ provider, ids }) => {
    ids.forEach((id) => {
        $(id).addEventListener("click", async (e) => {
            e.preventDefault();
            sessionStorage.removeItem("elaraBounced");      // they are choosing to log in: never block the redirect afterwards
            // Come back to THIS page: it reads the login details from the address and then forwards to the dashboard
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: { redirectTo: LOGIN_PAGE }
            });
            if (error) showError(friendly(error.message));
        });
    });
});
