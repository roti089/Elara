// ==========================================================
// ELARA SETTINGS JAVASCRIPT
// ==========================================================

console.log("Elara Settings JS Loaded!");


// ==========================================================
// SETTINGS NAVIGATION
// ==========================================================

const settingsNavItems = document.querySelectorAll(".settings-nav-item");
const settingsSections = document.querySelectorAll(".settings-section");

console.log("Navigation buttons found:", settingsNavItems.length);
console.log("Settings sections found:", settingsSections.length);


settingsNavItems.forEach(button => {

    button.addEventListener("click", function () {

        const sectionName = this.dataset.section;

        console.log("Opening settings section:", sectionName);


        // Remove active from all navigation buttons
        settingsNavItems.forEach(item => {
            item.classList.remove("active");
        });


        // Remove active from all sections
        settingsSections.forEach(section => {
            section.classList.remove("active");
        });


        // Activate clicked navigation button
        this.classList.add("active");


        // Find corresponding section
        const targetSection = document.getElementById(sectionName);


        if (targetSection) {

            targetSection.classList.add("active");

            console.log("Section activated:", sectionName);

        } else {

            console.error(
                "Could not find settings section:",
                sectionName
            );

        }

    });

});


// ==========================================================
// TOAST SYSTEM
// ==========================================================

const toastContainer = document.getElementById("toastContainer");


function showToast(message, type = "success") {

    if (!toastContainer) {
        console.error("Toast container not found!");
        return;
    }


    const toast = document.createElement("div");

    toast.className = "toast";


    let icon = "fa-check";

    if (type === "error") {
        icon = "fa-xmark";
    }

    if (type === "warning") {
        icon = "fa-triangle-exclamation";
    }


    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;


    toastContainer.appendChild(toast);


    setTimeout(() => {

        toast.style.opacity = "0";
        toast.style.transform = "translateX(30px)";

        setTimeout(() => {
            toast.remove();
        }, 350);

    }, 3000);

}



/* ==========================================================
   PROFILE SETTINGS — PER AUTHENTICATED USER
========================================================== */

function getSettingsUser() {
    return window.ElaraData && window.ElaraData.user
        ? window.ElaraData.user
        : null;
}

function profileStorageKey(key) {
    const user = getSettingsUser();
    return user && user.id ? key + ":" + user.id : key;
}

const saveProfile = document.getElementById("saveProfile");

if (saveProfile) {
    saveProfile.addEventListener("click", function () {
        const firstName = document.getElementById("firstName")?.value.trim() || "";
        const lastName = document.getElementById("lastName")?.value.trim() || "";
        const email = document.getElementById("email")?.value.trim() || "";
        const phone = document.getElementById("phone")?.value.trim() || "";

        if (!firstName) {
            showToast("Please enter your first name.", "error");
            return;
        }

        const user = getSettingsUser();

        if (!user) {
            showToast("Please log in before saving your profile.", "error");
            return;
        }

        try {
            localStorage.setItem(profileStorageKey("elaraFirstName"), firstName);
            localStorage.setItem(profileStorageKey("elaraLastName"), lastName);
            localStorage.setItem(profileStorageKey("elaraEmail"), email);
            localStorage.setItem(profileStorageKey("elaraPhone"), phone);

            if (window.ElaraCommon) {
                window.ElaraCommon.applyProfile();
            }

            showToast("Profile changes saved!");
        } catch (err) {
            showToast("Could not save your profile changes.", "error");
        }
    });
}

function loadProfileData() {
    const user = getSettingsUser();

    const firstName = user
        ? localStorage.getItem(profileStorageKey("elaraFirstName")) ||
          user.first ||
          (user.name ? user.name.split(/\s+/)[0] : "")
        : "";

    const lastName = localStorage.getItem(profileStorageKey("elaraLastName")) || "";
    const email = user?.email ||
        localStorage.getItem(profileStorageKey("elaraEmail")) || "";
    const phone = localStorage.getItem(profileStorageKey("elaraPhone")) || "";

    const fields = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        phone: phone
    };

    Object.entries(fields).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
    });

    const profileName = document.getElementById("profileName");
    if (profileName && firstName) {
        profileName.textContent = firstName;
    }
}

loadProfileData();


// ==========================================================
// HOME SETTINGS
// ==========================================================

