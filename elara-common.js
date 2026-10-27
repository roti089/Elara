/* ==========================================================
   ELARA COMMON  (shared by every dashboard page)
   - theme, profile name / photo / role in the top bar
   - access control: hides pages a member may not see, makes "view only" pages read-only
   - themed dialogs and toasts, global search
   - notifications: bell panel, alerts, browser + push notifications
   - voice control (microphone button)
   - asks once for permission to use the device's location
   - runs the Smart Home automations while Elara is open
   Load AFTER elara-data.js, elara-theme.js, elara-assistant.js and BEFORE the page script.
========================================================== */
(function () {
    "use strict";

    /* Make sure the shared stylesheet is loaded even if a page forgot the <link> */
    (function ensureSidebarCss() {
        var script = document.currentScript;
        if (!script || !script.src) return;
        if (document.querySelector('link[href*="elara-sidebar.css"]')) return;
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = script.src.replace(/elara-common\.js.*$/, "elara-sidebar.css");
        document.head.appendChild(link);
    })();

    var D = window.ElaraData;
    var cfg = window.ELARA_CONFIG || {};
    var THEME_KEY = "elaraTheme";
    var PAGE = (location.pathname.split("/").pop() || "dashboard-content.html").toLowerCase();

    function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* ignore */ } }
    function json(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }
    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function todayKey() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function can(area, level) { return !D || D.can(area, level); }

    /* ---------------- THEME (personal) ---------------- */
    function updateIcon() {
        var btn = document.getElementById("themeBtn");
        var icon = btn && btn.querySelector("i");
        if (!icon) return;
        var light = document.body.classList.contains("light-theme");
        icon.classList.toggle("fa-sun", light);
        icon.classList.toggle("fa-moon", !light);
    }
    function applyTheme(theme) {
        var light = theme === "light" || (theme === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
        document.body.classList.toggle("light-theme", light);
        updateIcon();
    }

    /* ---------------- HOME SETTINGS (name, timezone, temperature unit) ---------------- */
    function homeTz() {
        var tz = get("elaraTimezone");
        try { if (tz) { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return tz; } } catch (e) { /* bad zone */ }
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    }
    function homeParts() {
        var f = new Intl.DateTimeFormat("en-GB", { timeZone: homeTz(), hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short", day: "numeric", month: "short" });
        var o = {}; f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
        return { hour: Number(o.hour) % 24, minute: Number(o.minute), text: o.weekday + ", " + o.day + " " + o.month, time: pad(Number(o.hour) % 24) + ":" + o.minute, tz: homeTz() };
    }
    function useFahrenheit() { return get("elaraTemperatureUnit") === "fahrenheit"; }
    function fmtTemp(celsius) {
        var n = Number(celsius);
        return useFahrenheit() ? Math.round(n * 9 / 5 + 32) + "°F" : Math.round(n) + "°C";
    }
    function applyHome() {
        var name = get("elaraHomeName");
        if (name) document.querySelectorAll(".sidebar .logo span").forEach(function (el) { el.textContent = name; el.title = name; });
    }

    /* ---------------- PROFILE (name, picture, role) ---------------- */
    var ROLE_LABELS = { owner: "Home Owner", adult: "Adult", member: "Member", guest: "Guest" };
    function getName(fallback) {
        var n = D ? D.me().first : "";
        return n || (fallback === undefined ? "there" : fallback);
    }
    function getProfileImage() { return get("elaraProfileImage") || ""; }
    function roleLabel() { return ROLE_LABELS[D ? D.access.role : "owner"] || "Member"; }

    function paintAvatar(img, src, initial) {
        var ph = img.previousElementSibling;
        if (ph && !ph.hasAttribute("data-elara-ph")) ph = null;
        if (src) {
            if (ph) ph.remove();
            img.style.display = "";
            img.src = src;
            return;
        }
        var w = img.offsetWidth || parseInt(getComputedStyle(img).width, 10) || 48;
        img.style.display = "none";
        if (!ph) {
            ph = document.createElement("div");
            ph.setAttribute("data-elara-ph", "1");
            img.parentNode.insertBefore(ph, img);
        }
        ph.textContent = initial;
        ph.style.cssText = "width:" + w + "px;height:" + w + "px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;" +
            "font-weight:600;color:#fff;font-size:" + Math.round(w * 0.42) + "px;background:linear-gradient(135deg,#6c63ff,#4a41d6)";
    }
    function applyProfile() {
        var name = getName(""), img = getProfileImage(), initial = (name || "?").charAt(0).toUpperCase();
        document.querySelectorAll(".top-actions .profile img, .topbar .profile img, #profileImage, .large-profile img")
            .forEach(function (el) { paintAvatar(el, img, initial); });
        ["userName", "profileName"].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = name; });
        document.querySelectorAll(".top-actions .profile h4").forEach(function (el) { el.textContent = name; });
        document.querySelectorAll(".top-actions .profile span, .top-actions .profile p").forEach(function (el) { el.textContent = roleLabel(); });
        var note = document.getElementById("notificationText");
        if (note) note.textContent = name ? "Welcome back, " + name + "!" : "Welcome back!";
    }

    /* ---------------- ACCESS: menu, locked pages, read-only pages ---------------- */
    var PAGES = [
        ["Dashboard", "dashboard-content.html", "fa-house", "dashboard"], ["Tasks", "dashboard-tasks.html", "fa-list-check", "tasks"],
        ["Shopping", "dashboard-shopping.html", "fa-cart-shopping", "shopping"], ["Schedule", "dashboard-schedule.html", "fa-calendar-days", "schedule"],
        ["Smart Home", "dashboard-smart-home.html", "fa-lightbulb", "smartHome"], ["Analytics", "dashboard-analytics.html", "fa-chart-simple", "analytics"],
        ["Reports", "dashboard-reports.html", "fa-file-lines", "reports"], ["Members", "dashboard-members.html", "fa-users", "members"],
        ["Settings", "dashboard-settings.html", "fa-gear", "settings"]
    ];
    function pageArea(file) { var p = PAGES.filter(function (x) { return x[1] === file; })[0]; return p ? p[3] : "dashboard"; }
    function canSee(area) { return area === "dashboard" || area === "members" || area === "settings" || can(area, "view"); }

    function buildMenu() {
        var menu = document.querySelector(".sidebar .menu");
        if (!menu) return;
        menu.innerHTML = PAGES.filter(function (p) { return canSee(p[3]); }).map(function (p) {
            return '<li' + (p[1] === PAGE ? ' class="active"' : "") + '><a href="' + p[1] + '"><i class="fa-solid ' + p[2] + '"></i><span>' + p[0] + "</span></a></li>";
        }).join("");
    }
    function applyAccess() {
        var area = pageArea(PAGE);
        if (!canSee(area)) {
            var main = document.querySelector(".main-content");
            if (main) main.innerHTML = '<div class="elara-locked"><i class="fa-solid fa-lock"></i><h2>No access</h2><p>The home owner hasn’t given you access to this page. Ask them to change your permissions on the Members page.</p><a href="dashboard-content.html">Back to the Dashboard</a></div>';
            document.body.classList.add("elara-page-locked");
            return false;
        }
        var readOnly = ["tasks", "shopping", "schedule", "smartHome"].indexOf(area) > -1 && !can(area, "edit");
        document.body.classList.toggle("elara-readonly", readOnly);
        if (readOnly && !document.querySelector(".elara-viewonly")) {
            var top = document.querySelector(".topbar");
            if (top) top.insertAdjacentHTML("afterend", '<div class="elara-viewonly"><i class="fa-solid fa-eye"></i> View only. You can see this page but not change it.</div>');
        }
        return true;
    }

    /* ---------------- THEMED DIALOG + TOAST ---------------- */
    var ui = {};
    ui.toast = function (message, type) {
        var box = document.getElementById("eui-toasts");
        if (!box) { box = document.createElement("div"); box.id = "eui-toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
        var el = document.createElement("div");
        el.className = "eui-toast " + (type || "success");
        var icon = type === "error" ? "fa-circle-exclamation" : type === "info" ? "fa-circle-info" : "fa-circle-check";
        el.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + esc(message) + "</span>";
        box.appendChild(el);
        requestAnimationFrame(function () { el.classList.add("show"); });
        setTimeout(function () { el.classList.remove("show"); setTimeout(function () { el.remove(); }, 350); }, type === "error" ? 5000 : 3400);
    };
    /* ui.confirm({title, message, confirmText, cancelText, danger, icon}) -> Promise<boolean> */
    ui.confirm = function (opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var old = document.getElementById("eui-overlay"); if (old) old.remove();
            var danger = opts.danger !== false;
            var ov = document.createElement("div");
            ov.id = "eui-overlay"; ov.className = "eui-overlay";
            ov.innerHTML =
                '<div class="eui-box" role="dialog" aria-modal="true">' +
                    '<div class="eui-icon ' + (danger ? "danger" : "info") + '"><i class="fa-solid ' + esc(opts.icon || (danger ? "fa-trash-can" : "fa-circle-question")) + '"></i></div>' +
                    "<h3>" + esc(opts.title || "Are you sure?") + "</h3><p>" + esc(opts.message || "") + "</p>" +
                    '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-r="0">' + esc(opts.cancelText || "Cancel") + "</button>" +
                    '<button type="button" class="eui-btn ' + (danger ? "danger" : "primary") + '" data-r="1">' + esc(opts.confirmText || "Confirm") + "</button></div></div>";
            document.body.appendChild(ov);
            requestAnimationFrame(function () { ov.classList.add("show"); });
            ov.querySelector('[data-r="1"]').focus();
            function done(v) { document.removeEventListener("keydown", onKey, true); ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); resolve(v); }
            function onKey(e) {
                if (e.key === "Escape") { e.stopPropagation(); done(false); }
                else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); done(true); }
            }
            document.addEventListener("keydown", onKey, true);
            ov.addEventListener("click", function (e) {
                if (e.target === ov) return done(false);
                var b = e.target.closest("[data-r]"); if (b) done(b.dataset.r === "1");
            });
        });
    };
    /* ui.form({title, icon, fields:[{name,label,type,value,required,min,max,maxlength,options,placeholder}], submitText, validate(values)->error|null}) -> Promise<values|null> */
    ui.form = function (opts) {
        return new Promise(function (resolve) {
            var ov = document.createElement("div");
            ov.className = "eui-overlay";
            ov.innerHTML = '<form class="eui-box eui-form" novalidate><div class="eui-icon info"><i class="fa-solid ' + esc(opts.icon || "fa-pen") + '"></i></div><h3>' + esc(opts.title) + "</h3>" +
                (opts.text ? "<p>" + esc(opts.text) + "</p>" : "") +
                opts.fields.map(function (f) {
                    var attrs = ' name="' + esc(f.name) + '"' + (f.required ? " required" : "") + (f.min != null ? ' min="' + esc(f.min) + '"' : "") + (f.max != null ? ' max="' + esc(f.max) + '"' : "") +
                        (f.maxlength ? ' maxlength="' + f.maxlength + '"' : "") + (f.step ? ' step="' + esc(f.step) + '"' : "") + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : "");
                    var input = f.type === "select"
                        ? "<select" + attrs + ">" + f.options.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(f.value) ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select>"
                        : f.type === "textarea" ? "<textarea rows=\"3\"" + attrs + ">" + esc(f.value || "") + "</textarea>"
                        : '<input type="' + esc(f.type || "text") + '"' + attrs + ' value="' + esc(f.value == null ? "" : f.value) + '">';
                    return "<label>" + esc(f.label) + input + "</label>";
                }).join("") +
                '<p class="eui-err" aria-live="assertive"></p><div class="eui-actions"><button type="button" class="eui-btn ghost" data-r="0">Cancel</button><button type="submit" class="eui-btn primary">' + esc(opts.submitText || "Save") + "</button></div></form>";
            document.body.appendChild(ov);
            requestAnimationFrame(function () { ov.classList.add("show"); });
            var form = ov.querySelector("form"), first = form.querySelector("input,select,textarea");
            if (first) first.focus();
            function close(v) { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); resolve(v); }
            ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest("[data-r]")) close(null); });
            ov.addEventListener("keydown", function (e) { if (e.key === "Escape") close(null); });
            form.addEventListener("submit", function (e) {
                e.preventDefault();
                var values = {};
                opts.fields.forEach(function (f) { var el = form.elements[f.name]; values[f.name] = el ? String(el.value).trim() : ""; });
                var err = opts.validate ? opts.validate(values) : null;
                if (err) { form.querySelector(".eui-err").textContent = err; return; }
                close(values);
            });
        });
    };
    window.ElaraUI = ui;

    /* ---------------- NOTIFICATION PREFERENCES (personal) ---------------- */
    var NP_KEY = "elaraNotifPrefs";
    var KINDS = ["tasks", "schedule", "shopping", "smartHome", "members", "energy", "security"];
    function prefs() {
        var p = json(NP_KEY, null) || {};
        var out = { push: !!p.push };
        KINDS.forEach(function (k) { out[k] = p[k] !== false; });
        return out;
    }
    function setPref(key, value) { var p = prefs(); p[key] = !!value; set(NP_KEY, JSON.stringify(p)); updateBellDot(); }

    /* ---------------- BROWSER / PUSH NOTIFICATIONS ---------------- */
    var swReg = null, pushSubscribed = false;
    function urlB64ToUint8(base64) {
        var padding = "=".repeat((4 - base64.length % 4) % 4);
        var raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr;
    }
    function registerSW() {
        if (!("serviceWorker" in navigator) || location.protocol === "file:") return Promise.resolve(null);
        if (swReg) return Promise.resolve(swReg);
        return navigator.serviceWorker.register("elara-sw.js").then(function (r) { swReg = r; return r; }).catch(function (e) { console.warn("[Elara] service worker:", e.message); return null; });
    }
    /* subscribe this browser to push (needs permission + the VAPID public key in elara-config.js) */
    function setupPush() {
        if (!prefs().push || !("Notification" in window) || Notification.permission !== "granted") return Promise.resolve(false);
        return registerSW().then(function (reg) {
            if (!reg || !cfg.vapidPublicKey || !reg.pushManager || !D || !D.user) return false;
            return reg.pushManager.getSubscription().then(function (sub) {
                return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(cfg.vapidPublicKey) });
            }).then(function (sub) {
                var j = sub.toJSON();
                return D.getClient().then(function (c) {
                    return c.from("elara_push_subscriptions").upsert({ endpoint: j.endpoint, user_id: D.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) });
                }).then(function (r) { if (r.error) throw r.error; pushSubscribed = true; return true; });
            }).catch(function (e) { console.warn("[Elara] push subscribe:", e.message); return false; });
        });
    }
    function disablePush() {
        return registerSW().then(function (reg) {
            if (!reg || !reg.pushManager) return;
            return reg.pushManager.getSubscription().then(function (sub) {
                if (!sub) return;
                var ep = sub.endpoint;
                return sub.unsubscribe().then(function () {
                    if (D && D.user) return D.getClient().then(function (c) { return c.from("elara_push_subscriptions").delete().eq("endpoint", ep); });
                });
            });
        }).catch(function () {}).then(function () { pushSubscribed = false; });
    }
    /* show a system notification on this device (while Elara is open) */
    function notifySystem(title, body, href, tag) {
        if (!prefs().push || !("Notification" in window) || Notification.permission !== "granted") return;
        var opts = { body: body || "", icon: "Elara logo.png", tag: tag || undefined, data: { href: href || "dashboard-content.html" } };
        registerSW().then(function (reg) {
            if (reg && reg.showNotification) return reg.showNotification(title, opts);
            var n = new Notification(title, opts); n.onclick = function () { window.focus(); location.href = opts.data.href; };
        }).catch(function () {});
    }

    /* ---------------- ALERTS (this person's own reminders) ---------------- */
    function alertsList() { return json("elaraAlerts", []); }
    function fire(kind, id, title, text, icon, color, href) {
        if (!prefs()[kind]) return false;
        var fired = json("elaraFired", {}), now = Date.now();
        if (fired[id]) return false;
        fired[id] = now;
        Object.keys(fired).forEach(function (k) { if (now - fired[k] > 7 * 86400000) delete fired[k]; });
        set("elaraFired", JSON.stringify(fired));
        var list = alertsList();
        list.unshift({ id: id, t: now, kind: kind, title: title, text: text, icon: icon || "fa-bell", color: color || "purple", href: href || "dashboard-content.html" });
        set("elaraAlerts", JSON.stringify(list.slice(0, 40)));
        ui.toast(title + ": " + text, "info");
        try { sessionStorage.removeItem("elaraNotifSeen"); } catch (e) { /* ignore */ }
        updateBellDot();
        notifySystem(title, text, href, id);
        return true;
    }
    function tick() {
        if (!D) return;
        var now = Date.now(), pr = prefs(), myId = D.me().id;

        if (pr.tasks && can("tasks")) D.tasks.all().forEach(function (t) {
            if (t.status === "Completed") return;
            var mine = t.assigneeId ? t.assigneeId === myId : D.household.isOwner;
            if (!mine) return;
            var due = new Date(t.date + "T" + (t.time || "00:00") + ":00").getTime(), diff = due - now;
            if (diff <= 30 * 60000 && diff > -12 * 3600000) {
                fire("tasks", "task:" + t.id + ":" + t.date + t.time, diff > 0 ? "Task due soon" : "Task overdue",
                     t.title + (diff > 0 ? " is due at " : " was due at ") + t.time, "fa-list-check", diff > 0 ? "purple" : "red", "dashboard-tasks.html");
            }
        });
        if (pr.schedule && can("schedule")) D.util.load("elaraSchedules", []).forEach(function (e) {
            if (!e.date || !e.time) return;
            var diff = new Date(e.date + "T" + e.time + ":00").getTime() - now;
            if (diff > 0 && diff <= 30 * 60000) fire("schedule", "event:" + e.id + ":" + e.date + e.time, "Starting soon", e.title + " at " + e.time, "fa-calendar-days", "blue", "dashboard-schedule.html");
        });
        if (pr.energy && can("smartHome")) {
            var today = D.energy.compute("today"), week = D.energy.compute("week");
            var avgBefore = (week.total - today.total) / 6;
            var custom = Number(get("elaraEnergyLimit")) || 0;
            var limit = custom || (avgBefore > 1 ? Math.max(6, avgBefore * 1.4) : 20);
            if (today.total > limit) {
                fire("energy", "energy:" + D.util.dayKey(), "High energy use",
                     "You’ve used " + today.total.toFixed(1) + " kWh today" + (avgBefore > 1 ? " (a normal day is about " + avgBefore.toFixed(1) + " kWh)." : "."),
                     "fa-bolt", "orange", "dashboard-analytics.html");
            }
        }
        if (pr.security) {
            if (can("smartHome")) {
                var evs = json("elaraEnergyLog", []);
                D.devices.all().forEach(function (d) {
                    if (!/door/i.test(d.name) || !d.on) return;
                    var last = evs.filter(function (e) { return e.id === d.id && e.on; }).pop();
                    var since = last ? last.t : d.created, mins = Math.round((now - since) / 60000);
                    if (mins >= 15) fire("security", "door:" + d.id + ":" + since, d.name + " left open", "It has been open for " + mins + " minutes.", "fa-door-open", "red", "dashboard-smart-home.html");
                });
            }
            var alertMsg = null;
            try { alertMsg = sessionStorage.getItem("elaraNewDeviceAlert"); sessionStorage.removeItem("elaraNewDeviceAlert"); } catch (e) { /* ignore */ }
            if (alertMsg) fire("security", "device:" + now, "New device signed in", alertMsg, "fa-shield-halved", "orange", "dashboard-settings.html");
        }
        if (pr.shopping && can("shopping")) json("elaraWarranties", []).forEach(function (w) {
            var days = Math.ceil((new Date(w.expires + "T23:59:59") - new Date()) / 86400000);
            if (days >= 0 && days <= 7) fire("shopping", "warranty:" + w.id + ":" + (days <= 1 ? 1 : 7), w.name + " warranty", days === 0 ? "Ends today" : "Ends in " + days + " day" + (days === 1 ? "" : "s"), "fa-shield", "orange", "dashboard-shopping.html");
        });
    }

    /* ---------------- BELL PANEL (server notifications + own alerts) ---------------- */
    var KIND_ICON = { tasks: ["fa-list-check", "purple"], schedule: ["fa-calendar-days", "blue"], shopping: ["fa-cart-shopping", "green"], smartHome: ["fa-lightbulb", "orange"],
                      energy: ["fa-bolt", "orange"], members: ["fa-users", "purple"], security: ["fa-shield-halved", "red"], general: ["fa-bell", "purple"] };
    function dismissedSet() { return json("elaraNotifDismissed", []); }
    function panelItems() {
        var gone = dismissedSet(), pr = prefs(), cutoff = Date.now() - 7 * 86400000, out = [];
        (D ? D.notifications.list() : []).forEach(function (n) {
            if (pr[n.kind] === false) return;
            var ic = KIND_ICON[n.kind] || KIND_ICON.general;
            out.push({ sid: n.id, t: new Date(n.created_at).getTime(), icon: ic[0], color: ic[1], title: n.title, text: n.body || "", href: n.href || "dashboard-content.html", unread: !n.read_at });
        });
        alertsList().forEach(function (a) {
            if (a.t < cutoff || pr[a.kind] === false || gone.indexOf(a.id || a.title) > -1) return;
            out.push({ aid: a.id || a.title, t: a.t, icon: a.icon, color: a.color, title: a.title, text: a.text, href: a.href, unread: !a.seen });
        });
        return out.sort(function (a, b) { return b.t - a.t; }).slice(0, 30);
    }
    function bellButtons() {
        return Array.prototype.filter.call(document.querySelectorAll(".top-actions button"), function (b) { return b.querySelector(".fa-bell"); });
    }
    function updateBellDot() {
        var count = panelItems().filter(function (n) { return n.unread; }).length;
        bellButtons().forEach(function (b) {
            b.classList.add("elara-bell");
            b.setAttribute("aria-label", count ? count + " unread notifications" : "Notifications");
            var dot = b.querySelector(".elara-bell-dot");
            if (count) {
                if (!dot) { dot = document.createElement("span"); dot.className = "elara-bell-dot"; b.appendChild(dot); }
                dot.textContent = count > 9 ? "9+" : count;
            } else if (dot) dot.remove();
        });
    }
    function closeNotifPanel() { var p = document.getElementById("elaraNotifPanel"); if (p) p.remove(); }
    function openNotifPanel(anchor) {
        closeNotifPanel();
        var items = panelItems();
        var panel = document.createElement("div");
        panel.id = "elaraNotifPanel";
        panel.innerHTML =
            '<div class="enp-head"><h4>Notifications</h4><button type="button" class="enp-clear" ' + (items.length ? "" : "disabled") + '>Clear all</button></div>' +
            '<div class="enp-list">' +
            (items.length ? items.map(function (n) {
                var id = n.sid ? "s:" + n.sid : "a:" + n.aid;
                return '<a class="enp-item' + (n.unread ? " unread" : "") + '" href="' + esc(n.href) + '" data-id="' + esc(id) + '">' +
                    '<span class="enp-icon ' + esc(n.color) + '"><i class="fa-solid ' + esc(n.icon) + '"></i></span>' +
                    '<span class="enp-text"><strong>' + esc(n.title) + "</strong><small>" + esc(n.text) + "</small><em>" + esc(D ? D.ago(n.t) : "") + "</em></span>" +
                    '<button type="button" class="enp-x" data-id="' + esc(id) + '" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button></a>';
            }).join("") : '<div class="enp-empty"><i class="fa-regular fa-bell-slash"></i><p>You’re all caught up.</p></div>') + "</div>";
        document.body.appendChild(panel);
        var r = anchor.getBoundingClientRect();
        panel.style.top = (r.bottom + 10) + "px";
        panel.style.right = Math.max(12, window.innerWidth - r.right) + "px";
        // opening the panel marks everything as read
        var sids = items.filter(function (n) { return n.sid && n.unread; }).map(function (n) { return n.sid; });
        if (sids.length && D) D.notifications.markRead(sids);
        var al = alertsList(); al.forEach(function (a) { a.seen = true; }); set("elaraAlerts", JSON.stringify(al));
        setTimeout(updateBellDot, 50);
    }
    function dismiss(id) {
        if (id.indexOf("s:") === 0) { if (D) D.notifications.remove([Number(id.slice(2))]); }
        else { var d = dismissedSet(); d.push(id.slice(2)); set("elaraNotifDismissed", JSON.stringify(d.slice(-200))); }
    }

    /* ---------------- GLOBAL SEARCH (only what this person may see) ---------------- */
    function searchIndex() {
        var items = [];
        PAGES.forEach(function (p) { if (canSee(p[3])) items.push({ group: "Pages", title: p[0], sub: "Open page", icon: p[2], href: p[1], kw: p[0] + " page" }); });
        if (can("tasks")) json("elaraTasks", []).forEach(function (t) { items.push({ group: "Tasks", title: t.title, sub: t.status + " • " + t.date + (t.assignee ? " • " + t.assignee : ""), icon: "fa-list-check", href: "dashboard-tasks.html", kw: t.title + " " + (t.description || "") + " " + (t.assignee || "") }); });
        if (can("schedule")) json("elaraSchedules", []).forEach(function (e) { items.push({ group: "Schedule", title: e.title, sub: e.date + " • " + e.time, icon: "fa-calendar-days", href: "dashboard-schedule.html?date=" + e.date, kw: e.title + " " + e.category + " " + (e.description || "") }); });
        (D ? D.members.all() : []).forEach(function (m) { items.push({ group: "Members", title: m.name, sub: m.email || ROLE_LABELS[m.role], icon: "fa-user", href: "dashboard-members.html", kw: m.name + " " + (m.email || "") + " " + m.role }); });
        if (can("smartHome")) json("elaraDevices", []).forEach(function (d) { items.push({ group: "Devices", title: d.name, sub: d.room + " • " + (d.on ? "On" : "Off"), icon: d.icon || "fa-plug", href: "dashboard-smart-home.html", kw: d.name + " " + d.room + " device" }); });
        if (can("shopping")) {
            json("elaraShoppingItems", []).forEach(function (s) { items.push({ group: "Shopping", title: s.name, sub: s.details || "", icon: "fa-cart-shopping", href: "dashboard-shopping.html", kw: s.name + " " + (s.details || "") + " " + (s.category || "") }); });
            json("elaraPantry", []).forEach(function (s) { if (!s.usedUp) items.push({ group: "In the house", title: s.name, sub: (s.qty || 1) + " " + (s.unit || ""), icon: "fa-box-open", href: "dashboard-shopping.html", kw: s.name + " pantry" }); });
            json("elaraWarranties", []).forEach(function (w) { items.push({ group: "Warranties", title: w.name, sub: "Expires " + w.expires, icon: "fa-shield", href: "dashboard-shopping.html", kw: w.name + " warranty" }); });
        }
        return items;
    }
    function runSearch(q) {
        var words = q.toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        return searchIndex().filter(function (it) {
            var hay = (it.kw + " " + it.title).toLowerCase();
            return words.every(function (w) { return hay.indexOf(w) > -1; });
        }).slice(0, 9);
    }
    var searchPanel = null, searchSel = -1, searchHits = [];
    function closeSearch() { if (searchPanel) { searchPanel.remove(); searchPanel = null; } searchSel = -1; }
    function renderSearch(input) {
        var q = input.value.trim().slice(0, 80);
        searchHits = runSearch(q);
        closeSearch();
        if (!q) return;
        searchPanel = document.createElement("div");
        searchPanel.id = "eui-search";
        searchPanel.setAttribute("role", "listbox");
        var html = "", last = "";
        if (!searchHits.length) html = '<div class="eui-s-empty"><i class="fa-regular fa-face-meh"></i> No results for “' + esc(q) + "”</div>";
        searchHits.forEach(function (h, i) {
            if (h.group !== last) { html += '<div class="eui-s-group">' + esc(h.group) + "</div>"; last = h.group; }
            html += '<a class="eui-s-item" role="option" data-i="' + i + '" href="' + esc(h.href) + '"><span class="eui-s-ic"><i class="fa-solid ' + esc(h.icon) + '"></i></span>' +
                    '<span class="eui-s-tx"><strong>' + esc(h.title) + "</strong><small>" + esc(h.sub) + "</small></span></a>";
        });
        searchPanel.innerHTML = html;
        document.body.appendChild(searchPanel);
        var r = input.closest(".search").getBoundingClientRect();
        searchPanel.style.top = (r.bottom + 8) + "px";
        searchPanel.style.left = Math.max(12, Math.min(r.left, window.innerWidth - Math.max(300, r.width) - 12)) + "px";
        searchPanel.style.width = Math.min(window.innerWidth - 24, Math.max(300, r.width)) + "px";
    }
    function paintSel() { if (searchPanel) searchPanel.querySelectorAll(".eui-s-item").forEach(function (a) { a.classList.toggle("sel", Number(a.dataset.i) === searchSel); }); }
    function wireSearch() {
        document.querySelectorAll(".top-actions .search input").forEach(function (input) {
            if (input.id || input.dataset.euiSearch) return;      // pages with their own search keep it
            input.dataset.euiSearch = "1";
            input.setAttribute("autocomplete", "off");
            input.setAttribute("maxlength", "80");
            input.setAttribute("aria-label", "Search Elara");
            input.addEventListener("input", function () { renderSearch(input); });
            input.addEventListener("focus", function () { if (input.value.trim()) renderSearch(input); });
            input.addEventListener("keydown", function (e) {
                if (e.key === "ArrowDown") { e.preventDefault(); searchSel = Math.min(searchHits.length - 1, searchSel + 1); paintSel(); }
                else if (e.key === "ArrowUp") { e.preventDefault(); searchSel = Math.max(0, searchSel - 1); paintSel(); }
                else if (e.key === "Enter") { var hit = searchHits[searchSel >= 0 ? searchSel : 0]; if (hit) { e.preventDefault(); location.href = hit.href; } }
                else if (e.key === "Escape") closeSearch();
            });
        });
    }

    /* ---------------- VOICE CONTROL ---------------- */
    var Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
    function voicePrefs() { var v = json("elaraVoicePrefs", {}); return { enabled: v.enabled !== false, speak: v.speak !== false }; }
    function speak(text) {
        if (!voicePrefs().speak || !("speechSynthesis" in window)) return;
        try {
            window.speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(String(text).replace(/[“”]/g, "").slice(0, 400));
            u.lang = "en-ZA"; u.rate = 1.02;
            window.speechSynthesis.speak(u);
        } catch (e) { /* ignore */ }
    }
    var listening = null;
    function voiceOverlay(state, text) {
        var ov = document.getElementById("elaraVoice");
        if (!ov) {
            ov = document.createElement("div");
            ov.id = "elaraVoice";
            ov.innerHTML = '<div class="ev-box" role="dialog" aria-live="polite"><button type="button" class="ev-x" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
                '<div class="ev-mic"><i class="fa-solid fa-microphone"></i></div><p class="ev-state"></p><p class="ev-text"></p>' +
                '<form class="ev-type"><input type="text" maxlength="300" placeholder="Or type a command..." aria-label="Type a command"><button type="submit" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button></form></div>';
            document.body.appendChild(ov);
            ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".ev-x")) stopVoice(true); });
            ov.querySelector(".ev-type").addEventListener("submit", function (e) {
                e.preventDefault();
                var inp = ov.querySelector(".ev-type input"), t = inp.value.trim();
                if (t) { inp.value = ""; runCommand(t); }
            });
        }
        ov.className = "show " + state;
        ov.querySelector(".ev-state").textContent = { listening: "Listening...", thinking: "Working on it...", done: "Elara", error: "Sorry" }[state] || "";
        ov.querySelector(".ev-text").textContent = text || "";
    }
    function stopVoice(close) {
        if (listening) { try { listening.abort(); } catch (e) { /* ignore */ } listening = null; }
        if (close) { var ov = document.getElementById("elaraVoice"); if (ov) ov.remove(); if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }
    }
    function runCommand(text) {
        voiceOverlay("thinking", "“" + text + "”");
        if (!window.ElaraAssistant) { voiceOverlay("error", "The assistant isn't loaded on this page."); return; }
        ElaraAssistant.handle(text).then(function (reply) {
            voiceOverlay("done", reply);
            speak(reply);
            document.dispatchEvent(new CustomEvent("elara:refresh"));
        });
    }
    function startVoice() {
        if (!Recog) { voiceOverlay("error", "Voice control needs Chrome, Edge or Safari. You can type a command below instead."); return; }
        stopVoice(false);
        var r = new Recog();
        r.lang = "en-ZA"; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
        var finalText = "";
        r.onresult = function (e) {
            var interim = "";
            for (var i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
            }
            voiceOverlay("listening", finalText || interim);
        };
        r.onerror = function (e) {
            listening = null;
            var msg = e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone access is blocked. Allow it in your browser's site settings." :
                      e.error === "no-speech" ? "I didn't hear anything. Tap the microphone and try again." : "Voice error: " + e.error;
            voiceOverlay("error", msg);
        };
        r.onend = function () { listening = null; if (finalText.trim()) runCommand(finalText.trim()); };
        try { r.start(); listening = r; voiceOverlay("listening", ""); } catch (e) { voiceOverlay("error", e.message); }
    }
    function addVoiceButton() {
        if (!voicePrefs().enabled || document.getElementById("voiceBtn")) return;
        var host = document.querySelector(".top-actions");
        if (!host) return;
        var b = document.createElement("button");
        b.id = "voiceBtn"; b.type = "button"; b.title = "Voice control"; b.setAttribute("aria-label", "Voice control");
        b.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        var theme = document.getElementById("themeBtn") || host.querySelector(".profile");
        host.insertBefore(b, theme);
        b.addEventListener("click", startVoice);
    }

    /* ---------------- LOCATION (asked once, can be changed in Settings) ---------------- */
    function reverseCity(lat, lon) {
        return fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + lat + "&longitude=" + lon + "&localityLanguage=en")
            .then(function (r) { return r.json(); }).then(function (j) { return { city: j.city || j.locality || j.principalSubdivision || "Your location", country: j.countryName || "" }; })
            .catch(function () { return { city: "Your location", country: "" }; });
    }
    function tzFor(lat, lon) {
        return fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m&timezone=auto")
            .then(function (r) { return r.json(); }).then(function (j) { return j.timezone || null; }).catch(function () { return null; });
    }
    /* asks the browser for the position; saves it as this person's location (and the home's, for owners without one) */
    function requestLocation(opts) {
        opts = opts || {};
        return new Promise(function (resolve, reject) {
            if (!navigator.geolocation) return reject(new Error("This browser can't share its location."));
            navigator.geolocation.getCurrentPosition(function (pos) {
                var lat = +pos.coords.latitude.toFixed(4), lon = +pos.coords.longitude.toFixed(4);
                Promise.all([reverseCity(lat, lon), tzFor(lat, lon)]).then(function (res) {
                    var place = res[0], tz = res[1];
                    var loc = { lat: lat, lon: lon, city: place.city, label: [place.city, place.country].filter(Boolean).join(", "), tz: tz, t: Date.now() };
                    set("elaraLocationConsent", "granted");
                    set("elaraMyLocation", JSON.stringify(loc));
                    var isOwner = !D || D.household.isOwner;
                    if (isOwner && (opts.asHome || !get("elaraHomeCoords"))) {
                        set("elaraHomeCoords", JSON.stringify(loc));
                        set("elaraHomeLocation", loc.label);
                        if (tz) set("elaraTimezone", tz);
                        applyHome();
                    }
                    try { sessionStorage.removeItem("elaraWeather"); sessionStorage.removeItem("elaraTemp"); } catch (e) { /* ignore */ }
                    resolve(loc);
                });
            }, function (err) {
                if (err.code === 1) set("elaraLocationConsent", "denied");
                reject(new Error(err.code === 1 ? "Location access was blocked. You can allow it in your browser's site settings." : "Couldn't get your location (" + err.message + ")."));
            }, { timeout: 12000, maximumAge: 600000, enableHighAccuracy: false });
        });
    }
    function askLocationOnce() {
        if (get("elaraLocationConsent") || !navigator.geolocation || document.querySelector(".eui-overlay")) return;
        ui.confirm({
            title: "Use your location?",
            message: "Elara uses it for local weather, sunrise and sunset for your lights, and your home's time zone. It is only read when Elara needs it, and you can switch it off in Settings.",
            confirmText: "Allow location", cancelText: "Not now", icon: "fa-location-dot", danger: false
        }).then(function (ok) {
            if (!ok) { set("elaraLocationConsent", "denied"); return; }
            requestLocation().then(function (loc) {
                ui.toast("Location saved: " + loc.label + ".");
                document.dispatchEvent(new CustomEvent("elara:location", { detail: loc }));
            }).catch(function (e) { ui.toast(e.message, "error"); });
        });
    }

    /* ---------------- SMART HOME AUTOMATIONS ----------------
       The elara-tuya scheduled job runs them on the server (set serverAutomations: true in elara-config.js once it's on).
       Until then, any open Elara screen in the home runs them. */
    function homeAuto() { var a = json("elaraHomeAutomation", {}); return { automations: a.automations !== false }; }
    function sunTimes() {
        var c = json("elaraHomeCoords", null) || json("elaraMyLocation", null);
        var key = "elaraSun:" + todayKey();
        try { var s = JSON.parse(sessionStorage.getItem(key) || "null"); if (s) return Promise.resolve(s); } catch (e) { /* ignore */ }
        var lat = c ? c.lat : cfg.defaultLat, lon = c ? c.lon : cfg.defaultLon;
        return fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&daily=sunrise,sunset&timezone=" + encodeURIComponent(homeTz()) + "&forecast_days=1")
            .then(function (r) { return r.json(); }).then(function (j) {
                var s = { rise: (j.daily.sunrise[0] || "").slice(11, 16), set: (j.daily.sunset[0] || "").slice(11, 16) };
                try { sessionStorage.setItem(key, JSON.stringify(s)); } catch (e) { /* ignore */ }
                return s;
            }).catch(function () { return null; });
    }
    function toMin(hm) { return hm && /^\d{2}:\d{2}$/.test(hm) ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) : null; }
    /* switch an automation's devices now (also used by "Run now" on the Smart Home page) */
    function runAutomation(a, reason) {
        var want = a.action !== "off", all = D.devices.all();
        var todo = all.filter(function (d) { return a.devices.indexOf(d.id) > -1 && d.on !== want; });
        return Promise.all(todo.map(function (d) {
            return D.devices.switch(d.id, want, { auto: true, silent: true }).then(function () { return 1; }, function () { return 0; });
        })).then(function (r) {
            var n = r.reduce(function (s, x) { return s + x; }, 0);
            if (n) D.log(a.name + (reason ? " ran" : " was run") + " (" + n + " device" + (n === 1 ? "" : "s") + " " + (want ? "on" : "off") + ")", a.icon || "fa-robot");
            return { switched: n, failed: todo.length - n };
        });
    }
    function runAutomations() {
        if (!D || (!D.user && !D.demo) || cfg.serverAutomations || !can("smartHome", "edit") || !homeAuto().automations) return;
        var parts = homeParts(), now = parts.hour * 60 + parts.minute, day = todayKey(), wd = new Date().getDay();
        var list = D.automations.all().filter(function (a) { return a.on && a.kind !== "manual" && a.devices.length && (!a.days.length || a.days.indexOf(wd) > -1); });
        if (!list.length) return;
        var needSun = list.some(function (a) { return a.kind !== "time"; });
        (needSun ? sunTimes() : Promise.resolve(null)).then(function (sun) {
            var runs = json("elaraAutomationRuns", {});
            list.forEach(function (a) {
                var at = a.kind === "time" ? toMin(a.at) : sun ? toMin(a.kind === "sunset" ? sun.set : sun.rise) : null;
                if (at == null) return;
                if (a.kind !== "time") at += a.offset || 0;
                if (now < at || now >= at + 15 || runs[a.id] === day) return;
                runs[a.id] = day; set("elaraAutomationRuns", JSON.stringify(runs));
                runAutomation(a, true).then(function (r) { if (r.switched) ui.toast(a.name + " ran.", "info"); });
            });
        });
    }

    /* ---------------- INIT ---------------- */
    function init() {
        applyTheme(get(THEME_KEY) || "dark");
        buildMenu();
        var allowed = applyAccess();
        applyProfile();
        applyHome();
        updateBellDot();
        wireSearch();
        if (!allowed) return;
        addVoiceButton();
        setTimeout(askLocationOnce, 1500);
        if (D) {
            D.backup.auto();
            if (D.setupIssue) showSetupIssue();
        }
        setupPush();
    }
    function showSetupIssue() {
        if (!D || !D.household.isOwner || document.querySelector(".elara-setup-issue")) return;
        var top = document.querySelector(".topbar");
        if (top) top.insertAdjacentHTML("afterend", '<div class="elara-setup-issue"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(D.setupIssue) + "</div>");
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

    setTimeout(tick, 2500);
    setInterval(tick, 60000);
    setTimeout(runAutomations, 4000);
    setInterval(runAutomations, 60000);

    /* data changed elsewhere (another member, or the first cloud load) */
    if (D) {
        D.onChange(function (keys) {
            if (keys.indexOf("setup") > -1) showSetupIssue();
            if (keys.indexOf("access") > -1) { buildMenu(); applyAccess(); applyProfile(); }
            if (keys.some(function (k) { return /^elara(FirstName|LastName|ProfileImage|HomeName|Theme)$/.test(k) || k === "roster" || k === "access"; })) { applyProfile(); applyHome(); applyTheme(get(THEME_KEY) || "dark"); }
            updateBellDot();
            // pages that can't redraw themselves are reloaded when the person isn't in the middle of something
            var dataKeys = keys.filter(function (k) { return /^elara/.test(k) && !/^elara(Alerts|Fired|NotifDismissed|LoginActivity|AutomationRuns)$/.test(k); });
            if (dataKeys.length && !window.ElaraPageLive) reloadWhenIdle();
        });
        document.addEventListener("elara:notification", function (e) {
            var n = e.detail || {};
            if (prefs()[n.kind] === false) return;
            ui.toast(n.title + (n.body ? ": " + n.body : ""), "info");
            if (document.hidden && !pushSubscribed) notifySystem(n.title, n.body, n.href, "n" + n.id);
            updateBellDot();
        });
    }
    var reloadTimer = null;
    function reloadWhenIdle() {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(function () {
            var busy = document.querySelector(".eui-overlay, .modal.active, .task-modal.active, #elaraVoice") ||
                       (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
            if (busy) return reloadWhenIdle();
            location.reload();
        }, 1500);
    }

    /* Capture phase: runs before the page's own click handlers */
    document.addEventListener("click", function (event) {
        var target = event.target;
        if (!target.closest) return;

        if (target.closest("#themeBtn")) {
            event.stopPropagation();
            var goLight = !document.body.classList.contains("light-theme");
            set(THEME_KEY, goLight ? "light" : "dark");
            applyTheme(goLight ? "light" : "dark");
            return;
        }
        if (target.closest(".logout")) {
            event.stopPropagation(); event.preventDefault();
            ui.confirm({ title: "Log out of Elara?", message: "You will need to sign in again to see your home.", confirmText: "Log out", icon: "fa-right-from-bracket", danger: false })
                .then(function (ok) {
                    if (!ok) return;
                    var go = function () {
                        try { sessionStorage.removeItem("elaraLoaded"); } catch (e) { /* ignore */ }
                        location.href = cfg.loginPage || "Loginpage.html";
                    };
                    if (D && D.signOut) D.signOut().then(go, go); else go();
                });
            return;
        }
        if (target.closest(".enp-clear")) {
            event.stopPropagation(); event.preventDefault();
            panelItems().forEach(function (n) { dismiss(n.sid ? "s:" + n.sid : "a:" + n.aid); });
            updateBellDot();
            var anchor = bellButtons()[0]; if (anchor) openNotifPanel(anchor);
            return;
        }
        var x = target.closest(".enp-x");
        if (x) {
            event.stopPropagation(); event.preventDefault();
            dismiss(x.dataset.id); updateBellDot();
            var a = bellButtons()[0]; if (a) openNotifPanel(a);
            return;
        }
        var bell = target.closest(".top-actions button");
        if (bell && bell.querySelector(".fa-bell")) {
            event.stopPropagation();
            if (document.getElementById("elaraNotifPanel")) closeNotifPanel(); else openNotifPanel(bell);
            return;
        }
        if (searchPanel && !target.closest("#eui-search") && !target.closest(".top-actions .search")) closeSearch();
        if (!target.closest("#elaraNotifPanel")) closeNotifPanel();
    }, true);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeNotifPanel(); closeSearch(); } });

    window.addEventListener("storage", function (e) {
        if (!e.key) return;
        if (/elaraTheme$/.test(e.key)) applyTheme(get(THEME_KEY) || "dark");
        if (/elara(FirstName|ProfileImage)$/.test(e.key)) applyProfile();
        if (/elaraHome/.test(e.key)) applyHome();
    });

    window.ElaraCommon = {
        applyTheme: applyTheme, applyProfile: applyProfile, applyHome: applyHome, getName: getName, getProfileImage: getProfileImage, roleLabel: roleLabel,
        ui: ui, tz: homeTz, homeParts: homeParts, fmtTemp: fmtTemp, useFahrenheit: useFahrenheit, esc: esc,
        requestLocation: requestLocation, notifySystem: notifySystem, startVoice: startVoice, speak: speak, voicePrefs: voicePrefs,
        setupPush: setupPush, disablePush: disablePush, registerSW: registerSW, runAutomations: runAutomations, runAutomation: runAutomation, homeAuto: homeAuto,
        PAGES: PAGES, canSee: canSee
    };
    window.ElaraNotify = {
        prefs: prefs, setPref: setPref, fire: fire, tick: tick, KINDS: KINDS,
        test: function () {
            ui.toast("Notifications are on. You’ll see alerts like this.", "success");
            notifySystem("Elara", "Notifications are working on this device.", "dashboard-content.html", "test");
            if (D && D.user && cfg.pushEndpoint) D.callFunction(cfg.pushEndpoint, { action: "test" }).catch(function () {});
        }
    };
})();
