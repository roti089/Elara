/* ==========================================================
            ELARA SETTINGS
   Personal (just you): profile, location, notifications, voice, security, theme
   Home (owner changes, everyone sees): name, place, time zone, units,
   electricity price, automations, backups
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI, C = window.ElaraCommon || {}, N = window.ElaraNotify || {}, cfg = window.ELARA_CONFIG || {};
    if (!D) return;
    window.ElaraPageLive = true;

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function json(k, f) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } }
    function isOwner() { return D.household.isOwner; }
    function toast(m, t) { UI.toast(m, t === "warning" ? "info" : t); }

    /* ---------------- section navigation ---------------- */
    function show(id) {
        if (!$(id)) return;
        document.querySelectorAll(".settings-nav-item").forEach(function (b) { b.classList.toggle("active", b.dataset.section === id); });
        document.querySelectorAll(".settings-section").forEach(function (s) { s.classList.toggle("active", s.id === id); });
    }
    document.querySelectorAll(".settings-nav-item").forEach(function (b) {
        b.addEventListener("click", function () { show(b.dataset.section); history.replaceState(null, "", "#" + b.dataset.section); });
    });
    if (location.hash) show(location.hash.slice(1));
    window.addEventListener("hashchange", function () { show(location.hash.slice(1)); });

    /* owner-only controls */
    function applyRole() {
        var owner = isOwner();
        document.querySelectorAll("[data-owner]").forEach(function (el) { el.disabled = !owner; });
        document.querySelectorAll(".owner-note").forEach(function (el) { el.hidden = owner; });
        document.querySelectorAll(".owner-only").forEach(function (el) { el.style.display = owner ? "" : "none"; });
        document.querySelectorAll(".member-only").forEach(function (el) { el.style.display = owner || !D.user ? "none" : ""; });
        ["backupNow", "downloadBackup", "restoreFile"].forEach(function (id) { if ($(id)) $(id).disabled = !owner; });
        var rf = $("restoreFile"); if (rf) rf.closest("label").classList.toggle("disabled", !owner);
    }

    /* ---------------- profile ---------------- */
    function loadProfile() {
        var m = D.me();
        $("firstName").value = get("elaraFirstName") || m.first || "";
        $("lastName").value = get("elaraLastName") || "";
        $("email").value = (D.user && D.user.email) || m.email || "";
        $("phone").value = get("elaraPhone") || "";
        $("profileName").textContent = m.name || "Your Profile";
        var img = get("elaraProfileImage");
        $("profileImage").src = img || "Elara logo.png";
        $("removeProfileImage").hidden = !img;
    }
    var NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
    $("profileForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var first = $("firstName").value.trim().replace(/\s+/g, " "), last = $("lastName").value.trim().replace(/\s+/g, " "), phone = $("phone").value.trim();
        var err = null, digits = phone.replace(/[\s()-]/g, "");
        if (first.length < 2 || first.length > 40 || !NAME_RE.test(first)) err = "Your first name must be 2 to 40 letters (spaces, hyphens and apostrophes are fine).";
        else if (last && (last.length > 40 || !NAME_RE.test(last))) err = "Your last name can only contain letters, spaces, hyphens and apostrophes.";
        else if (phone && !/^\+?[0-9]{10,15}$/.test(digits)) err = "Enter a phone number with 10 to 15 digits, for example +27 82 123 4567.";
        $("profileError").textContent = err || "";
        if (err) return;
        set("elaraFirstName", first); set("elaraLastName", last);
        if (phone) set("elaraPhone", digits); else localStorage.removeItem("elaraPhone");
        D.members.saveProfile();
        if (C.applyProfile) C.applyProfile();
        loadProfile();
        toast("Profile saved.");
    });
    $("changeProfileImage").addEventListener("click", function () {
        var input = document.createElement("input");
        input.type = "file"; input.accept = "image/jpeg,image/png,image/webp,image/gif";
        input.addEventListener("change", function () {
            var file = input.files && input.files[0]; if (!file) return;
            if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return toast("Please choose a JPG, PNG, WebP or GIF picture.", "error");
            if (file.size > 25 * 1024 * 1024) return toast("That file is too big. Please choose a photo under 25 MB.", "error");
            var reader = new FileReader();
            reader.onload = function () {
                var img = new Image();
                img.onload = function () {
                    var S = 256, side = Math.min(img.width, img.height), cv = document.createElement("canvas");
                    cv.width = cv.height = S;
                    var ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, S, S);
                    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
                    var data = cv.toDataURL("image/jpeg", 0.85); if (data.length > 150000) data = cv.toDataURL("image/jpeg", 0.6);
                    if (!set("elaraProfileImage", data)) return toast("Your browser storage is full.", "error");
                    D.members.saveProfile(); if (C.applyProfile) C.applyProfile(); loadProfile();
                    toast("Profile picture updated. Everyone in your home will see it.");
                };
                img.onerror = function () { toast("That picture couldn't be opened. Try a JPG or PNG.", "error"); };
                img.src = reader.result;
            };
            reader.onerror = function () { toast("Could not read that picture.", "error"); };
            reader.readAsDataURL(file);
        });
        input.click();
    });
    $("removeProfileImage").addEventListener("click", function () {
        localStorage.removeItem("elaraProfileImage"); D.members.saveProfile(); if (C.applyProfile) C.applyProfile(); loadProfile(); toast("Picture removed.");
    });

    /* ---------------- home ---------------- */
    function ensureTz(tz) {
        var sel = $("timezone");
        if (tz && !Array.prototype.some.call(sel.options, function (o) { return o.value === tz; })) { var o = document.createElement("option"); o.value = tz; o.textContent = tz.replace(/_/g, " "); sel.appendChild(o); }
    }
    function loadHome() {
        $("homeName").value = get("elaraHomeName") || "";
        $("homeLocation").value = get("elaraHomeLocation") || "";
        var tz = get("elaraTimezone") || (C.tz ? C.tz() : "Africa/Johannesburg"); ensureTz(tz); $("timezone").value = tz;
        $("temperatureUnit").value = get("elaraTemperatureUnit") === "fahrenheit" ? "fahrenheit" : "celsius";
        $("tariff").value = D.energy.tariff().toFixed(2);
    }
    function findPlace(text) {
        var parts = text.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        return fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(parts[0]) + "&count=8&language=en&format=json")
            .then(function (r) { if (!r.ok) throw new Error("lookup failed"); return r.json(); })
            .then(function (j) {
                var list = j.results || []; if (!list.length) return null;
                var hint = (parts[1] || "").toLowerCase();
                var best = (hint && list.filter(function (r) { return (r.country || "").toLowerCase().indexOf(hint) > -1 || (r.admin1 || "").toLowerCase().indexOf(hint) > -1 || (r.country_code || "").toLowerCase() === hint; })[0]) || list[0];
                return { lat: best.latitude, lon: best.longitude, city: best.name, tz: best.timezone, label: [best.name, best.admin1, best.country].filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join(", ") };
            });
    }
    $("homeForm").addEventListener("submit", function (e) {
        e.preventDefault();
        if (!isOwner()) return toast("Only the home owner can change the home settings.", "error");
        var name = $("homeName").value.trim(), loc = $("homeLocation").value.trim(), tz = $("timezone").value, unit = $("temperatureUnit").value, tariff = Number($("tariff").value), err = null;
        if (name && (name.length < 2 || name.length > 40 || /[<>]/.test(name))) err = "The home name must be 2 to 40 characters, without < or >.";
        else if (loc && (loc.length < 2 || loc.length > 80 || /[<>]/.test(loc))) err = "Enter the location as “City, Country”.";
        else if (!(tariff >= 0.1 && tariff <= 20)) err = "The electricity price must be between R0.10 and R20 per kWh.";
        else { try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch (x) { err = "Choose a valid time zone."; } }
        $("homeError").textContent = err || "";
        if (err) return;
        var btn = $("saveHome"); btn.disabled = true;
        var prev = get("elaraHomeLocation") || "";
        (loc && loc !== prev ? findPlace(loc).catch(function () { return undefined; }) : Promise.resolve(null)).then(function (place) {
            if (place) { set("elaraHomeCoords", JSON.stringify({ lat: place.lat, lon: place.lon, city: place.city, label: place.label, tz: place.tz })); if (place.tz) { ensureTz(place.tz); tz = place.tz; $("timezone").value = tz; } }
            else if (!loc) localStorage.removeItem("elaraHomeCoords");
            set("elaraHomeName", name); set("elaraHomeLocation", loc); set("elaraTimezone", tz); set("elaraTemperatureUnit", unit); set("elaraTariff", String(tariff));
            try { sessionStorage.removeItem("elaraWeather"); } catch (x) { /* ignore */ }
            if (C.applyHome) C.applyHome();
            D.log("updated the home settings", "fa-house");
            if (place) toast("Saved. Weather and time now follow " + place.label + ".");
            else if (place === undefined) toast("Saved, but the place couldn't be looked up right now.", "warning");
            else if (loc && loc !== prev) toast("Saved, but “" + loc + "” wasn't found. Try “City, Country”.", "warning");
            else toast("Home settings saved.");
        }).then(function () { btn.disabled = !isOwner(); });
    });

    /* ---------------- location (asks first) ---------------- */
    function loadLocation() {
        var consent = get("elaraLocationConsent"), loc = json("elaraMyLocation", null);
        $("locationConsent").checked = consent === "granted";
        $("locationNow").textContent = consent === "granted" && loc ? (loc.label || "Shared") + " • updated " + D.ago(loc.t || Date.now()) : consent === "denied" ? "You chose not to share your location" : "Not shared";
        $("refreshLocation").disabled = consent !== "granted";
    }
    function askLocation(asHome) {
        if (!C.requestLocation) return Promise.reject(new Error("Location isn't available."));
        return C.requestLocation({ asHome: asHome }).then(function (loc) { loadLocation(); loadHome(); return loc; });
    }
    $("locationConsent").addEventListener("change", function () {
        var box = this;
        if (box.checked) {
            UI.confirm({ title: "Share your location with Elara?", message: "It's used for local weather, sunrise and sunset for your lights, and your home's time zone. It's only read when needed.", confirmText: "Allow", cancelText: "Cancel", icon: "fa-location-dot", danger: false })
                .then(function (ok) {
                    if (!ok) { box.checked = false; return; }
                    askLocation(false).then(function (loc) { toast("Location saved: " + loc.label + "."); }).catch(function (err) { box.checked = false; loadLocation(); toast(err.message, "error"); });
                });
        } else {
            set("elaraLocationConsent", "denied"); localStorage.removeItem("elaraMyLocation"); loadLocation(); toast("Elara won't use your location.", "info");
        }
    });
    $("refreshLocation").addEventListener("click", function () { askLocation(false).then(function (l) { toast("Location updated: " + l.label + "."); }).catch(function (e) { toast(e.message, "error"); }); });
    $("useAsHome").addEventListener("click", function () {
        if (!isOwner()) return;
        askLocation(true).then(function (l) { D.log("set the home location to " + l.label, "fa-location-dot"); toast("Home location set to " + l.label + "."); }).catch(function (e) { toast(e.message, "error"); });
    });


    /* ---------------- export data (CSV) ---------------- */
    function F() { return window.ElaraFeatures; }
    function hhmm(d) { return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes(); }
    function personName(id, fb) { var p = id && D.members.find(id); return p ? p.name : (fb || ""); }
    function dl(name, head, rows) {
        if (!rows.length) return toast("There's nothing to export yet.", "info");
        F().csv("elara-" + name + "-" + D.util.dayKey() + ".csv", head, rows);
        toast(rows.length + " row" + (rows.length === 1 ? "" : "s") + " downloaded.");
    }
    function exportEnergy(btn) {
        if (!(D.can("smartHome") || D.can("analytics") || D.can("reports"))) return toast("You can't see this home's energy.", "error");
        var days = Number($("exportRange").value) || 30, byDay = $("exportGroup").value === "day", tariff = D.energy.tariff();
        var names = {}; D.devices.everything().forEach(function (d) { if (d.tuyaId) names[d.tuyaId] = d; });
        function build(rows) {
            var out;
            if (byDay) {
                var agg = {};
                rows.forEach(function (r) { var k = D.util.dayKey(new Date(r.h)) + "|" + r.d; agg[k] = agg[k] || { day: D.util.dayKey(new Date(r.h)), d: r.d, k: 0, p: 0 }; agg[k].k += r.k; agg[k].p = Math.max(agg[k].p, r.p); });
                out = Object.keys(agg).sort().map(function (k) { var a = agg[k], dv = names[a.d] || {}; return [a.day, dv.name || a.d, dv.room || "", a.k.toFixed(3), Math.round(a.p), (a.k * tariff).toFixed(2)]; });
                return dl("energy-daily", ["Date", "Device", "Room", "kWh", "Highest watts", "Cost (R)"], out);
            }
            out = rows.slice().sort(function (a, b) { return a.h - b.h || String(a.d).localeCompare(b.d); }).map(function (r) {
                var d = new Date(r.h), dv = names[r.d] || {};
                return [D.util.dayKey(d), hhmm(d), dv.name || r.d, dv.room || "", r.k.toFixed(4), Math.round(r.p), (r.k * tariff).toFixed(2)];
            });
            dl("energy-hourly", ["Date", "Hour", "Device", "Room", "kWh", "Highest watts", "Cost (R)"], out);
        }
        if (!D.user || !cfg.supabaseUrl) return build(D.energy.rows());
        btn.disabled = true; btn.textContent = "Preparing...";
        var since = new Date(Date.now() - days * 86400000).toISOString(), all = [], owner = D.household.ownerId || D.user.id;
        D.getClient().then(function (c) {
            function page(from) {
                return c.from("elara_energy").select("device,hour,kwh,peak_w").eq("owner_id", owner).gte("hour", since).order("hour").range(from, from + 999).then(function (r) {
                    if (r.error) throw r.error;
                    all = all.concat(r.data || []);
                    return (r.data || []).length === 1000 && from < 200000 ? page(from + 1000) : null;
                });
            }
            return page(0);
        }).then(function () {
            build(all.map(function (x) { return { d: x.device, h: new Date(x.hour).getTime(), k: Number(x.kwh) || 0, p: Number(x.peak_w) || 0 }; }));
        }).catch(function (e) { toast("Couldn't get the energy history: " + e.message, "error"); })
          .then(function () { btn.disabled = false; btn.textContent = "Download"; });
    }
    document.querySelectorAll("[data-export]").forEach(function (b) {
        b.addEventListener("click", function () {
            if (!F()) return;
            var what = b.dataset.export, load = D.util.load;
            if (what === "energy") return exportEnergy(b);
            if (what === "shopping") {
                if (!D.can("shopping")) return toast("You can't see Shopping in this home.", "error");
                var cart = load("elaraCartItems", []), rows = [];
                load("elaraShoppingItems", []).filter(function (i) { return !cart.some(function (c) { return c.id === i.id; }); }).forEach(function (i) {
                    rows.push(["On the list", "", i.name, i.details || "", i.category || "", i.qty || 1, i.price || "", i.price ? (i.price * (i.qty || 1)).toFixed(2) : "", i.byName || "", ""]);
                });
                cart.slice().sort(function (a, b) { return b.addedAt - a.addedAt; }).forEach(function (c) {
                    rows.push(["Bought", D.util.dayKey(new Date(c.addedAt)), c.name, "", c.category || "", c.qty || 1, c.price, (c.price * (c.qty || 1)).toFixed(2), c.byName || personName(c.by), ""]);
                });
                load("elaraPantry", []).filter(function (x) { return !x.usedUp; }).forEach(function (x) {
                    rows.push(["In the house", x.addedAt ? D.util.dayKey(new Date(x.addedAt)) : "", x.name, x.unit || "", x.category || "", x.qty, "", "", x.byName || "", x.expires || ""]);
                });
                return dl("shopping", ["Status", "Date", "Item", "Details / unit", "Category", "Quantity", "Price each (R)", "Total (R)", "Who", "Best before"], rows);
            }
            if (what === "meals") {
                if (!D.can("shopping")) return toast("You can't see Shopping in this home.", "error");
                return dl("meals", ["Date", "Meal", "Dish", "Ingredients", "Planned by"], load("elaraMeals", []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (m) {
                    return [m.date, m.slot, m.name, (m.ingredients || []).map(function (x) { return String(x).split("|")[0]; }).join(", "), m.byName || ""];
                }));
            }
            if (what === "tasks") {
                if (!D.can("tasks")) return toast("You can't see Tasks in this home.", "error");
                return dl("tasks", ["Due date", "Time", "Task", "Assigned to", "Priority", "Status", "Completed by", "Completed on", "Chore points", "Added by"], D.tasks.all().slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).map(function (t) {
                    return [t.date, t.time, t.title, personName(t.assigneeId, t.assignee), t.priority, t.status, t.completedByName || "", t.completedAt ? D.util.dayKey(new Date(t.completedAt)) : "", t.choreId ? (t.points || 1) : "", t.createdByName || ""];
                }));
            }
            if (what === "events") {
                if (!D.can("schedule")) return toast("You can't see the Schedule in this home.", "error");
                return dl("events", ["Date", "Time", "Event", "Category", "Details", "Who"], load("elaraSchedules", []).slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).map(function (e) {
                    return [e.date, e.time || "", e.title, e.category || "", e.description || "", (e.involves || []).map(function (id) { return personName(id); }).filter(Boolean).join(", ")];
                }));
            }
            if (what === "prepaid") {
                if (!D.can("smartHome")) return toast("You can't see Smart Home in this home.", "error");
                return dl("prepaid", ["Date", "Time", "Type", "Units", "Amount (R)", "Who"], F().prepaid.get().entries.slice().sort(function (a, b) { return a.t - b.t; }).map(function (e) {
                    var d = new Date(e.t); return [D.util.dayKey(d), hhmm(d), e.kind === "buy" ? "Bought" : "Meter reading", e.units, e.kind === "buy" ? (e.amount || "") : "", e.byName || ""];
                }));
            }
            if (what === "activity") {
                return dl("activity", ["Date", "Time", "Who", "What"], D.activity(300).map(function (a) { var d = new Date(a.t); return [D.util.dayKey(d), hhmm(d), a.who, a.text]; }));
            }
        });
    });

    /* ---------------- notifications ---------------- */
    var KINDS = ["tasks", "schedule", "shopping", "smartHome", "energy", "members", "security"];
    function loadNotifs() {
        var p = N.prefs ? N.prefs() : {};
        KINDS.forEach(function (k) { if ($("n_" + k)) $("n_" + k).checked = p[k] !== false; });
        if ($("n_daily")) { $("n_daily").checked = p.daily !== false; $("dailyAt").value = p.dailyAt || "07:00"; $("dailyAt").disabled = p.daily === false; }
        var perm = "Notification" in window ? Notification.permission : "unsupported";
        $("pushNotifications").checked = !!p.push && perm === "granted";
        $("pushState").textContent = perm === "unsupported" ? "This browser can't show notifications." : perm === "denied" ? "Blocked in your browser's site settings." :
            !cfg.vapidPublicKey ? "Works while Elara is open. For notifications when it's closed, add the VAPID key (README, step 6)." : p.push && perm === "granted" ? "On for this device." : "";
    }
    KINDS.forEach(function (k) {
        $("n_" + k).addEventListener("change", function () { if (N.setPref) N.setPref(k, this.checked); });
    });
    $("n_daily").addEventListener("change", function () {
        if (N.setPref) N.setPref("daily", this.checked);
        $("dailyAt").disabled = !this.checked;
        toast(this.checked ? "You'll get a morning summary at " + $("dailyAt").value + (cfg.pushEndpoint ? "." : " once push notifications are set up (README, step 6).") : "Morning summary off.", "info");
    });
    $("dailyAt").addEventListener("change", function () {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(this.value)) { this.value = (N.prefs ? N.prefs().dailyAt : "07:00"); return toast("Choose a time for the summary.", "error"); }
        if (N.setPref) N.setPref("dailyAt", this.value);
        toast("Morning summary at " + this.value + ".");
    });
    $("pushNotifications").addEventListener("change", function () {
        var box = this;
        if (!box.checked) { N.setPref("push", false); if (C.disablePush) C.disablePush(); loadNotifs(); return toast("Push notifications are off on this device.", "info"); }
        if (!("Notification" in window)) { box.checked = false; return toast("This browser can't show notifications.", "error"); }
        Notification.requestPermission().then(function (perm) {
            if (perm !== "granted") { box.checked = false; N.setPref("push", false); loadNotifs(); return toast("Notifications were blocked. Allow them in your browser's site settings.", "error"); }
            N.setPref("push", true);
            (C.setupPush ? C.setupPush() : Promise.resolve(false)).then(function (ok) {
                loadNotifs();
                toast(ok ? "Push notifications are on, even when Elara is closed." : "Notifications are on while Elara is open.", "success");
            });
        });
    });
    $("testPush").addEventListener("click", function () {
        var btn = this; btn.disabled = true;
        var local = function () { if (C.notifySystem) C.notifySystem("Elara test", "Notifications work on this device.", "dashboard-settings.html#notifications", "elara-test"); };
        if (cfg.pushEndpoint && D.user) {
            D.callFunction(cfg.pushEndpoint, { action: "test" }).then(function (r) { toast(r && r.delivered ? "Test sent to " + r.delivered + " device(s)." : r && r.push === false ? "Saved to your bell. Pop-ups need the VAPID keys (README, step 6)." : "Test saved to your notifications.", "success"); })
                .catch(function (e) {
                    local();
                    var missing = /failed to fetch|networkerror|load failed|404|not found/i.test(e.message || "") || e.status === 404;
                    var noKeys = /vapid/i.test(e.message || "");
                    UI.confirm({
                        title: missing ? "Push isn't switched on yet" : noKeys ? "Push keys are missing" : "Push didn't work",
                        message: (missing ? "The elara-push function isn't deployed in Supabase, so notifications only show while Elara is open. Deploy it by following README step 6 (it's free)."
                                 : noKeys ? "The elara-push function is deployed, but its VAPID secrets aren't set. See README step 6."
                                 : "The server said: " + e.message + ".") + " A test notification was shown on this device instead.",
                        confirmText: "OK", cancelText: "Close", icon: "fa-bell", danger: false
                    });
                })
                .then(function () { btn.disabled = false; });
        } else { local(); toast("Test shown. (Server push isn't set up, so this only works while Elara is open.)", "info"); btn.disabled = false; }
    });

    /* ---------------- smart home + voice ---------------- */
    function loadSmart() {
        var v = C.voicePrefs ? C.voicePrefs() : { enabled: true, speak: true }, a = C.homeAuto ? C.homeAuto() : { automations: true };
        var hasSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        $("voiceCommands").checked = v.enabled; $("voiceSpeak").checked = v.speak;
        if (!hasSpeech) $("voiceCommands").closest(".setting-item").querySelector("p").textContent = "This browser can't listen (use Chrome, Edge or Safari). You can still type commands to Elara.";
        $("smartAutomations").checked = a.automations;
    }
    function saveVoice() {
        set("elaraVoicePrefs", JSON.stringify({ enabled: $("voiceCommands").checked, speak: $("voiceSpeak").checked }));
        var btn = $("voiceBtn"); if (btn) btn.style.display = $("voiceCommands").checked ? "" : "none";
    }
    $("voiceCommands").addEventListener("change", function () { saveVoice(); toast("Voice commands " + (this.checked ? "on. Press the microphone to talk." : "off."), this.checked ? "success" : "info"); if (this.checked && !$("voiceBtn")) setTimeout(function () { location.reload(); }, 800); });
    $("voiceSpeak").addEventListener("change", function () { saveVoice(); toast("Spoken replies " + (this.checked ? "on." : "off."), "info"); });
    function saveAuto() {
        if (!isOwner()) return;
        set("elaraHomeAutomation", JSON.stringify({ automations: $("smartAutomations").checked }));
        D.log("changed the home automations", "fa-robot");
    }
    $("smartAutomations").addEventListener("change", function () { saveAuto(); toast("Automations " + (this.checked ? "on." : "paused."), "info"); });

    /* ---------------- security ---------------- */
    function hasPasswordLogin() { var p = D.info && D.info.providers; return !p || p.indexOf("email") > -1; }
    function friendlyAuthError(msg) {
        var m = String(msg || "").toLowerCase();
        if (m.indexOf("same password") > -1 || m.indexOf("different from the old") > -1) return "Your new password must be different from the old one.";
        if (m.indexOf("reauth") > -1 || m.indexOf("recent") > -1) return "For safety, please log out and back in, then try again.";
        if (m.indexOf("weak") > -1 || m.indexOf("pwned") > -1) return "That password is too easy to guess. Choose another.";
        return msg || "Something went wrong.";
    }
    function client() { if (!D.user) return Promise.reject(new Error("Please log in first.")); return D.getClient(); }
    var pwModal = $("passwordModal");
    function openPw() {
        if (!D.user) return toast("Log in to change your password.", "error");
        $("passwordForm").reset(); $("passwordError").textContent = "";
        $("currentPwGroup").style.display = hasPasswordLogin() ? "" : "none";
        pwModal.classList.add("active"); setTimeout(function () { (hasPasswordLogin() ? $("currentPassword") : $("newPassword")).focus(); }, 50);
    }
    function closePw() { pwModal.classList.remove("active"); }
    $("changePasswordBtn").addEventListener("click", openPw);
    ["closePasswordModal", "cancelPassword"].forEach(function (id) { $(id).addEventListener("click", closePw); });
    pwModal.addEventListener("click", function (e) { if (e.target === pwModal) closePw(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePw(); });
    $("passwordForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var cur = $("currentPassword").value, nw = $("newPassword").value, cf = $("confirmPassword").value, err = null;
        if (hasPasswordLogin() && !cur) err = "Enter your current password.";
        else if (nw.length < 8 || nw.length > 72) err = "Your new password must be 8 to 72 characters.";
        else if (!/[A-Za-z]/.test(nw) || !/[0-9]/.test(nw)) err = "Your new password needs at least one letter and one number.";
        else if (nw !== cf) err = "The two new passwords don't match.";
        else if (hasPasswordLogin() && nw === cur) err = "Your new password must be different from the old one.";
        $("passwordError").textContent = err || "";
        if (err) return;
        var btn = $("savePassword"); btn.disabled = true; btn.textContent = "Saving...";
        client().then(function (c) {
            var check = hasPasswordLogin() ? c.auth.signInWithPassword({ email: D.user.email, password: cur }).then(function (r) { if (r.error) throw new Error("Your current password is incorrect."); }) : Promise.resolve();
            return check.then(function () { return c.auth.updateUser({ password: nw }); }).then(function (r) { if (r.error) throw r.error; });
        }).then(function () {
            closePw(); D.log("changed the account password", "fa-key");
            D.notify({ to: [D.user.id], kind: "security", title: "Password changed", body: "Your Elara password was changed. If this wasn't you, reset it now.", href: "dashboard-settings.html#security" });
            toast("Password updated.");
        }).catch(function (x) { $("passwordError").textContent = friendlyAuthError(x.message); })
          .then(function () { btn.disabled = false; btn.textContent = "Update Password"; });
    });

    function dialog(inner) {
        var old = $("secDialog"); if (old) old.remove();
        var ov = document.createElement("div"); ov.id = "secDialog"; ov.className = "eui-overlay";
        ov.innerHTML = '<div class="eui-box sec-box" role="dialog" aria-modal="true">' + inner + "</div>";
        document.body.appendChild(ov); requestAnimationFrame(function () { ov.classList.add("show"); });
        return ov;
    }
    function askCode(o) {
        return new Promise(function (resolve) {
            var ov = dialog('<div class="eui-icon info"><i class="fa-solid fa-shield-halved"></i></div><h3>' + esc(o.title) + "</h3><p>" + esc(o.text) + "</p>" +
                (o.qr ? '<img class="sec-qr" src="' + esc(o.qr) + '" alt="QR code">' : "") +
                (o.secret ? '<p class="sec-secret">Can\'t scan? Enter this key: <code>' + esc(o.secret) + "</code></p>" : "") +
                '<input class="sec-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" aria-label="6-digit code"><p class="eui-err"></p>' +
                '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-act="no">Cancel</button><button type="button" class="eui-btn primary" data-act="ok">' + esc(o.button) + "</button></div>");
            var input = ov.querySelector(".sec-code"); input.focus();
            function finish(v) { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); resolve(v); }
            function submit() { var c = input.value.replace(/\s/g, ""); if (!/^\d{6}$/.test(c)) { ov.querySelector(".eui-err").textContent = "Enter the 6-digit code."; return; } finish(c); }
            ov.addEventListener("click", function (e) { var b = e.target.closest("[data-act]"); if (e.target === ov || (b && b.dataset.act === "no")) finish(null); else if (b) submit(); });
            input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); if (e.key === "Escape") finish(null); });
        });
    }
    function verify(mfa, factorId, code) {
        return mfa.challenge({ factorId: factorId }).then(function (ch) {
            if (ch.error) throw ch.error;
            return mfa.verify({ factorId: factorId, challengeId: ch.data.id, code: code });
        }).then(function (v) { if (v.error) throw new Error("That code was wrong. Use the newest code from your app."); });
    }
    function quiet() { var e = new Error("cancelled"); e.silent = true; return e; }
    var factorId = null;
    function refreshMfa() {
        if (!D.user) { $("twoFactor").disabled = true; return Promise.resolve(); }
        return client().then(function (c) { return c.auth.mfa.listFactors(); }).then(function (r) {
            var f = ((r.data && r.data.totp) || []).filter(function (x) { return x.status === "verified"; })[0];
            factorId = f ? f.id : null; $("twoFactor").checked = !!f;
        }).catch(function () {});
    }
    function enableMfa() {
        return client().then(function (c) {
            var mfa = c.auth.mfa;
            return mfa.listFactors().then(function (r) {
                return Promise.all(((r.data && r.data.all) || []).filter(function (f) { return f.factor_type === "totp" && f.status !== "verified"; }).map(function (f) { return mfa.unenroll({ factorId: f.id }); }));
            }).then(function () { return mfa.enroll({ factorType: "totp", friendlyName: "Elara " + new Date().toISOString().slice(0, 10) }); })
              .then(function (r) {
                  if (r.error) throw r.error;
                  var data = r.data;
                  return askCode({ title: "Set up two-factor authentication", text: "Scan this QR code with Google Authenticator, Authy or 1Password, then type the 6-digit code it shows.", qr: data.totp.qr_code, secret: data.totp.secret, button: "Turn on" })
                      .then(function (code) {
                          if (!code) return mfa.unenroll({ factorId: data.id }).then(function () { throw quiet(); });
                          return verify(mfa, data.id, code).catch(function (e) { return mfa.unenroll({ factorId: data.id }).then(function () { throw e; }); });
                      });
              }).then(function () { D.log("turned on two-factor authentication", "fa-shield-halved"); toast("Two-factor authentication is on."); });
        });
    }
    function disableMfa() {
        return client().then(function (c) {
            var mfa = c.auth.mfa;
            if (!factorId) return;
            return UI.confirm({ title: "Turn off two-factor authentication?", message: "Your account will be protected by your password alone.", confirmText: "Turn off" }).then(function (ok) {
                if (!ok) throw quiet();
                return askCode({ title: "Confirm it's you", text: "Enter the current 6-digit code from your authenticator app.", button: "Turn off" });
            }).then(function (code) {
                if (!code) throw quiet();
                return verify(mfa, factorId, code);
            }).then(function () { return mfa.unenroll({ factorId: factorId }); }).then(function (r) {
                if (r.error) throw r.error;
                D.log("turned off two-factor authentication", "fa-shield-halved"); toast("Two-factor authentication is off.", "info");
            });
        });
    }
    $("twoFactor").addEventListener("change", function () {
        var box = this, want = box.checked;
        if (!D.user) { box.checked = false; return toast("Log in to use two-factor authentication.", "error"); }
        box.disabled = true;
        (want ? enableMfa() : disableMfa()).catch(function (e) { if (!e.silent) toast(friendlyAuthError(e.message), "error"); })
            .then(function () { box.disabled = false; return refreshMfa(); });
    });
    $("loginActivityBtn").addEventListener("click", function () {
        var tz = C.tz ? C.tz() : undefined;
        function fmt(t) { return new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: tz }); }
        function method(m) { return { email: "Email & password", google: "Google", github: "GitHub", linkedin_oidc: "LinkedIn" }[m] || m || "Unknown"; }
        var list = D.util.load("elaraLoginActivity", []), info = D.info;
        var rows = list.length ? list.map(function (e, i) {
            return '<div class="sec-row"><div class="sec-ic"><i class="fa-solid ' + (/Android|iOS/.test(e.device) ? "fa-mobile-screen" : "fa-laptop") + '"></i></div><div class="sec-tx"><strong>' + esc(e.device) + (i === 0 ? " <em>This device</em>" : "") + "</strong><small>" + esc(fmt(e.t)) + " • " + esc(method(e.method)) + "</small></div></div>";
        }).join("") : '<p class="sec-empty">Sign-ins will be listed here from now on.</p>';
        var facts = info ? '<div class="sec-facts">' + (info.created ? "<span>Account created <strong>" + esc(fmt(info.created)) + "</strong></span>" : "") + (info.lastSignIn ? "<span>Last sign-in <strong>" + esc(fmt(info.lastSignIn)) + "</strong></span>" : "") + "</div>" : "";
        var ov = dialog('<div class="eui-icon info"><i class="fa-solid fa-clock-rotate-left"></i></div><h3>Login activity</h3><p>Recent sign-ins to your account.</p>' + facts + '<div class="sec-list">' + rows + "</div>" +
            '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-act="close">Close</button>' + (D.user ? '<button type="button" class="eui-btn danger" data-act="others">Sign out other devices</button>' : "") + "</div>");
        ov.addEventListener("click", function (e) {
            var b = e.target.closest("[data-act]");
            if (e.target === ov || (b && b.dataset.act === "close")) { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); return; }
            if (b && b.dataset.act === "others") UI.confirm({ title: "Sign out other devices?", message: "Every other browser and phone signed in to your account will be logged out.", confirmText: "Sign them out" }).then(function (ok) {
                if (!ok) return;
                client().then(function (c) { return c.auth.signOut({ scope: "others" }); }).then(function (r) { if (r && r.error) throw r.error; D.log("signed out all other devices", "fa-right-from-bracket"); toast("All other devices were signed out."); })
                    .catch(function (x) { toast(friendlyAuthError(x.message), "error"); });
            });
        });
    });
    $("logoutHere").addEventListener("click", function () { var l = document.querySelector(".sidebar .logout"); if (l) l.click(); });

    /* ---------------- danger zone ---------------- */
    $("deleteHomeBtn").addEventListener("click", function () {
        if (!isOwner()) return;
        UI.confirm({ title: "Delete this home's data?", message: "Tasks, events, devices, shopping, settings and members will be erased for everyone. A backup is saved first so you can undo this from Backup & Restore.", confirmText: "Delete everything" }).then(function (ok) {
            if (!ok) return;
            var safety = D.user ? D.backup.create("Before deleting the home").catch(function () {}) : Promise.resolve();
            safety.then(function () {
                var links = D.members.all().filter(function (m) { return m.linkId; });
                return Promise.all(links.map(function (m) { return D.household.remove(m.linkId).catch(function () {}); }));
            }).then(function () { return D.resetData(); }).then(function () {
                toast("Your home data was deleted.", "info"); setTimeout(function () { location.href = "dashboard-content.html"; }, 1000);
            }).catch(function (e) { toast(e.message, "error"); });
        });
    });
    $("leaveHomeBtn").addEventListener("click", function () {
        UI.confirm({ title: "Leave this household?", message: "You'll lose access to everything shared in this home. Your account stays.", confirmText: "Leave" }).then(function (ok) {
            if (!ok) return;
            D.household.leave().then(function () { toast("You left the household."); setTimeout(function () { location.href = "dashboard-content.html"; }, 900); }).catch(function (e) { toast(e.message, "error"); });
        });
    });

    /* ---------------- backup & restore ---------------- */
    function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
    function loadBackups() {
        var box = $("backupList");
        if (!isOwner()) { box.innerHTML = ""; return; }
        if (!D.user || !cfg.supabaseUrl) { box.innerHTML = '<p class="muted">Cloud backups need you to be logged in. You can still download a backup file.</p>'; return; }
        box.innerHTML = '<p class="muted">Loading backups...</p>';
        D.backup.list().then(function (list) {
            box.innerHTML = list.length ? list.map(function (b) {
                return '<div class="backup-row" data-id="' + esc(b.id) + '"><div><strong>' + esc(b.label || "Backup") + "</strong><small>" + esc(new Date(b.created_at).toLocaleString()) + " • " + fmtSize(b.size_bytes || 0) + '</small></div><div class="backup-acts"><button type="button" class="secondary-btn" data-b="restore">Restore</button><button type="button" class="secondary-btn" data-b="download" aria-label="Download"><i class="fa-solid fa-download"></i></button><button type="button" class="secondary-btn danger" data-b="delete" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></div></div>';
            }).join("") : '<p class="muted">No backups yet. The first one is made automatically today.</p>';
        }).catch(function (e) { box.innerHTML = '<p class="muted">Couldn’t load backups: ' + esc(e.message) + ". Run elara-setup.sql (README, step 2).</p>"; });
    }
    function download(data, name) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
        a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function restore(data, what) {
        if (!D.backup.valid(data)) return toast("That file isn't an Elara backup.", "error");
        return UI.confirm({ title: "Restore " + what + "?", message: "The home's current data will be replaced for everyone with the backup from " + new Date(data.created).toLocaleString() + ". A backup of the current data is made first.", confirmText: "Restore" }).then(function (ok) {
            if (!ok) return;
            var safety = D.user ? D.backup.create("Before restoring").catch(function () {}) : Promise.resolve();
            return safety.then(function () { return D.backup.restore(data); }).then(function () {
                D.notify({ to: "household", kind: "security", title: "Home data restored", body: D.me().first + " restored a backup from " + new Date(data.created).toLocaleDateString() + ".", href: "dashboard-content.html" });
                toast("Backup restored. Reloading..."); setTimeout(function () { location.reload(); }, 1200);
            });
        }).catch(function (e) { toast(e.message, "error"); });
    }
    $("backupList").addEventListener("click", function (e) {
        var b = e.target.closest("[data-b]"); if (!b || !isOwner()) return;
        var id = b.closest("[data-id]").dataset.id;
        if (b.dataset.b === "delete") return UI.confirm({ title: "Delete this backup?", message: "It can't be recovered.", confirmText: "Delete" }).then(function (ok) { if (ok) D.backup.remove(id).then(loadBackups).catch(function (x) { toast(x.message, "error"); }); });
        b.disabled = true;
        D.backup.get(id).then(function (data) {
            if (b.dataset.b === "download") download(data, "elara-backup-" + new Date(data.created).toISOString().slice(0, 10) + ".json");
            else return restore(data, "this backup");
        }).catch(function (x) { toast(x.message, "error"); }).then(function () { b.disabled = false; });
    });
    $("backupNow").addEventListener("click", function () {
        if (!isOwner()) return;
        if (!D.user) return toast("Log in to save backups in the cloud. You can download a file instead.", "info");
        var btn = this; btn.disabled = true;
        D.backup.create("Manual backup").then(function () { toast("Backup saved."); loadBackups(); }).catch(function (e) { toast("Backup failed: " + e.message, "error"); }).then(function () { btn.disabled = false; });
    });
    $("downloadBackup").addEventListener("click", function () {
        if (!isOwner()) return;
        D.flush().then(function () { download(D.backup.snapshot(), "elara-backup-" + new Date().toISOString().slice(0, 10) + ".json"); toast("Backup file downloaded."); });
    });
    $("restoreFile").addEventListener("change", function () {
        var f = this.files[0]; this.value = "";
        if (!f || !isOwner()) return;
        if (f.size > 20 * 1024 * 1024) return toast("That file is too big to be an Elara backup.", "error");
        var r = new FileReader();
        r.onload = function () { var data; try { data = JSON.parse(r.result); } catch (e) { return toast("That file isn't valid JSON.", "error"); } restore(data, "“" + f.name + "”"); };
        r.readAsText(f);
    });

    /* ---------------- appearance (personal) ---------------- */
    function loadTheme() {
        var t = get("elaraTheme") || "dark";
        document.querySelectorAll(".theme-option").forEach(function (o) { o.classList.toggle("active", o.dataset.theme === t); });
    }
    document.querySelectorAll(".theme-option").forEach(function (o) {
        o.addEventListener("click", function () {
            set("elaraTheme", o.dataset.theme);
            if (C.applyTheme) C.applyTheme(o.dataset.theme);
            loadTheme(); toast(o.dataset.theme.charAt(0).toUpperCase() + o.dataset.theme.slice(1) + " theme applied.");
        });
    });

    /* ---------------- install as an app (phone, tablet or computer) ---------------- */
    function loadInstall() {
        var I = window.ElaraInstall, btn = $("installApp"), hint = $("installHint");
        if (!I || !btn) return;
        btn.hidden = false;
        if (I.installed) { hint.textContent = "Elara is installed on this device. You're using the app."; btn.hidden = true; }
        else if (!I.secure) { hint.textContent = "Installing needs the published https:// address of Elara (README, \u201cPhones\u201d)."; btn.hidden = true; }
        else if (I.canPrompt) { hint.textContent = "Put Elara on your home screen. It opens full screen like a normal app and gets notifications."; }
        else if (I.isIOS) { hint.textContent = "On iPhone or iPad: open Elara in Safari, tap Share, then \u201cAdd to Home Screen\u201d."; btn.hidden = true; }
        else { hint.textContent = "Use your browser menu and choose \u201cInstall app\u201d or \u201cAdd to Home screen\u201d."; btn.hidden = true; }
    }
    $("installApp").addEventListener("click", function () {
        window.ElaraInstall.prompt().then(function (ok) { if (ok) toast("Elara was added to this device."); loadInstall(); });
    });
    document.addEventListener("elara:installable", loadInstall);
    document.addEventListener("elara:installed", loadInstall);

    /* ---------------- settings search ---------------- */
    var s = $("settingsSearch");
    if (s) s.addEventListener("input", function () {
        var q = this.value.toLowerCase().trim(); if (q.length < 2) return;
        var hit = Array.prototype.filter.call(document.querySelectorAll(".settings-section"), function (sec) { return sec.textContent.toLowerCase().indexOf(q) > -1; })[0];
        if (hit) show(hit.id);
    });

    function loadAll() { applyRole(); loadProfile(); loadHome(); loadLocation(); loadNotifs(); loadSmart(); loadTheme(); }
    D.onChange(function (keys) {
        var a = document.activeElement;
        if (a && a.closest && a.closest("form") && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { applyRole(); return; }   // don't overwrite what someone is typing
        loadAll();
    });
    document.addEventListener("elara:location", loadLocation);
    loadAll(); refreshMfa(); loadBackups(); loadInstall();
})();