const saveHome =
    document.getElementById("saveHome");

/* look a place up by name (free Open-Meteo geocoding, no key needed) */
async function findPlace(text) {
    const parts = text.split(",").map(s => s.trim()).filter(Boolean);
    const url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(parts[0]) + "&count=8&language=en&format=json";
    const res = await fetch(url);
    if (!res.ok) throw new Error("lookup failed");
    const list = (await res.json()).results || [];
    if (!list.length) return null;
    const hint = (parts[1] || "").toLowerCase();
    const best = (hint && list.find(r => (r.country || "").toLowerCase().includes(hint) || (r.admin1 || "").toLowerCase().includes(hint) || (r.country_code || "").toLowerCase() === hint)) || list[0];
    return {
        lat: best.latitude, lon: best.longitude, city: best.name, timezone: best.timezone,
        label: [best.name, best.admin1, best.country].filter((v, i, a) => v && a.indexOf(v) === i).join(", ")
    };
}

function ensureTimezoneOption(tz) {
    const select = document.getElementById("timezone");
    if (!select || !tz) return;
    if (!Array.from(select.options).some(o => o.value === tz)) {
        const o = document.createElement("option"); o.value = tz; o.textContent = tz.replace("_", " "); select.appendChild(o);
    }
}

if (saveHome) {

    saveHome.addEventListener("click", async function () {

        const homeName = document.getElementById("homeName")?.value.trim();
        const homeLocation = document.getElementById("homeLocation")?.value.trim();
        let timezone = document.getElementById("timezone")?.value;
        const temperatureUnit = document.getElementById("temperatureUnit")?.value;
        const previousLocation = localStorage.getItem("elaraHomeLocation") || "";

        saveHome.disabled = true;
        const originalText = saveHome.textContent;
        saveHome.textContent = "Saving...";

        let place = null, lookupFailed = false;
        if (homeLocation) {
            try { place = await findPlace(homeLocation); } catch (e) { lookupFailed = true; }
        }

        if (place) {
            // a NEW location also tells us the timezone
            if (place.timezone && homeLocation !== previousLocation) {
                ensureTimezoneOption(place.timezone);
                timezone = place.timezone;
                document.getElementById("timezone").value = timezone;
            }
            localStorage.setItem("elaraHomeCoords", JSON.stringify({ lat: place.lat, lon: place.lon, city: place.city, label: place.label, tz: place.timezone }));
        } else {
            localStorage.removeItem("elaraHomeCoords");
        }

        localStorage.setItem("elaraHomeName", homeName);
        localStorage.setItem("elaraHomeLocation", homeLocation);
        localStorage.setItem("elaraTimezone", timezone);
        localStorage.setItem("elaraTemperatureUnit", temperatureUnit);
        try { sessionStorage.removeItem("elaraWeather"); } catch (e) { /* ignore */ }

        if (window.ElaraCommon) ElaraCommon.applyHome();
        if (window.ElaraData) ElaraData.log("updated the home settings", "fa-house");

        saveHome.disabled = false;
        saveHome.textContent = originalText;

        if (place) showToast("Saved. Weather and time now follow " + place.label + ".");
        else if (homeLocation && lookupFailed) showToast("Saved, but I couldn't look up that place (no connection).", "warning");
        else if (homeLocation) showToast("Saved, but I couldn't find \u201c" + homeLocation + "\u201d. Try \u201cCity, Country\u201d.", "warning");
        else showToast("Home settings saved!");
    });
}

// ==========================================================
// LOAD HOME SETTINGS
// ==========================================================

function loadHomeSettings() {

    const homeName =
        localStorage.getItem("elaraHomeName");

    const homeLocation =
        localStorage.getItem("elaraHomeLocation");

    const timezone =
        localStorage.getItem("elaraTimezone");

    const temperatureUnit =
        localStorage.getItem("elaraTemperatureUnit");


    if (homeName) {

        const input =
            document.getElementById("homeName");

        if (input) {
            input.value = homeName;
        }

    }


    if (homeLocation) {

        const input =
            document.getElementById("homeLocation");

        if (input) {
            input.value = homeLocation;
        }

    }


    if (timezone) {

        const select =
            document.getElementById("timezone");

        if (select) {
            select.value = timezone;
        }

    }


    if (temperatureUnit) {

        const select =
            document.getElementById("temperatureUnit");

        if (select) {
            select.value = temperatureUnit;
        }

    }

}


