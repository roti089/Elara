/* ==========================================================
   ELARA FEATURES (shared by every page)
   - Chore rotation: chores become tasks, the person rotates every week, points + streaks
   - Food expiry: suggested "best before" days and reminders
   - Prepaid electricity: units left and days left, from your meter readings
   - "Left on" thresholds for switches
   - Offline: banner + changes kept on the phone until there is signal again
   - App-icon shortcuts (?do=geyser, ?do=voice)
   - CSV downloads
   Loaded after elara-common.js.
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI, N = window.ElaraNotify || {};
    if (!D) return;
    var DAY = 86400000;
    var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function dayKey(d) { return D.util.dayKey(d || new Date()); }
    function fromKey(k) { return new Date(k + "T00:00:00"); }
    function addDaysKey(k, n) { var d = fromKey(k); d.setDate(d.getDate() + n); return dayKey(d); }
    function mondayOf(k) { var d = fromKey(k), wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dayKey(d); }
    function weeksBetween(a, b) { return Math.round((fromKey(mondayOf(b)) - fromKey(mondayOf(a))) / (7 * DAY)); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

    /* =====================================================
       1. CHORE ROTATION
       elaraChores: [{ id, title, people:[userId...], days:[0..6], time:"HH:MM", points, start:"YYYY-MM-DD",
                       on, createdBy, createdAt, skipped:["YYYY-MM-DD"] }]
       Each chore day becomes a normal task (id "c-<chore>-<date>") assigned to whoever's week it is,
       so it shows in Tasks, gets reminders and counts in Reports.
    ===================================================== */
    function chores() { return D.util.load("elaraChores", []); }
    function saveChores(list) { D.util.save("elaraChores", list); }
    function activePeople() { return D.members.active(); }
    function choreAssignee(c, date) {
        var ppl = (c.people || []).filter(function (id) { return D.members.find(id); });
        if (!ppl.length) return null;
        var w = weeksBetween(c.start || date, date);
        return ppl[((w % ppl.length) + ppl.length) % ppl.length];
    }
    function choreTaskId(c, date) { return "c-" + c.id + "-" + date; }

    var generating = false;
    function ensureChoreTasks() {
        if (generating || !D.can("tasks", "edit") || !D.hydrated) return 0;
        var list = chores().filter(function (c) { return c && c.on !== false && (c.people || []).length; });
        if (!list.length) return 0;
        if (!activePeople().length) return 0;
        generating = true;
        try {
            var tasks = D.tasks.all(), have = {}, added = 0, today = dayKey(), nowMs = Date.now();
            tasks.forEach(function (t) { have[String(t.id)] = 1; });
            list.forEach(function (c) {
                var days = (c.days && c.days.length ? c.days : [6]);
                for (var i = 0; i < 7; i++) {
                    var date = addDaysKey(today, i), wd = fromKey(date).getDay();
                    if (days.indexOf(wd) < 0) continue;
                    if ((c.skipped || []).indexOf(date) > -1) continue;
                    var id = choreTaskId(c, date);
                    if (have[id]) continue;
                    var due = new Date(date + "T" + (c.time || "09:00") + ":00").getTime();
                    if (c.createdAt && due < c.createdAt) continue;          // made after this one was due
                    if (date === today && due < nowMs - 12 * 3600000) continue;
                    var who = choreAssignee(c, date), p = who && D.members.find(who);
                    if (!p) continue;
                    tasks.push({ id: id, choreId: c.id, title: c.title, description: "Chore rotation: " + p.name + "'s turn this week • " + (c.points || 1) + " point" + ((c.points || 1) === 1 ? "" : "s"),
                                 priority: "Medium", assigneeId: p.userId, assignee: p.name, date: date, time: c.time || "09:00", status: "Pending", progress: 0,
                                 points: c.points || 1, createdBy: c.createdBy || D.me().id, createdByName: "Chore rotation", createdAt: nowMs });
                    have[id] = 1; added++;
                }
            });
            if (added) D.tasks.save(tasks);
            return added;
        } finally { generating = false; }
    }
    /* after a chore is edited or deleted: drop its future tasks nobody has started, then make them again */
    function resetFutureChoreTasks(choreId) {
        var today = dayKey();
        D.tasks.save(D.tasks.all().filter(function (t) {
            return !(t.choreId === choreId && t.date >= today && t.status === "Pending" && !(t.progress > 0));
        }));
    }
    function skipChoreDay(choreId, date) {
        var list = chores(), c = list.filter(function (x) { return x.id === choreId; })[0];
        if (!c) return;
        c.skipped = (c.skipped || []).filter(function (d) { return d >= addDaysKey(dayKey(), -14); });
        if (c.skipped.indexOf(date) < 0) c.skipped.push(date);
        saveChores(list);
    }
    /* points and streaks, from completed chore tasks */
    function choreBoard() {
        var today = dayKey(), thisWeek = mondayOf(today), tasks = D.tasks.all().filter(function (t) { return t.choreId; });
        var out = {};
        activePeople().forEach(function (p) { out[p.userId] = { id: p.userId, name: p.isMe ? p.name + " (you)" : p.name, week: 0, month: 0, total: 0, streak: 0, done: 0, open: 0 }; });
        var fourWeeks = addDaysKey(thisWeek, -21), weeks = {};
        tasks.forEach(function (t) {
            var pts = Number(t.points) || 1, wk = mondayOf(t.date);
            if (t.status === "Completed" && t.completedBy && out[t.completedBy]) {
                var r = out[t.completedBy]; r.total += pts; r.done++;
                if (wk === thisWeek) r.week += pts;
                if (t.date >= fourWeeks) r.month += pts;
            }
            if (t.status !== "Completed" && wk === thisWeek && out[t.assigneeId]) out[t.assigneeId].open++;
            // per person per week: did they do everything that was theirs?
            if (!out[t.assigneeId]) return;
            var key = t.assigneeId + "|" + wk;
            weeks[key] = weeks[key] || { ok: 0, fail: 0 };
            if (t.status === "Completed") weeks[key].ok++;
            else if (t.date < today) weeks[key].fail++;
        });
        Object.keys(out).forEach(function (id) {
            var streak = 0;
            for (var w = 0; w < 26; w++) {
                var wk = addDaysKey(thisWeek, -7 * w), st = weeks[id + "|" + wk];
                if (!st) continue;                         // nothing of theirs that week: doesn't break the streak
                if (st.fail) break;
                if (st.ok) streak++;
            }
            out[id].streak = streak;
        });
        return Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return b.week - a.week || b.month - a.month || b.streak - a.streak || a.name.localeCompare(b.name); });
    }
    function describeChore(c) {
        var days = (c.days && c.days.length ? c.days : [6]).slice().sort();
        var dtxt = days.length === 7 ? "Every day" : days.join() === "1,2,3,4,5" ? "Weekdays" : days.map(function (d) { return DAYS[d]; }).join(", ");
        var now = choreAssignee(c, dayKey()), next = choreAssignee(c, addDaysKey(dayKey(), 7));
        var pn = function (id) { var p = id && D.members.find(id); return p ? (p.isMe ? "You" : p.name) : "Nobody"; };
        return { when: dtxt + " at " + (c.time || "09:00"), now: pn(now), next: pn(next), nowId: now };
    }
    var choreTimer = null;
    function scheduleChores() { clearTimeout(choreTimer); choreTimer = setTimeout(ensureChoreTasks, 1200); }
    D.onChange(function (keys) {
        if (keys.indexOf("elaraChores") > -1 || keys.indexOf("hydrated") > -1 || keys.indexOf("roster") > -1) scheduleChores();
    });
    D.whenHydrated().then(scheduleChores);
    setInterval(function () { if (!document.hidden) ensureChoreTasks(); }, 30 * 60000);

    /* =====================================================
       2. FOOD EXPIRY
       Pantry items can have expires:"YYYY-MM-DD". Elara suggests a date from the kind of food.
    ===================================================== */
    var SHELF = [
        [/\b(fish|hake|snoek|prawn|seafood)\b/, 2], [/\b(mince|chicken|beef|pork|lamb|wors|boerewors|sausage|meat|steak|chops|polony|viennas?|bacon|ham)\b/, 3],
        [/\b(milk|maas|amasi|cream)\b/, 7], [/\b(yog(h)?urt)\b/, 14], [/\b(bread|rolls?|buns?|vetkoek|muffins?)\b/, 5], [/\b(eggs?)\b/, 21],
        [/\b(cheese)\b/, 21], [/\b(butter|margarine|rama|flora)\b/, 45], [/\b(lettuce|spinach|salad|herbs|coriander|berries|strawberr(y|ies)|mushrooms?)\b/, 5],
        [/\b(bananas?|tomato(es)?|avocados?|pears?|grapes?|peaches?|mangoes?)\b/, 6], [/\b(apples?|oranges?|naartjies?|lemons?|carrots?|cabbage|butternut|pumpkin|peppers?|cucumber|broccoli)\b/, 12],
        [/\b(potato(es)?|onions?|garlic|sweet potato(es)?)\b/, 21], [/\b(juice)\b/, 10], [/\b(left ?overs?|cooked)\b/, 3]
    ];
    function suggestExpiryDays(name, category) {
        if (category && category !== "Groceries") return null;
        var n = norm(name);
        for (var i = 0; i < SHELF.length; i++) if (SHELF[i][0].test(n)) return SHELF[i][1];
        return null;                                         // tins, rice, maize meal...: no date needed
    }
    function suggestExpiry(name, category) { var d = suggestExpiryDays(name, category); return d == null ? "" : addDaysKey(dayKey(), d); }
    function expiryInfo(x) {
        if (!x || !x.expires) return null;
        var days = Math.round((fromKey(x.expires) - fromKey(dayKey())) / DAY);
        if (days < 0) return { days: days, cls: "expired", label: "Expired " + (-days === 1 ? "yesterday" : -days + " days ago") };
        if (days === 0) return { days: 0, cls: "today", label: "Use today" };
        if (days === 1) return { days: 1, cls: "soon", label: "Use by tomorrow" };
        if (days <= 3) return { days: days, cls: "soon", label: "Use within " + days + " days" };
        return { days: days, cls: "", label: "Good for " + days + " days" };
    }
    function expiringSoon(maxDays) {
        return D.util.load("elaraPantry", []).filter(function (x) { return !x.usedUp && x.expires; })
            .map(function (x) { return { item: x, info: expiryInfo(x) }; })
            .filter(function (r) { return r.info && r.info.days <= (maxDays == null ? 2 : maxDays); })
            .sort(function (a, b) { return a.info.days - b.info.days; });
    }

    /* =====================================================
       3. PREPAID ELECTRICITY
       elaraPrepaid: { entries:[{ id, t, kind:"buy"|"reading", units, amount, by, byName }], warnDays }
       "reading" = what the meter shows right now (units left). Readings are what make this accurate:
       the meter counts the whole house, the smart switches only measure what's plugged into them.
    ===================================================== */
    function prepaid() { var p = D.util.load("elaraPrepaid", null); return p && Array.isArray(p.entries) ? p : { entries: [], warnDays: 3 }; }
    function savePrepaid(p) { D.util.save("elaraPrepaid", { entries: p.entries.slice(-200), warnDays: p.warnDays || 3 }); }
    function prepaidStatus() {
        var p = prepaid(), es = p.entries.slice().sort(function (a, b) { return a.t - b.t; }), now = Date.now();
        var readings = es.filter(function (e) { return e.kind === "reading"; }), buys = es.filter(function (e) { return e.kind === "buy"; });
        var res = { setUp: es.length > 0, entries: es, warnDays: p.warnDays || 3, balance: null, perDay: null, daysLeft: null, basis: null, lastReading: null, spent30: 0, units30: 0 };
        buys.forEach(function (b) { if (now - b.t <= 30 * DAY) { res.spent30 += Number(b.amount) || 0; res.units30 += Number(b.units) || 0; } });
        // daily use from pairs of readings (what was used = before + bought in between - after)
        var used = 0, days = 0;
        for (var i = 1; i < readings.length; i++) {
            var a = readings[i - 1], b = readings[i];
            if (now - b.t > 45 * DAY) continue;
            var dt = (b.t - a.t) / DAY; if (dt < 0.4) continue;
            var bought = buys.filter(function (x) { return x.t > a.t && x.t <= b.t; }).reduce(function (s, x) { return s + (Number(x.units) || 0); }, 0);
            var u = a.units + bought - b.units;
            if (u < 0 || u / dt > 200) continue;            // a typo, or a reading taken before loading a token
            used += u; days += dt;
        }
        if (days >= 0.9) { res.perDay = used / days; res.basis = "meter"; }
        else {
            var wk = D.energy.compute("week");
            if (wk.hasData && wk.total > 0) { res.perDay = wk.total / 7; res.basis = "switches"; }
        }
        var last = readings[readings.length - 1];
        if (last) {
            res.lastReading = last;
            var after = buys.filter(function (x) { return x.t > last.t; }).reduce(function (s, x) { return s + (Number(x.units) || 0); }, 0);
            res.balance = Math.max(0, last.units + after - (res.perDay || 0) * (now - last.t) / DAY);
        }
        if (res.balance != null && res.perDay > 0.05) res.daysLeft = res.balance / res.perDay;
        return res;
    }

    /* =====================================================
       4. "LEFT ON" ALERTS: hours before Elara warns (0 = never). Per device, with sensible defaults.
    ===================================================== */
    var LEFT_ON = { Geyser: 4, Heater: 3, "Air conditioner": 8, Pool: 10, Plug: 0, Light: 0, Fridge: 0, Gate: 0, Other: 0 };
    function leftOnHours(d) { return d && d.leftOnHours != null ? Number(d.leftOnHours) : (LEFT_ON[d && d.type] || 0); }
    function leftOnNow() {
        var out = [];
        D.devices.all().forEach(function (d) {
            var h = leftOnHours(d), st = D.devices.live(d);
            if (!h || !st || !st.on || !st.since) return;
            var hrs = (Date.now() - st.since) / 3600000;
            if (hrs >= h) out.push({ device: d, hours: hrs, since: st.since });
        });
        return out;
    }
    function hoursText(h) { var r = Math.floor(h); return r + " hour" + (r === 1 ? "" : "s"); }

    /* in-app reminders while Elara is open (the server sends the same ones as push notifications) */
    function tick() {
        if (!N.fire) return;
        var pr = N.prefs ? N.prefs() : {};
        if (pr.shopping !== false && D.can("shopping")) expiringSoon(1).forEach(function (r) {
            N.fire("shopping", "expiry:" + r.item.id + ":" + r.item.expires, r.info.days < 0 ? "Food has expired" : "Use it soon",
                r.item.name + ": " + r.info.label.toLowerCase() + ".", "fa-hourglass-half", r.info.days <= 0 ? "red" : "orange", "dashboard-shopping.html#pantryPanel");
        });
        if (pr.energy !== false && D.can("smartHome")) {
            var s = prepaidStatus();
            if (s.daysLeft != null && s.daysLeft <= s.warnDays) {
                var d = Math.max(0, Math.floor(s.daysLeft));
                N.fire("energy", "prepaid:" + (s.lastReading ? s.lastReading.id : "x") + ":" + (d <= 1 ? 1 : s.warnDays), "Electricity running low",
                    "About " + Math.round(s.balance) + " units left: " + (d < 1 ? "less than a day" : "about " + d + " day" + (d === 1 ? "" : "s")) + " at your usual use.", "fa-bolt", "orange", "dashboard-smart-home.html#prepaidPanel");
            }
        }
        if (pr.smartHome !== false && D.can("smartHome")) leftOnNow().forEach(function (x) {
            N.fire("smartHome", "lefton:" + x.device.id + ":" + x.since, x.device.name + " is still on",
                x.device.name + " has been on for " + hoursText(x.hours) + ".", "fa-plug-circle-exclamation", "orange", "dashboard-smart-home.html");
        });
    }
    setTimeout(tick, 4000);
    setInterval(function () { if (!document.hidden) tick(); }, 5 * 60000);

    /* =====================================================
       5. OFFLINE: say so, and say when it's synced again
    ===================================================== */
    var offBar = null;
    function offlineBar() {
        var off = navigator.onLine === false;
        if (!offBar) {
            offBar = document.createElement("div");
            offBar.className = "elara-offline";
            offBar.setAttribute("role", "status");
            document.body.appendChild(offBar);
        }
        offBar.innerHTML = '<i class="fa-solid fa-wifi"></i> You’re offline. ' + (D.user ? "What you add is saved on this device and syncs when you’re back online." : "Some things won’t load until you’re back online.");
        offBar.classList.toggle("show", off);
        document.body.classList.toggle("is-offline", off);
    }
    window.addEventListener("offline", offlineBar);
    window.addEventListener("online", function () {
        offlineBar();
        var n = D.pending ? D.pending() : 0;
        if (n && D.user) { UI.toast("Back online. Syncing your changes...", "info"); D.flush().then(function () { if (!D.pending()) UI.toast("All changes synced."); }); }
    });
    D.onChange(function (k) { if (k.indexOf("sync") > -1 || navigator.onLine === false) offlineBar(); });
    if (navigator.onLine === false) setTimeout(offlineBar, 300);

    /* =====================================================
       6. APP-ICON SHORTCUTS: ?do=geyser, ?do=voice
    ===================================================== */
    function geyserShortcut() {
        if (!D.can("smartHome", "edit")) return UI.toast("You can't switch devices in this home.", "error");
        var g = D.devices.all().filter(function (d) { return d.type === "Geyser"; });
        if (!g.length) return UI.toast("No geyser yet. Set a switch's type to Geyser on the Smart Home page.", "error");
        var on = g.some(function (d) { return d.on; });
        UI.confirm({ title: "Geyser is " + (on ? "ON" : "OFF"), message: "Turn " + (g.length > 1 ? "the geysers" : g[0].name) + " " + (on ? "off" : "on") + "?",
                     confirmText: "Turn " + (on ? "off" : "on"), danger: on, icon: "fa-fire" }).then(function (ok) {
            if (!ok) return;
            Promise.all(g.filter(function (d) { return d.on === on; }).map(function (d) { return D.devices.switch(d.id, !on); }))
                .then(function () { UI.toast("Geyser turned " + (on ? "OFF" : "ON") + ".", on ? "info" : "success"); })
                .catch(function (e) { UI.toast("Couldn't switch the geyser: " + e.message, "error"); });
        });
    }
    (function shortcuts() {
        var m = location.search.match(/[?&]do=([a-z-]+)/);
        if (!m) return;
        try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* ignore */ }
        setTimeout(function () {
            if (m[1] === "geyser") geyserShortcut();
            else if (m[1] === "voice") {
                var v = document.getElementById("voiceBtn");
                if (!v) return UI.toast("Voice commands are off. Turn them on in Settings > Smart Home & Voice.", "info");
                // the microphone needs a tap, so ask for one
                UI.confirm({ title: "Talk to Elara", message: "Tap Start, then say something like “add milk to the shopping list”.", confirmText: "Start listening", danger: false, icon: "fa-microphone" })
                    .then(function (ok) { if (ok) v.click(); });
            }
        }, 900);
    })();

    /* =====================================================
       7. CSV downloads
    ===================================================== */
    function csvCell(v) {
        if (v == null) return "";
        var s = String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;            // stop spreadsheets running it as a formula
        return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function downloadCsv(name, header, rows) {
        var text = [header].concat(rows).map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
        return rows.length;
    }


    /* =====================================================
       8. RECEIPT READING (Tesseract.js runs on the phone itself: no server, no cost)
       The first scan downloads the reading engine and English data (about 15 MB), then it's cached.
    ===================================================== */
    var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js", tessLoading = null;
    function loadTesseract() {
        if (window.Tesseract) return Promise.resolve(window.Tesseract);
        if (tessLoading) return tessLoading;
        tessLoading = new Promise(function (res, rej) {
            var sc = document.createElement("script");
            sc.src = TESS_URL; sc.async = true;
            sc.onload = function () { window.Tesseract ? res(window.Tesseract) : rej(new Error("reader didn't load")); };
            sc.onerror = function () { tessLoading = null; sc.remove(); rej(new Error("Couldn't download the receipt reader. Check your connection.")); };
            document.head.appendChild(sc);
        });
        return tessLoading;
    }
    /* shrink big phone photos (faster, and Tesseract reads ~1500px wide receipts best) */
    function prepareImage(file) {
        return new Promise(function (res) {
            var img = new Image(), url = URL.createObjectURL(file);
            img.onload = function () {
                var max = 1600, sc = Math.min(1, max / Math.max(img.width, img.height));
                var c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
                var g = c.getContext("2d"); g.filter = "grayscale(1) contrast(1.35)"; g.drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url); res(c);
            };
            img.onerror = function () { URL.revokeObjectURL(url); res(file); };
            img.src = url;
        });
    }
    function readReceipt(file, onProgress) {
        return loadTesseract().then(function (T) {
            return prepareImage(file).then(function (src) {
                return T.recognize(src, "eng", { logger: function (m) { if (onProgress && m && m.status === "recognizing text") onProgress(Math.round((m.progress || 0) * 100)); } });
            });
        }).then(function (r) { return (r && r.data && r.data.text) || ""; });
    }

    var STORES = [["Checkers", /checkers/i], ["Shoprite", /shoprite/i], ["Pick n Pay", /pick\s*n\s*pay|\bpnp\b/i], ["Woolworths", /woolworths|woolies/i], ["Spar", /\bspar\b/i],
                  ["Makro", /makro/i], ["Game", /\bgame\b/i], ["Clicks", /clicks/i], ["Dis-Chem", /dis-?chem/i], ["Food Lover's Market", /food\s*lover/i], ["Boxer", /boxer/i], ["OK Foods", /\bok\s*foods?\b/i], ["Usave", /u-?save/i]];
    var NOT_ITEM = /\b(sub\s*-?total|total|vat|tax|change|cash|card|tender|balance|amount\s*due|due|savings?|you saved|discount|rounding|tip|points|smart\s*shopper|xtra\s*savings|loyalty|tel|phone|vat\s*no|reg\s*no|invoice|receipt|till|cashier|thank|www\.|\.co\.za|visa|mastercard|debit|credit|approved|auth|ref|qty|items?\s*sold|net)\b/i;
    function money2(s) { return Number(String(s).replace(/\s/g, "").replace(",", ".")); }
    function parseReceipt(text) {
        var lines = String(text || "").split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(function (l) { return l.length > 1; });
        var out = { store: "", total: null, date: "", items: [] };
        var head = lines.slice(0, 8).join(" ");
        for (var i = 0; i < STORES.length; i++) if (STORES[i][1].test(head) || STORES[i][1].test(lines.join(" "))) { out.store = STORES[i][0]; break; }
        var dm = String(text).match(/\b(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/) || String(text).match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2}|\d{2})\b/);
        if (dm) {
            var y, mo, d;
            if (dm[1].length === 4) { y = +dm[1]; mo = +dm[2]; d = +dm[3]; } else { d = +dm[1]; mo = +dm[2]; y = +dm[3]; if (y < 100) y += 2000; }
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) { var k = y + "-" + pad(mo) + "-" + pad(d); if (k <= dayKey() && k >= addDaysKey(dayKey(), -400)) out.date = k; }
        }
        var totals = [];
        lines.forEach(function (l, idx) {
            var m = l.match(/(-?R?\s?\d{1,5}[.,]\d{2})\s*[A-Z*#]{0,2}\s*$/);
            if (!m) return;
            var price = money2(m[1].replace(/R/i, ""));
            if (!isFinite(price)) return;
            if (/\btotal\b/i.test(l) && !/sub\s*-?total/i.test(l)) { totals.push(price); return; }
            if (NOT_ITEM.test(l) || price <= 0 || price > 20000) return;
            var name = l.slice(0, m.index).replace(/^\d{5,}\s*/, "").replace(/\b\d{6,}\b/g, "").trim();
            var qty = 1, q = name.match(/(?:^|\s)(\d{1,2})\s*[x@*]\s*(?:R?\s?\d{1,5}[.,]\d{2})?\s*$/i) || name.match(/^(\d{1,2})\s*[x@*]\s+/i);
            if (q) { qty = Math.max(1, Math.min(99, +q[1])); name = name.replace(q[0], " ").trim(); }
            // "2 @ 19.99" on its own line belongs to the line above
            if ((!name || !/[a-z]{2,}/i.test(name)) && out.items.length && /@|x/i.test(l)) {
                var prev = out.items[out.items.length - 1], qq = l.match(/(\d{1,2})\s*[x@*]/i);
                if (qq) { prev.qty = Math.max(1, +qq[1]); prev.price = price; prev.each = Math.round(price / prev.qty * 100) / 100; }
                return;
            }
            name = name.replace(/[^A-Za-z0-9&'%. -]/g, " ").replace(/\s+/g, " ").trim();
            if (!/[a-z]{3,}/i.test(name) || name.length > 60) return;
            out.items.push({ line: idx, name: name, qty: qty, price: price, each: Math.round(price / qty * 100) / 100 });
        });
        if (totals.length) out.total = Math.max.apply(null, totals);
        else if (out.items.length) out.total = Math.round(out.items.reduce(function (a, b) { return a + b.price; }, 0) * 100) / 100;
        return out;
    }
    /* which of your things is this receipt line? ("CLOVER FRESH MILK 2L" -> "Milk") */
    function words(s) { return norm(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(function (w) { return w.length >= 3 && !/^\d+(ml|l|g|kg)?$/.test(w); }); }
    function matchLine(line, candidates) {
        var lw = words(line), best = null, bestScore = 0;
        candidates.forEach(function (c) {
            var cw = words(c.name); if (!cw.length) return;
            var hit = cw.filter(function (w) { return lw.some(function (x) { return x === w || (w.length >= 4 && x.indexOf(w.slice(0, Math.max(4, w.length - 1))) === 0) || (x.length >= 4 && w.indexOf(x) === 0); }); }).length;
            var score = hit / cw.length;
            if (score > bestScore || (score === bestScore && best && cw.length > words(best.name).length)) { bestScore = score; best = c; }
        });
        return bestScore >= 0.5 ? { item: best, score: bestScore } : null;
    }

    window.ElaraFeatures = {
        util: { dayKey: dayKey, addDaysKey: addDaysKey, mondayOf: mondayOf, esc: esc, norm: norm, DAYS: DAYS },
        chores: { all: chores, save: saveChores, assignee: choreAssignee, ensure: ensureChoreTasks, resetFuture: resetFutureChoreTasks, skip: skipChoreDay, board: choreBoard, describe: describeChore },
        expiry: { suggest: suggestExpiry, suggestDays: suggestExpiryDays, info: expiryInfo, soon: expiringSoon },
        prepaid: { get: prepaid, save: savePrepaid, status: prepaidStatus },
        leftOn: { hours: leftOnHours, now: leftOnNow, DEFAULTS: LEFT_ON },
        csv: downloadCsv,
        receipt: { read: readReceipt, parse: parseReceipt, match: matchLine, load: loadTesseract },
        tick: tick
    };
})();
