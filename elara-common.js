/* ==========================================================
   ELARA COMMON  (shared by every dashboard page)
   - Applies the saved theme on load
   - Theme button + Logout button handled ONCE
   - Syncs the saved profile picture / name into every page
   - One shared notifications panel for every bell icon
   Load it AFTER elara-theme.js and BEFORE the page script.
========================================================== */
(function () {
    "use strict";

    /* Make sure the shared sidebar stylesheet is loaded even if a page forgot the <link> */
    (function ensureSidebarCss() {
        var script = document.currentScript;
        if (!script || !script.src) return;
        if (document.querySelector('link[href*="elara-sidebar.css"]')) return;
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = script.src.replace(/elara-common\.js.*$/, "elara-sidebar.css");
        document.head.appendChild(link);
    })();

    var THEME_KEY = "elaraTheme";
    var LOGIN_PAGE = "../Interface/Loginpage.html";   // change if your login page moves

    function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* ignore */ } }
    function json(key, fallback) {
        try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
        catch (e) { return fallback; }
    }
    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function todayKey() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

    /* ---------------- THEME ---------------- */
    function updateIcon() {
        var btn = document.getElementById("themeBtn");
        var icon = btn && btn.querySelector("i");
        if (!icon) return;
        var light = document.body.classList.contains("light-theme");
        icon.classList.toggle("fa-sun", light);
        icon.classList.toggle("fa-moon", !light);
    }
    function applyTheme(theme) {
        var light = theme === "light" ||
            (theme === "system" && window.matchMedia &&
             window.matchMedia("(prefers-color-scheme: light)").matches);
        document.body.classList.toggle("light-theme", light);
        updateIcon();
    }


    /* ---------------- HOME SETTINGS (name, timezone, temperature unit) ---------------- */
    function homeTz() {
        var tz = get("elaraTimezone");
        try { if (tz) { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return tz; } } catch (e) { /* bad zone */ }
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    }
    // current time in the HOME's timezone
    function homeParts() {
        var f = new Intl.DateTimeFormat("en-GB", { timeZone: homeTz(), hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short", day: "numeric", month: "short" });
        var o = {}; f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
        return { hour: Number(o.hour) % 24, minute: Number(o.minute), text: o.weekday + ", " + o.day + " " + o.month, time: pad(Number(o.hour) % 24) + ":" + o.minute, tz: homeTz() };
    }
    function useFahrenheit() { return get("elaraTemperatureUnit") === "fahrenheit"; }
    function fmtTemp(celsius) {
        var n = Number(celsius);
        return useFahrenheit() ? Math.round(n * 9 / 5 + 32) + "\u00b0F" : Math.round(n) + "\u00b0C";
    }
    // the sidebar shows the home's name under "Elara"
    function applyHome() {
        var name = get("elaraHomeName");
        if (name) document.querySelectorAll(".sidebar .logo span").forEach(function (el) { el.textContent = name; el.title = name; });
    }


    
    /* ---------------- PROFILE (name + picture from Settings) ---------------- */
    function currentUser() {
        var D = window.ElaraData;
        return D && D.user ? D.user : null;
    }

    // First name for THIS signed-in account only (never a hard-coded or shared value)
    function userFirst(user) {
        if (!user) return "";
        var saved = user.id ? get("elaraFirstName:" + user.id) : "";
        if (saved) return saved;
        if (user.first) return user.first;
        if (user.name) return String(user.name).trim().split(/\s+/)[0];
        if (user.email) {
            var p = String(user.email).split("@")[0].replace(/[^a-zA-Z]+/g, " ").trim().split(" ")[0];
            if (p) return p.charAt(0).toUpperCase() + p.slice(1);
        }
        return "";
    }

    function getName(fallback) {
        return userFirst(currentUser()) || (fallback === undefined ? "there" : fallback);
    }

    // Picture saved by THIS account. Empty until the user uploads one.
    function getProfileImage() {
        var user = currentUser();
        return user && user.id ? (get("elaraProfileImage:" + user.id) || "") : "";
    }

    // Shows the picture, or a neutral initial circle when there is none yet
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
        ph.style.cssText = "width:" + w + "px;height:" + w + "px;border-radius:50%;display:flex;" +
            "align-items:center;justify-content:center;flex-shrink:0;font-weight:600;color:#fff;" +
            "font-size:" + Math.round(w * 0.42) + "px;background:linear-gradient(135deg,#6c63ff,#4a41d6)";
    }

    var profileTries = 0;
    function applyProfile() {
        var user = currentUser();
        if (!user) {                       // account not loaded yet: try again shortly
            if (profileTries++ < 20) setTimeout(applyProfile, 250);
            return;
        }

        var name = getName("");
        var img = getProfileImage();
        var initial = (name || "?").charAt(0).toUpperCase();

        document.querySelectorAll(
            ".top-actions .profile img, .topbar .profile img, #profileImage, .large-profile img"
        ).forEach(function (el) { paintAvatar(el, img, initial); });

        ["userName", "profileName"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.textContent = name;
        });
        document.querySelectorAll(".top-actions .profile h4")
            .forEach(function (el) { el.textContent = name; });

        var note = document.getElementById("notificationText");
        if (note) note.textContent = name ? "Welcome back, " + name + "!" : "Welcome back!";
    }

    /* ---------------- NOTIFICATIONS ---------------- */
    function buildNotifications() {
        var list = [];
        var t = todayKey(), pr = prefs();
        var cutoff = Date.now() - 3 * 86400000;
        alertsList().filter(function (a) { return a.t > cutoff && pr[a.kind] !== false; }).slice(0, 6).forEach(function (a) {
            list.push({ icon: a.icon, color: a.color, title: a.title, text: a.text, href: a.href });
        });
        var tasks = pr.tasks ? json("elaraTasks", null) : null;
        if (tasks) {
            var now = t + " " + pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
            var overdue = tasks.filter(function (x) { return x.status !== "Completed" && (x.date + " " + x.time) < now; });
            overdue.slice(0, 3).forEach(function (x) {
                list.push({ icon: "fa-triangle-exclamation", color: "red", title: "Overdue: " + x.title, text: "Was due " + x.date + " at " + x.time, href: "dashboard-tasks.html" });
            });
            var dueToday = tasks.filter(function (x) { return x.date === t && x.status !== "Completed" && (x.date + " " + x.time) >= now; });
            if (dueToday.length) list.push({ icon: "fa-list-check", color: "purple", title: dueToday.length + " task(s) due today", text: "Next: " + dueToday[0].title, href: "dashboard-tasks.html" });
        }
        var events = json("elaraSchedules", null);
        if (events) {
            var now2 = pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
            var left = events.filter(function (e) { return e.date === t && e.time >= now2; }).sort(function (a, b) { return a.time.localeCompare(b.time); });
            if (left.length) list.push({ icon: "fa-calendar-days", color: "blue", title: left.length + " event(s) still today", text: "Next: " + left[0].title + " at " + left[0].time, href: "dashboard-schedule.html" });
        }
        var members = json("elaraMembers", null);
        if (members) {
            var pending = members.filter(function (m) { return m.status === "pending"; });
            if (pending.length) list.push({ icon: "fa-user-clock", color: "orange", title: pending.length + " pending invitation(s)", text: pending[0].name + " hasn't joined yet", href: "dashboard-members.html" });
        }
        var devs = json("elaraDevices", null);
        if (devs) {
            var on = devs.filter(function (d) { return d.on; }).length;
            list.push({ icon: "fa-lightbulb", color: "green", title: on + " device(s) are on", text: "Review them on the Smart Home page", href: "dashboard-smart-home.html" });
        }
        var warranties = json("elaraWarranties", []);
        warranties.forEach(function (w) {
            var days = Math.ceil((new Date(w.expires + "T23:59:59") - new Date()) / 86400000);
            if (days <= 30) list.push({ icon: "fa-shield", color: days < 0 ? "red" : "orange", title: w.name + " warranty",
                text: days < 0 ? "Expired " + Math.abs(days) + " day(s) ago" : "Expires in " + days + " day(s)", href: "dashboard-shopping.html" });
        });
        var shopping = json("elaraShoppingItems", []).filter(function (s) { return s.status !== "Purchased"; });
        if (shopping.length) list.push({ icon: "fa-cart-shopping", color: "purple", title: shopping.length + " item(s) on your shopping list", text: "Next: " + shopping[0].name, href: "dashboard-shopping.html" });
        return list;
    }

    function dismissedSet() { return json("elaraNotifDismissed", []); }

    function visibleNotifications() {
        var gone = dismissedSet();
        return buildNotifications().filter(function (n) { return gone.indexOf(n.title) === -1; });
    }

    function bellButtons() {
        return Array.prototype.filter.call(document.querySelectorAll(".top-actions button"), function (b) {
            return b.querySelector(".fa-bell");
        });
    }

    function updateBellDot() {
        var count = visibleNotifications().length;
        var seen = sessionStorage.getItem("elaraNotifSeen") === "1";
        bellButtons().forEach(function (b) {
            b.classList.add("elara-bell");
            var dot = b.querySelector(".elara-bell-dot");
            if (count && !seen) {
                if (!dot) { dot = document.createElement("span"); dot.className = "elara-bell-dot"; b.appendChild(dot); }
            } else if (dot) dot.remove();
        });
    }

    function closeNotifPanel() {
        var p = document.getElementById("elaraNotifPanel");
        if (p) p.remove();
    }

    function openNotifPanel(anchor) {
        closeNotifPanel();
        sessionStorage.setItem("elaraNotifSeen", "1");
        updateBellDot();

        var items = visibleNotifications();
        var panel = document.createElement("div");
        panel.id = "elaraNotifPanel";
        panel.innerHTML =
            '<div class="enp-head"><h4>Notifications</h4>' +
            '<button type="button" class="enp-clear" ' + (items.length ? "" : "disabled") + '>Clear all</button></div>' +
            '<div class="enp-list">' +
            (items.length ? items.map(function (n, i) {
                return '<a class="enp-item" href="' + n.href + '" data-title="' + esc(n.title) + '">' +
                    '<span class="enp-icon ' + n.color + '"><i class="fa-solid ' + n.icon + '"></i></span>' +
                    '<span class="enp-text"><strong>' + esc(n.title) + '</strong><small>' + esc(n.text) + '</small></span>' +
                    '<button type="button" class="enp-x" data-title="' + esc(n.title) + '" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button></a>';
            }).join("") : '<div class="enp-empty"><i class="fa-regular fa-bell-slash"></i><p>You\u2019re all caught up.</p></div>') +
            '</div>';
        document.body.appendChild(panel);

        var r = anchor.getBoundingClientRect();
        panel.style.top = (r.bottom + 10) + "px";
        panel.style.right = Math.max(12, window.innerWidth - r.right) + "px";
    }


    /* ---------------- THEMED DIALOG + TOAST (replaces confirm()/alert()) ---------------- */
    var ui = {};
    ui.toast = function (message, type) {
        var box = document.getElementById("eui-toasts");
        if (!box) { box = document.createElement("div"); box.id = "eui-toasts"; document.body.appendChild(box); }
        var el = document.createElement("div");
        el.className = "eui-toast " + (type || "success");
        var icon = type === "error" ? "fa-circle-exclamation" : type === "info" ? "fa-circle-info" : "fa-circle-check";
        el.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + esc(message) + "</span>";
        box.appendChild(el);
        requestAnimationFrame(function () { el.classList.add("show"); });
        setTimeout(function () { el.classList.remove("show"); setTimeout(function () { el.remove(); }, 350); }, 3200);
    };

    /* ui.confirm({title, message, confirmText, cancelText, danger}) -> Promise<boolean> */
    ui.confirm = function (opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var old = document.getElementById("eui-overlay"); if (old) old.remove();
            var danger = opts.danger !== false;
            var ov = document.createElement("div");
            ov.id = "eui-overlay"; ov.className = "eui-overlay";
            ov.innerHTML =
                '<div class="eui-box" role="dialog" aria-modal="true">' +
                    '<div class="eui-icon ' + (danger ? "danger" : "info") + '"><i class="fa-solid ' + (opts.icon || (danger ? "fa-trash-can" : "fa-circle-question")) + '"></i></div>' +
                    '<h3>' + esc(opts.title || "Are you sure?") + '</h3>' +
                    '<p>' + esc(opts.message || "") + '</p>' +
                    '<div class="eui-actions">' +
                        '<button type="button" class="eui-btn ghost" data-r="0">' + esc(opts.cancelText || "Cancel") + '</button>' +
                        '<button type="button" class="eui-btn ' + (danger ? "danger" : "primary") + '" data-r="1">' + esc(opts.confirmText || "Confirm") + '</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(ov);
            requestAnimationFrame(function () { ov.classList.add("show"); });
            var okBtn = ov.querySelector('[data-r="1"]'); okBtn.focus();

            function done(v) {
                document.removeEventListener("keydown", onKey, true);
                ov.classList.remove("show");
                setTimeout(function () { ov.remove(); }, 180);
                resolve(v);
            }
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
    window.ElaraUI = ui;

    /* ---------------- GLOBAL SEARCH (top bar "Search anything...") ---------------- */
    var PAGES = [
        ["Dashboard", "dashboard-content.html", "fa-house"], ["Tasks", "dashboard-tasks.html", "fa-list-check"],
        ["Shopping", "dashboard-shopping.html", "fa-cart-shopping"], ["Schedule", "dashboard-schedule.html", "fa-calendar-days"],
        ["Smart Home", "dashboard-smart-home.html", "fa-lightbulb"], ["Analytics", "dashboard-analytics.html", "fa-chart-simple"],
        ["Members", "dashboard-members.html", "fa-users"], ["Settings", "dashboard-settings.html", "fa-gear"]
    ];
    function searchIndex() {
        var items = [];
        PAGES.forEach(function (p) { items.push({ group: "Pages", title: p[0], sub: "Open page", icon: p[2], href: p[1], kw: p[0] + " page" }); });
        json("elaraTasks", []).forEach(function (t) { items.push({ group: "Tasks", title: t.title, sub: t.status + " \u2022 " + t.date, icon: "fa-list-check", href: "dashboard-tasks.html", kw: t.title + " " + t.description + " " + t.assignee }); });
        json("elaraSchedules", []).forEach(function (e) { items.push({ group: "Schedule", title: e.title, sub: e.date + " \u2022 " + e.time, icon: "fa-calendar-days", href: "dashboard-schedule.html", kw: e.title + " " + e.category + " " + (e.description || "") }); });
        json("elaraMembers", []).forEach(function (m) { items.push({ group: "Members", title: m.name, sub: m.email, icon: "fa-user", href: "dashboard-members.html", kw: m.name + " " + m.email + " " + m.role }); });
        json("elaraDevices", []).forEach(function (d) { items.push({ group: "Devices", title: d.name, sub: d.room + " \u2022 " + (d.on ? "On" : "Off"), icon: d.icon || "fa-plug", href: "dashboard-smart-home.html", kw: d.name + " " + d.room + " device" }); });
        json("elaraShoppingItems", []).forEach(function (s) { items.push({ group: "Shopping", title: s.name, sub: s.details || "", icon: "fa-cart-shopping", href: "dashboard-shopping.html", kw: s.name + " " + (s.details || "") + " " + (s.category || "") }); });
        json("elaraWarranties", []).forEach(function (w) { items.push({ group: "Warranties", title: w.name, sub: "Expires " + w.expires, icon: "fa-shield", href: "dashboard-shopping.html", kw: w.name + " warranty" }); });
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
        var q = input.value.trim();
        searchHits = runSearch(q);
        closeSearch();
        if (!q) return;
        searchPanel = document.createElement("div");
        searchPanel.id = "eui-search";
        var html = "", last = "";
        if (!searchHits.length) html = '<div class="eui-s-empty"><i class="fa-regular fa-face-meh"></i> No results for \u201c' + esc(q) + '\u201d</div>';
        searchHits.forEach(function (h, i) {
            if (h.group !== last) { html += '<div class="eui-s-group">' + esc(h.group) + '</div>'; last = h.group; }
            html += '<a class="eui-s-item" data-i="' + i + '" href="' + h.href + '"><span class="eui-s-ic"><i class="fa-solid ' + h.icon + '"></i></span>' +
                    '<span class="eui-s-tx"><strong>' + esc(h.title) + '</strong><small>' + esc(h.sub) + '</small></span></a>';
        });
        searchPanel.innerHTML = html;
        document.body.appendChild(searchPanel);
        var r = input.closest(".search").getBoundingClientRect();
        searchPanel.style.top = (r.bottom + 8) + "px";
        searchPanel.style.left = Math.max(12, r.left) + "px";
        searchPanel.style.width = Math.max(300, r.width) + "px";
    }
    function paintSel() {
        if (!searchPanel) return;
        searchPanel.querySelectorAll(".eui-s-item").forEach(function (a) { a.classList.toggle("sel", Number(a.dataset.i) === searchSel); });
    }
    function wireSearch() {
        document.querySelectorAll(".top-actions .search input").forEach(function (input) {
            if (input.id || input.dataset.euiSearch) return;      // pages with their own search keep it
            input.dataset.euiSearch = "1";
            input.setAttribute("autocomplete", "off");
            input.addEventListener("input", function () { renderSearch(input); });
            input.addEventListener("focus", function () { if (input.value.trim()) renderSearch(input); });
            input.addEventListener("keydown", function (e) {
                if (e.key === "ArrowDown") { e.preventDefault(); searchSel = Math.min(searchHits.length - 1, searchSel + 1); paintSel(); }
                else if (e.key === "ArrowUp") { e.preventDefault(); searchSel = Math.max(0, searchSel - 1); paintSel(); }
                else if (e.key === "Enter") {
                    var hit = searchHits[searchSel >= 0 ? searchSel : 0];
                    if (hit) { e.preventDefault(); window.location.href = hit.href; }
                } else if (e.key === "Escape") { closeSearch(); }
            });
        });
    }
    document.addEventListener("click", function (e) {
        if (searchPanel && !e.target.closest("#eui-search") && !e.target.closest(".top-actions .search")) closeSearch();
    });


    /* ---------------- ALERTS ENGINE (task reminders, energy + security alerts, browser push) ---------------- */
    var NP_KEY = "elaraNotifPrefs";
    function prefs() {
        var p = json(NP_KEY, null) || {};
        return { push: !!p.push, security: p.security !== false, energy: p.energy !== false, tasks: p.tasks !== false };
    }
    function setPref(key, value) {
        var p = prefs(); p[key] = !!value; set(NP_KEY, JSON.stringify(p));
        updateBellDot();
    }
    function alertsList() { return json("elaraAlerts", []); }

    /* fire(kind, uniqueId, title, text, icon, color, href): shows it once, in the bell panel + a toast (+ browser push if allowed) */
    function fire(kind, id, title, text, icon, color, href) {
        if (!prefs()[kind]) return false;
        var fired = json("elaraFired", {}), now = Date.now();
        if (fired[id]) return false;
        fired[id] = now;
        Object.keys(fired).forEach(function (k) { if (now - fired[k] > 7 * 86400000) delete fired[k]; });
        set("elaraFired", JSON.stringify(fired));

        var list = alertsList();
        list.unshift({ t: now, kind: kind, title: title, text: text, icon: icon || "fa-bell", color: color || "purple", href: href || "dashboard-content.html" });
        set("elaraAlerts", JSON.stringify(list.slice(0, 30)));

        ui.toast(title + ": " + text, "info");
        try { sessionStorage.removeItem("elaraNotifSeen"); } catch (e) { /* ignore */ }
        updateBellDot();
        if (prefs().push && "Notification" in window && Notification.permission === "granted") {
            try { new Notification(title, { body: text, tag: id }); } catch (e) { /* ignore */ }
        }
        return true;
    }

    function tick() {
        var D = window.ElaraData;
        if (!D) return;
        var now = Date.now(), pr = prefs();

        // task reminders: due within 30 minutes, or overdue (up to 12 hours ago)
        if (pr.tasks) D.tasks.all().forEach(function (t) {
            if (t.status === "Completed") return;
            var due = new Date(t.date + "T" + t.time + ":00").getTime(), diff = due - now;
            if (diff <= 30 * 60000 && diff > -12 * 3600000) {
                fire("tasks", "task:" + t.id + ":" + t.date + t.time, diff > 0 ? "Task due soon" : "Task overdue",
                     t.title + (diff > 0 ? " is due at " : " was due at ") + t.time, "fa-list-check", diff > 0 ? "purple" : "red", "dashboard-tasks.html");
            }
        });

        // energy: today is well above your normal (or above the limit you set)
        if (pr.energy) {
            var today = D.energy.compute("today"), week = D.energy.compute("week");
            var avgBefore = (week.total - today.total) / 6;
            var custom = Number(get("elaraEnergyLimit")) || 0;
            var limit = custom || (avgBefore > 1 ? Math.max(6, avgBefore * 1.4) : 20);
            if (today.total > limit) {
                fire("energy", "energy:" + D.util.dayKey(), "High energy use",
                     "You\u2019ve used " + today.total.toFixed(1) + " kWh today" + (avgBefore > 1 ? " (a normal day is about " + avgBefore.toFixed(1) + " kWh)." : "."),
                     "fa-bolt", "orange", "dashboard-analytics.html");
            }
        }

        // security: a door left open for more than 15 minutes
        if (pr.security) {
            var evs = json("elaraEnergyLog", []);
            D.devices.all().forEach(function (d) {
                if (!/door/i.test(d.name) || !d.on) return;
                var last = evs.filter(function (e) { return e.id === d.id && e.on; }).pop();
                var since = last ? last.t : d.created, mins = Math.round((now - since) / 60000);
                if (mins >= 15) fire("security", "door:" + d.id + ":" + since, d.name + " left open",
                                     "It has been open for " + mins + " minutes.", "fa-door-open", "red", "dashboard-smart-home.html");
            });
            // a login from a device we have not seen before (recorded by elara-data.js)
            var alertMsg = null;
            try { alertMsg = sessionStorage.getItem("elaraNewDeviceAlert"); sessionStorage.removeItem("elaraNewDeviceAlert"); } catch (e) { /* ignore */ }
            if (alertMsg) fire("security", "device:" + now, "New device signed in", alertMsg, "fa-shield-halved", "orange", "dashboard-settings.html");
        }
    }
    window.ElaraNotify = {
        prefs: prefs, setPref: setPref, fire: fire, tick: tick,
        test: function () { ui.toast("Notifications are on. You\u2019ll see alerts like this.", "success");
                            if ("Notification" in window && Notification.permission === "granted") { try { new Notification("Elara", { body: "Push notifications are on." }); } catch (e) { /* ignore */ } } }
    };
    setTimeout(tick, 2500);
    setInterval(tick, 60000);

    /* ---------------- INIT ---------------- */
    function init() {
        applyTheme(get(THEME_KEY) || "dark");
        applyProfile();
        applyHome();
        updateBellDot();
        wireSearch();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    /* Capture phase on document: runs before the page's own click handlers,
       and stopPropagation() stops older duplicate handlers from firing. */
    document.addEventListener("click", function (event) {
        var target = event.target;
        if (!target.closest) return;

        // theme button
        if (target.closest("#themeBtn")) {
            event.stopPropagation();
            var goLight = !document.body.classList.contains("light-theme");
            set(THEME_KEY, goLight ? "light" : "dark");
            applyTheme(goLight ? "light" : "dark");
            return;
        }

        // logout
        if (target.closest(".logout")) {
            event.stopPropagation();
            ui.confirm({
                title: "Log out of Elara?", message: "You will need to sign in again to see your home.",
                confirmText: "Log out", icon: "fa-right-from-bracket", danger: false
            }).then(function (ok) {
                if (!ok) return;
                var go = function () {
                    try { sessionStorage.removeItem("elaraLoaded"); sessionStorage.removeItem("elaraNotifSeen"); } catch (e) { /* ignore */ }
                    window.location.href = (window.ELARA_CONFIG && ELARA_CONFIG.loginPage) || LOGIN_PAGE;
                };
                if (window.ElaraData && ElaraData.signOut) ElaraData.signOut().then(go, go); else go();
            });
            return;
        }

        // notification panel buttons
        var clear = target.closest(".enp-clear");
        if (clear) {
            event.stopPropagation(); event.preventDefault();
            var all = dismissedSet();
            visibleNotifications().forEach(function (n) { all.push(n.title); });
            set("elaraNotifDismissed", JSON.stringify(all));
            updateBellDot();
            var anchor = bellButtons()[0];
            if (anchor) openNotifPanel(anchor);
            return;
        }
        var x = target.closest(".enp-x");
        if (x) {
            event.stopPropagation(); event.preventDefault();
            var d = dismissedSet(); d.push(x.dataset.title);
            set("elaraNotifDismissed", JSON.stringify(d));
            var a = bellButtons()[0];
            if (a) openNotifPanel(a);
            return;
        }

        // bell button
        var bell = target.closest(".top-actions button");
        if (bell && bell.querySelector(".fa-bell")) {
            event.stopPropagation();
            if (document.getElementById("elaraNotifPanel")) closeNotifPanel();
            else openNotifPanel(bell);
            return;
        }

        // click anywhere else closes the panel
        if (!target.closest("#elaraNotifPanel")) closeNotifPanel();
    }, true);

    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNotifPanel(); });

    
window.addEventListener("storage", function (e) {
    if (e.key === THEME_KEY) {
        applyTheme(e.newValue || "dark");
    }

    var user = currentUser();
    var pictureKey = user && user.id
        ? "elaraProfileImage:" + user.id
        : "";

    if (
        e.key === "elaraProfileImage" ||
        (e.key && e.key.indexOf("elaraFirstName") === 0) ||
        (pictureKey && e.key === pictureKey)
    ) {
        applyProfile();
    }

    if (e.key && e.key.indexOf("elaraHome") === 0) {
        applyHome();
    }
});


    window.ElaraCommon = { applyTheme: applyTheme, applyProfile: applyProfile, applyHome: applyHome, getName: getName, getProfileImage: getProfileImage, ui: ui,
                           tz: homeTz, homeParts: homeParts, fmtTemp: fmtTemp, useFahrenheit: useFahrenheit };
})();