loadHomeSettings();


// ==========================================================
// SETTINGS SWITCHES
// ==========================================================

const settingSwitches = document.querySelectorAll(
    '.settings-section input[type="checkbox"]'
);


settingSwitches.forEach(toggle => {

    const savedValue =
        localStorage.getItem(toggle.id);


    // Load saved state
    if (savedValue !== null) {

        toggle.checked =
            savedValue === "true";

    }


    // Save when changed
    toggle.addEventListener("change", function () {

        localStorage.setItem(
            this.id,
            this.checked
        );


        console.log(
            this.id,
            "is now",
            this.checked
        );


        let settingName =
            this.id
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, str => str.toUpperCase());


        showToast(
            `${settingName} ${this.checked ? "enabled" : "disabled"}`
        );

    });

});



/* ==========================================================
   PROFILE IMAGE — PER AUTHENTICATED USER
========================================================== */

const changeProfileImage = document.getElementById("changeProfileImage");
const profileImage = document.getElementById("profileImage");

function loadUserProfileImage() {
    const user = getSettingsUser();

    if (!profileImage || !user || !user.id) return;

    const savedImage = localStorage.getItem(
        "elaraProfileImage:" + user.id
    );

    if (window.ElaraCommon) window.ElaraCommon.applyProfile();
}

if (changeProfileImage && profileImage) {
    changeProfileImage.addEventListener("click", function () {
        const user = getSettingsUser();

        if (!user || !user.id) {
            showToast("Please log in before changing your picture.", "error");
            return;
        }

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";

        fileInput.addEventListener("change", function () {
            const file = this.files && this.files[0];
            if (!file) return;

            if (!file.type.startsWith("image/")) {
                showToast("Please choose an image file.", "error");
                return;
            }

            // Any size is fine: the picture is shrunk to a small square before saving
            if (file.size > 25 * 1024 * 1024) {
                showToast("That file is too big. Please choose a photo under 25 MB.", "warning");
                return;
            }

            const reader = new FileReader();

            reader.onload = function (event) {
                const original = new Image();

                original.onload = function () {
                    // Centre-crop to a square and scale down to 256 x 256 (about 20-40 KB)
                    const SIZE = 256;
                    const side = Math.min(original.width, original.height);
                    const sx = (original.width - side) / 2;
                    const sy = (original.height - side) / 2;

                    const canvas = document.createElement("canvas");
                    canvas.width = SIZE;
                    canvas.height = SIZE;
                    const ctx = canvas.getContext("2d");
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, SIZE, SIZE);
                    ctx.drawImage(original, sx, sy, side, side, 0, 0, SIZE, SIZE);

                    let imageData = canvas.toDataURL("image/jpeg", 0.85);
                    if (imageData.length > 150000) {
                        imageData = canvas.toDataURL("image/jpeg", 0.6);
                    }

                    try {
                        localStorage.setItem("elaraProfileImage:" + user.id, imageData);

                        profileImage.src = imageData;

                        if (window.ElaraCommon) {
                            window.ElaraCommon.applyProfile();
                        }

                        showToast("Profile picture updated!");
                    } catch (err) {
                        showToast(
                            "Your browser storage is full. Clear some old Elara data and try again.",
                            "error"
                        );
                    }
                };

                original.onerror = function () {
                    showToast("That image format isn't supported. Please use a JPG or PNG.", "error");
                };

                original.src = event.target.result;
            };

            reader.onerror = function () {
                showToast("Could not read that image.", "error");
            };

            reader.readAsDataURL(file);
        });

        fileInput.click();
    });
}

loadUserProfileImage();


// ==========================================================
// PASSWORD MODAL
// ==========================================================

const passwordModal =
    document.getElementById("passwordModal");

const changePasswordBtn =
    document.getElementById("changePasswordBtn");

const closePasswordModal =
    document.getElementById("closePasswordModal");

const cancelPassword =
    document.getElementById("cancelPassword");

const savePassword =
    document.getElementById("savePassword");


function openPasswordModal() {

    if (passwordModal) {

        passwordModal.classList.add("active");

    }

}


function closePasswordWindow() {

    if (passwordModal) {

        passwordModal.classList.remove("active");

    }

}


if (changePasswordBtn) {

    changePasswordBtn.addEventListener(
        "click",
        openPasswordModal
    );

}


if (closePasswordModal) {

    closePasswordModal.addEventListener(
        "click",
        closePasswordWindow
    );

}


if (cancelPassword) {

    cancelPassword.addEventListener(
        "click",
        closePasswordWindow
    );

}


// Close modal when clicking outside
if (passwordModal) {

    passwordModal.addEventListener(
        "click",
        function (event) {

            if (event.target === passwordModal) {

                closePasswordWindow();

            }

        }
    );

}


// ==========================================================
// SECURITY (real: Supabase password, authenticator-app 2FA, sign-in history)
// ==========================================================

const D_ = window.ElaraData;

async function authClient() {
    if (!D_ || !D_.user) throw new Error("Please log in first.");
    return await D_.getClient();
}
function hasPasswordLogin() {
    const p = D_ && D_.info && D_.info.providers;
    return !p || p.indexOf("email") > -1;
}
function friendlyAuthError(msg) {
    const m = String(msg || "").toLowerCase();
    if (m.includes("same password") || m.includes("different from the old")) return "Your new password must be different from the old one.";
    if (m.includes("at least")) return "Your new password is too short.";
    if (m.includes("reauth") || m.includes("recent")) return "For safety, please log out and back in, then try again.";
    return msg || "Something went wrong.";
}

/* ---------------- change password ---------------- */

if (savePassword) {

    // people who signed in with Google/GitHub have no password to check
    if (changePasswordBtn) changePasswordBtn.addEventListener("click", function () {
        const cur = document.getElementById("currentPassword");
        if (cur && cur.parentElement) cur.parentElement.style.display = hasPasswordLogin() ? "" : "none";
    });

    savePassword.addEventListener("click", async function () {

        const currentPassword = document.getElementById("currentPassword")?.value || "";
        const newPassword = document.getElementById("newPassword")?.value || "";
        const confirmPassword = document.getElementById("confirmPassword")?.value || "";

        if (hasPasswordLogin() && !currentPassword) return showToast("Please enter your current password.", "error");
        if (newPassword.length < 8) return showToast("Your new password must be at least 8 characters.", "error");
        if (newPassword !== confirmPassword) return showToast("The two new passwords don't match.", "error");
        if (hasPasswordLogin() && newPassword === currentPassword) return showToast("Your new password must be different from the old one.", "error");

        const label = savePassword.textContent;
        savePassword.disabled = true; savePassword.textContent = "Saving...";
        try {
            const client = await authClient();

            if (hasPasswordLogin()) {
                // prove it's really them: the current password must be right
                const { error: bad } = await client.auth.signInWithPassword({ email: D_.user.email, password: currentPassword });
                if (bad) throw new Error("Your current password is incorrect.");
            }
            const { error } = await client.auth.updateUser({ password: newPassword });
            if (error) throw error;

            ["currentPassword", "newPassword", "confirmPassword"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
            closePasswordWindow();
            D_.log("changed the account password", "fa-key");
            showToast("Password updated.");
        } catch (err) {
            showToast(friendlyAuthError(err.message), "error");
        } finally {
            savePassword.disabled = false; savePassword.textContent = label;
        }
    });
}

/* ---------------- shared little dialog for the next two features ---------------- */

function euiDialog(innerHTML) {
    const old = document.getElementById("secDialog"); if (old) old.remove();
    const ov = document.createElement("div");
    ov.id = "secDialog"; ov.className = "eui-overlay";
    ov.innerHTML = '<div class="eui-box sec-box">' + innerHTML + '</div>';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("show"));
    return ov;
}
function askCode({ title, text, qr, secret, button }) {
    return new Promise((resolve) => {
        const ov = euiDialog(
            '<div class="eui-icon info"><i class="fa-solid fa-shield-halved"></i></div><h3>' + title + '</h3><p>' + text + '</p>' +
            (qr ? '<img class="sec-qr" src="' + qr + '" alt="QR code">' : "") +
            (secret ? '<p class="sec-secret">Can\'t scan? Enter this key: <code>' + secret + '</code></p>' : "") +
            '<input class="sec-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456">' +
            '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-act="no">Cancel</button><button type="button" class="eui-btn primary" data-act="ok">' + button + '</button></div>');
        const input = ov.querySelector(".sec-code"); input.focus();
        const finish = (v) => { ov.classList.remove("show"); setTimeout(() => ov.remove(), 180); resolve(v); };
        const submit = () => { const c = input.value.replace(/\s/g, ""); if (!/^\d{6}$/.test(c)) { input.classList.add("bad"); return showToast("Enter the 6-digit code.", "error"); } finish(c); };
        ov.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (e.target === ov || (b && b.dataset.act === "no")) finish(null); else if (b) submit(); });
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") finish(null); });
    });
}
async function verifyCode(mfa, factorId, code) {
    const ch = await mfa.challenge({ factorId });
    if (ch.error) throw ch.error;
    const v = await mfa.verify({ factorId, challengeId: ch.data.id, code });
    if (v.error) throw new Error("That code was wrong. Use the newest code from your app.");
}
const quiet = () => { const e = new Error("cancelled"); e.silent = true; return e; };

/* ---------------- two-factor authentication (authenticator app) ---------------- */

const twoFactor = document.getElementById("twoFactor");
let mfaFactorId = null;

async function refreshMfa() {
    try {
        const { data } = await (await authClient()).auth.mfa.listFactors();
        const f = (data?.totp || []).find(x => x.status === "verified");
        mfaFactorId = f ? f.id : null;
        if (twoFactor) twoFactor.checked = !!f;
    } catch (e) { /* not logged in or offline: leave it */ }
}

async function enableMfa() {
    const mfa = (await authClient()).auth.mfa;
    // throw away any half-finished earlier attempt
    const all = (await mfa.listFactors()).data?.all || [];
    for (const f of all) if (f.factor_type === "totp" && f.status !== "verified") await mfa.unenroll({ factorId: f.id });

    const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName: "Elara " + new Date().toISOString().slice(0, 10) });
    if (error) throw error;

    const code = await askCode({
        title: "Set up two-factor authentication",
        text: "Scan this QR code with Google Authenticator, Authy or 1Password, then type the 6-digit code it shows.",
        qr: data.totp.qr_code, secret: data.totp.secret, button: "Turn on"
    });
    if (!code) { await mfa.unenroll({ factorId: data.id }); throw quiet(); }
    try { await verifyCode(mfa, data.id, code); }
    catch (e) { await mfa.unenroll({ factorId: data.id }); throw e; }

    D_.log("turned on two-factor authentication", "fa-shield-halved");
    showToast("Two-factor authentication is on. You'll need a code each time you log in.");
}

async function disableMfa() {
    const mfa = (await authClient()).auth.mfa;
    if (!mfaFactorId) await refreshMfa();
    if (!mfaFactorId) return;
    const ok = await ElaraUI.confirm({ title: "Turn off two-factor authentication?", message: "Your account will be protected by your password alone.", confirmText: "Turn off" });
    if (!ok) throw quiet();
    // Supabase wants a fresh code before it lets you remove the factor
    const code = await askCode({ title: "Confirm it's you", text: "Enter the current 6-digit code from your authenticator app.", button: "Turn off" });
    if (!code) throw quiet();
    await verifyCode(mfa, mfaFactorId, code);
    const { error } = await mfa.unenroll({ factorId: mfaFactorId });
    if (error) throw error;
    D_.log("turned off two-factor authentication", "fa-shield-halved");
    showToast("Two-factor authentication is off.", "warning");
}

if (twoFactor) {
    refreshMfa();
    twoFactor.addEventListener("change", async function () {
        const wantOn = this.checked;
        this.disabled = true;
        try { if (wantOn) await enableMfa(); else await disableMfa(); }
        catch (err) { if (!err.silent) showToast(friendlyAuthError(err.message), "error"); }
        finally { this.disabled = false; await refreshMfa(); }
    });
}

/* ---------------- login activity (real sign-ins) ---------------- */

const loginActivityBtn = document.getElementById("loginActivityBtn");
if (loginActivityBtn) {
    loginActivityBtn.addEventListener("click", function () {
        const tz = window.ElaraCommon ? ElaraCommon.tz() : undefined;
        const fmt = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: tz });
        const icon = (d) => /Android|iOS/.test(d) ? "fa-mobile-screen" : "fa-laptop";
        const method = (m) => ({ email: "Email & password", google: "Google", github: "GitHub", facebook: "Facebook", linkedin_oidc: "LinkedIn" }[m] || m);
        const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

        const list = D_ ? D_.util.load("elaraLoginActivity", []) : [];
        const info = D_ && D_.info;
        const rows = list.length ? list.map((e, i) =>
            '<div class="sec-row"><div class="sec-ic"><i class="fa-solid ' + icon(e.device) + '"></i></div>' +
            '<div class="sec-tx"><strong>' + esc(e.device) + (i === 0 ? ' <em>This device</em>' : "") + '</strong><small>' + esc(fmt(e.t)) + ' \u2022 ' + esc(method(e.method)) + '</small></div></div>'
        ).join("") : '<p class="sec-empty">Sign-ins will be listed here from now on.</p>';

        const facts = info ? '<div class="sec-facts">' +
            (info.created ? '<span>Account created <strong>' + esc(fmt(info.created)) + '</strong></span>' : "") +
            (info.lastSignIn ? '<span>Last sign-in <strong>' + esc(fmt(info.lastSignIn)) + '</strong></span>' : "") +
            '<span>Signed in with <strong>' + esc(method(info.provider)) + '</strong></span></div>' : "";

        const ov = euiDialog(
            '<div class="eui-icon info"><i class="fa-solid fa-clock-rotate-left"></i></div><h3>Login activity</h3><p>Recent sign-ins to your account.</p>' +
            facts + '<div class="sec-list">' + rows + '</div>' +
            '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-act="close">Close</button>' +
            '<button type="button" class="eui-btn danger" data-act="others">Sign out other devices</button></div>');

        ov.addEventListener("click", async (e) => {
            const b = e.target.closest("[data-act]");
            if (e.target === ov || (b && b.dataset.act === "close")) { ov.classList.remove("show"); setTimeout(() => ov.remove(), 180); return; }
            if (b && b.dataset.act === "others") {
                const ok = await ElaraUI.confirm({ title: "Sign out other devices?", message: "Every other browser and phone signed in to your account will be logged out. This device stays signed in.", confirmText: "Sign them out" });
                if (!ok) return;
                try {
                    const { error } = await (await authClient()).auth.signOut({ scope: "others" });
                    if (error) throw error;
                    D_.log("signed out all other devices", "fa-right-from-bracket");
                    showToast("All other devices were signed out.");
                } catch (err) { showToast(friendlyAuthError(err.message), "error"); }
            }
        });
    });
}

// ==========================================================
// DELETE HOME
// ==========================================================

const deleteHomeBtn =
    document.getElementById("deleteHomeBtn");


if (deleteHomeBtn) {

    deleteHomeBtn.addEventListener(
        "click",
        function () {

            ElaraUI.confirm({
                title: "Delete this home?",
                message: "This permanently erases your tasks, events, members, devices, warranties and settings. Your account stays.",
                confirmText: "Delete everything"
            }).then(function (ok) {
                if (!ok) return;
                const done = function () {
                    ElaraUI.toast("Your home data was deleted.", "info");
                    setTimeout(function () { window.location.reload(); }, 900);
                };
                if (window.ElaraData) ElaraData.resetData().then(done, done); else done();
            });

        }
    );

}


// ==========================================================
// APPEARANCE SETTINGS
// ==========================================================

const themeOptions =
    document.querySelectorAll(".theme-option");

console.log(
    "Theme buttons found:",
    themeOptions.length
);


themeOptions.forEach(option => {

    option.addEventListener("click", function () {

        const theme = this.dataset.theme;

        console.log("Theme selected:", theme);


        // Remove active from all themes
        themeOptions.forEach(item => {
            item.classList.remove("active");
        });


        // Activate selected theme
        this.classList.add("active");


        // Save theme
        localStorage.setItem(
            "elaraTheme",
            theme
        );


        // Apply theme
        applyTheme(theme);


        showToast(
            `${theme.charAt(0).toUpperCase() + theme.slice(1)} theme selected.`
        );

    });

});


function applyTheme(theme) {

    console.log("Applying theme:", theme);


    if (theme === "light") {

        document.body.classList.add(
            "light-theme"
        );

    }

    else if (theme === "dark") {

        document.body.classList.remove(
            "light-theme"
        );

    }

    else if (theme === "system") {

        const prefersLight =
            window.matchMedia(
                "(prefers-color-scheme: light)"
            ).matches;


        document.body.classList.toggle(
            "light-theme",
            prefersLight
        );

    }

}


// Load saved theme

const savedTheme =
    localStorage.getItem("elaraTheme") || "dark";


themeOptions.forEach(option => {

    option.classList.toggle(
        "active",
        option.dataset.theme === savedTheme
    );

});


applyTheme(savedTheme);

// ==========================================================
// SETTINGS SEARCH
// ==========================================================

const settingsSearch =
    document.getElementById("settingsSearch");


if (settingsSearch) {

    settingsSearch.addEventListener(
        "input",
        function () {

            const searchTerm =
                this.value
                    .toLowerCase()
                    .trim();


            if (!searchTerm) {

                settingsNavItems.forEach(item => {

                    item.style.display = "flex";

                });

                return;

            }


            settingsNavItems.forEach(item => {

                const text =
                    item.textContent
                        .toLowerCase();


                if (text.includes(searchTerm)) {

                    item.style.display = "flex";

                } else {

                    item.style.display = "none";

                }

            });

        }
    );

}


// ==========================================================
// TOP NOTIFICATION BUTTON
// ==========================================================

const notificationBtn =
    document.getElementById("notificationBtn");


if (notificationBtn) {

    notificationBtn.addEventListener(
        "click",
        function () {

            showToast(
                "You have no new notifications."
            );

        }
    );

}


// ==========================================================
// LOGOUT
// ==========================================================

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {

    logoutBtn.addEventListener(
        "click",
        function () {

            const confirmed = confirm(
                "Are you sure you want to logout?"
            );

            if (!confirmed) {
                return;
            }

            localStorage.removeItem(
                "elaraFirstName"
            );

            window.location.href =
                "../Interface/Loginpage.html";

        }
    );

}


// ==========================================================
// KEYBOARD SHORTCUT
// ESC = CLOSE MODAL
// ==========================================================

document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Escape" &&
            passwordModal &&
            passwordModal.classList.contains("active")
        ) {

            closePasswordWindow();

        }

    }
);


console.log(
    "Elara Settings JavaScript initialized successfully."
);



// ==========================================================
// HOME NAME DEFAULT (per person)
// ==========================================================
(function () {
    const input = document.getElementById("homeName");
    if (!input || localStorage.getItem("elaraHomeName")) return;
    const first = window.ElaraCommon ? ElaraCommon.getName("") : "";
    if (first) input.value = first + "'s Home";
})();


// ==========================================================
// NOTIFICATION SWITCHES (real: saved, applied, push permission)
// ==========================================================
(function () {
    const N = window.ElaraNotify;
    if (!N) return;

    const map = {
        pushNotifications: "push",
        securityNotifications: "security",
        energyNotifications: "energy",
        taskNotifications: "tasks"
    };
    const labels = { push: "Push notifications", security: "Security alerts", energy: "Energy alerts", tasks: "Task reminders" };
    const saved = N.prefs();

    Object.keys(map).forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        const key = map[id];

        // show the real saved state (push also needs the browser's permission)
        el.checked = key === "push"
            ? (saved.push && "Notification" in window && Notification.permission === "granted")
            : saved[key];

        el.addEventListener("change", async function () {
            if (key === "push" && this.checked) {
                if (!("Notification" in window)) {
                    this.checked = false;
                    return showToast("This browser doesn't support notifications.", "error");
                }
                let permission = Notification.permission;
                if (permission === "default") permission = await Notification.requestPermission();
                if (permission !== "granted") {
                    this.checked = false;
                    N.setPref("push", false);
                    return showToast(permission === "denied"
                        ? "Notifications are blocked. Allow them in your browser's site settings, then try again."
                        : "Permission wasn't granted.", "error");
                }
                N.setPref("push", true);
                N.test();
                return;
            }
            N.setPref(key, this.checked);
            showToast(labels[key] + (this.checked ? " turned on." : " turned off."), this.checked ? "success" : "warning");
        });
    });
})();
