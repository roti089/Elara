/* ==========================================================
   ELARA DATA LAYER  (loaded on every dashboard page)

   1. Finds the logged-in Supabase user and gives every user their
      OWN copy of all dashboard data (no code changes needed in the
      pages: any localStorage key starting with "elara" is namespaced).
   2. Optionally syncs that data to Supabase (table elara_user_data).
   3. Optional login guard (ELARA_CONFIG.requireLogin).
   4. Shared helpers: activity log, device registry, energy engine,
      tasks and members stores.
   Load order: elara-config.js, elara-data.js, elara-theme.js, ...
========================================================== */
(function () {
    "use strict";

    var cfg = window.ELARA_CONFIG || {};
    var realGet = Storage.prototype.getItem;
    var realSet = Storage.prototype.setItem;
    var realRemove = Storage.prototype.removeItem;

    function safeParse(s, fb) { try { var v = JSON.parse(s); return v == null ? fb : v; } catch (e) { return fb; } }

    /* ---------------------------------------------------------
       1. Who is logged in?  (Supabase stores the session in localStorage)
    --------------------------------------------------------- */
    function readSession() {
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                var match = cfg.sessionStorageKey ? k === cfg.sessionStorageKey : /^sb-.+-auth-token$/.test(k);
                if (!match) continue;
                var s = safeParse(realGet.call(localStorage, k), null);
                if (!s) continue;
                s = s.currentSession || s;
                if (s && s.user && s.user.id) return s;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    var session = readSession();
    var user = null;
    if (session) {
        var meta = session.user.user_metadata || {};
        var full = meta.full_name || meta.name || [meta.first_name, meta.last_name].filter(Boolean).join(" ") ||
                   (session.user.email ? session.user.email.split("@")[0] : "User");
        user = { id: session.user.id, email: session.user.email || "", name: full, first: String(full).split(" ")[0] };
    }

    /* HOUSEHOLD SHARING
       A person who accepted an invitation uses the OWNER'S data (tasks, devices, members ...).
       Only these personal keys stay in their own account. Keep this list in step with the
       SQL policies in elara-household-setup.sql. */
    var PERSONAL = /^elara(FirstName|LastName|Email|ProfileImage|LoginActivity)$/;
    var HOME_KEY = user ? "elaraHome:" + user.id : "";
    var dataId = user ? user.id : "";
    if (user) {
        var savedHome = realGet.call(localStorage, HOME_KEY);
        if (savedHome && /^[0-9a-f-]{36}$/i.test(savedHome)) dataId = savedHome;
    }
    var shared = !!user && dataId !== user.id;           // true = joined someone else's household
    var prefix = user ? "elara:" + dataId + ":" : "";    // household data
    var ownPrefix = user ? "elara:" + user.id + ":" : "";
    function scopeUid(k) { return shared && PERSONAL.test(k) ? user.id : dataId; }

    /* ---------------------------------------------------------
       2. Per-user localStorage (transparent to the page scripts)
    --------------------------------------------------------- */
    function mapKey(k) { return user && typeof k === "string" && k.indexOf("elara") === 0 ? "elara:" + scopeUid(k) + ":" + k : k; }
    var queue = {}, timer = null;

    Storage.prototype.getItem = function (k) { return realGet.call(this, this === localStorage ? mapKey(k) : k); };
    Storage.prototype.setItem = function (k, v) {
        realSet.call(this, this === localStorage ? mapKey(k) : k, v);
        if (this === localStorage && user && typeof k === "string" && k.indexOf("elara") === 0) enqueue(k, String(v));
    };
    Storage.prototype.removeItem = function (k) {
        realRemove.call(this, this === localStorage ? mapKey(k) : k);
        if (this === localStorage && user && typeof k === "string" && k.indexOf("elara") === 0) enqueue(k, null);
    };

    /* ---------------------------------------------------------
       3. Supabase client + sync (optional, never blocks the page)
    --------------------------------------------------------- */
    var clientPromise = null;
    function getClient() {
        if (clientPromise) return clientPromise;
        clientPromise = new Promise(function (resolve, reject) {
            if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return reject(new Error("Supabase not configured"));
            function make() { resolve(window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)); }
            if (window.supabase && window.supabase.createClient) return make();
            var s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
            s.onload = make;
            s.onerror = function () { reject(new Error("Could not load supabase-js")); };
            document.head.appendChild(s);
        });
        return clientPromise;
    }

    var homeReady = Promise.resolve();

    function enqueue(key, value) {
        if (!cfg.supabaseUrl || !user) return;
        queue[scopeUid(key) + "|" + key] = value;      // queue key = "<whose data>|<key>"
        clearTimeout(timer);
        timer = setTimeout(flush, 1500);
    }

    function doFlush() {
        var keys = Object.keys(queue);
        if (!keys.length || !user) return Promise.resolve();
        var batch = queue; queue = {};
        return getClient().then(function (client) {
            var upserts = [], removes = {};
            keys.forEach(function (qk) {
                var i = qk.indexOf("|"), uid = qk.slice(0, i), k = qk.slice(i + 1);
                if (batch[qk] === null) (removes[uid] = removes[uid] || []).push(k);
                else upserts.push({ user_id: uid, key: k, value: { v: batch[qk] }, updated_at: new Date().toISOString() });
            });
            var jobs = [];
            if (upserts.length) jobs.push(client.from("elara_user_data").upsert(upserts, { onConflict: "user_id,key" }));
            Object.keys(removes).forEach(function (uid) {
                jobs.push(client.from("elara_user_data").delete().eq("user_id", uid).in("key", removes[uid]));
            });
            return Promise.all(jobs);
        }).catch(function (e) { console.warn("[Elara] sync failed:", e.message); Object.keys(batch).forEach(function (k) { if (!(k in queue)) queue[k] = batch[k]; }); });
    }
    // nothing is uploaded until we know whose household this person belongs to
    function flush() { return homeReady.then(doFlush); }
    window.addEventListener("beforeunload", function () { if (Object.keys(queue).length) flush(); });

    /* Which household am I in?  Accepts any pending invitation sent to my email,
       then switches this browser to the owner's data if I joined one. Once per browser session. */
    function resolveHome() {
        if (!user || !cfg.supabaseUrl) return;
        var flag = "elaraHomeChecked:" + user.id;
        if (sessionStorage.getItem(flag)) return;
        homeReady = getClient().then(function (client) {
            return client.auth.getSession().then(function (r) {
                if (!r.data || !r.data.session) throw new Error("no session");
                return client.rpc("elara_accept_invites");
            });
        }).then(function (res) {
            if (res.error) throw res.error;
            sessionStorage.setItem(flag, "1");
            var rows = res.data || [];
            var target = rows.length ? rows[0].home_owner : user.id;
            if (target === dataId) return;
            if (target === user.id) realRemove.call(localStorage, HOME_KEY); else realSet.call(localStorage, HOME_KEY, target);
            // anything this browser queued for the old data set must not be uploaded; keep only personal keys
            Object.keys(queue).forEach(function (qk) { if (!PERSONAL.test(qk.slice(qk.indexOf("|") + 1))) delete queue[qk]; });
            return doFlush().then(function () { location.reload(); return new Promise(function () {}); });
        }).catch(function (e) { console.warn("[Elara] household check failed:", e.message); });
    }

    /* pull the saved data (own personal keys + the household's data), at most every 2 minutes */
    function hydrate() {
        if (!user || !cfg.supabaseUrl) return;
        var flag = "elaraHydrated:" + user.id + ":" + dataId;
        if (Date.now() - Number(sessionStorage.getItem(flag) || 0) < 120000) return;
        var ids = shared ? [user.id, dataId] : [user.id];
        homeReady.then(function () { return getClient(); }).then(function (client) {
            return client.auth.getSession().then(function (r) {
                if (!r.data || !r.data.session) throw new Error("no session");
                return client.from("elara_user_data").select("user_id,key,value").in("user_id", ids);
            });
        }).then(function (res) {
            if (res.error) throw res.error;
            sessionStorage.setItem(flag, String(Date.now()));
            var changed = false, remote = {};
            (res.data || []).forEach(function (row) {
                if (scopeUid(row.key) !== row.user_id) return;          // ignore rows that belong to the other data set
                remote[row.user_id + "|" + row.key] = true;
                var v = row.value && row.value.v, lk = "elara:" + row.user_id + ":" + row.key;
                if (typeof v === "string" && realGet.call(localStorage, lk) !== v) { realSet.call(localStorage, lk, v); changed = true; }
            });
            // push anything this browser has that the cloud doesn't yet
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                ids.forEach(function (id) {
                    var p = "elara:" + id + ":";
                    if (k.indexOf(p) !== 0) return;
                    var short = k.slice(p.length);
                    if (short.indexOf("elara") === 0 && scopeUid(short) === id && !remote[id + "|" + short]) enqueue(short, realGet.call(localStorage, k));
                });
            }
            if (changed) location.reload();
        }).catch(function (e) { console.warn("[Elara] could not load cloud data:", e.message); });
    }

    function signOut() {
        var done = function () {
            try {
                for (var i = localStorage.length - 1; i >= 0; i--) {
                    var k = localStorage.key(i);
                    if (/^sb-.+-auth-token/.test(k)) realRemove.call(localStorage, k);
                }
                sessionStorage.clear();
            } catch (e) { /* ignore */ }
        };
        return flush().then(function () { return getClient(); })
            .then(function (c) { return c.auth.signOut(); })
            .catch(function () { /* offline or not configured */ })
            .then(done);
    }

    /* ---------------------------------------------------------
       4. Login guard
    --------------------------------------------------------- */
    function toLogin() {
        try { sessionStorage.setItem("elaraBounced", String(Date.now())); } catch (e) { /* ignore */ }
        location.replace(cfg.loginPage || "../Interface/Loginpage.html");
    }
    if (cfg.requireLogin && !user) {
        // Arrived straight from Google/GitHub/etc. or an email link? The login details are in the address bar:
        // let the Supabase client read them, then reload as a logged-in page.
        var fromProvider = /access_token=|refresh_token=/.test(location.hash) || /[?&]code=/.test(location.search);
        if (fromProvider && cfg.supabaseUrl) {
            getClient().then(function (c) { return c.auth.getSession(); }).then(function (r) {
                if (r && r.data && r.data.session) { history.replaceState(null, "", location.pathname); location.reload(); }
                else toLogin();
            }).catch(toLogin);
            return;
        }
        toLogin();
        return;
    }
    if (user) {
        // make sure Settings has this person's name / email the first time
        var names = user.name.split(" ");
        [["elaraFirstName", names[0]], ["elaraLastName", names.slice(1).join(" ")], ["elaraEmail", user.email]].forEach(function (p) {
            if (p[1] && !localStorage.getItem(p[0])) localStorage.setItem(p[0], p[1]);
        });
        resolveHome();
        hydrate();
        if (cfg.requireLogin) {
            getClient().then(function (c) {
                return c.auth.getSession().then(function (r) {
                    if (r && r.data && !r.data.session) return toLogin();
                    // two-factor is switched on but this session was not verified with the code: send them to the login page to do it
                    if (c.auth.mfa && c.auth.mfa.getAuthenticatorAssuranceLevel) {
                        return c.auth.mfa.getAuthenticatorAssuranceLevel().then(function (a) {
                            if (a && a.data && a.data.nextLevel === "aal2" && a.data.currentLevel !== "aal2") toLogin();
                        });
                    }
                });
            }).catch(function () { /* keep working offline */ });
        }
    }

    /* ---------------------------------------------------------
       5. Small stores
    --------------------------------------------------------- */
    function load(key, fb) { return safeParse(localStorage.getItem(key), fb); }
    function save(key, v) { localStorage.setItem(key, JSON.stringify(v)); }
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
    var DEMO = !user;   // demo sample data only when nobody is logged in


    /* ----- sign-in history (for Settings > Login Activity) + account info ----- */
    function deviceLabel() {
        var ua = navigator.userAgent || "";
        var browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
        var os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown device";
        return browser + " on " + os;
    }
    var info = null;
    if (user && session) {
        var su = session.user, md = su.app_metadata || {};
        info = { email: user.email, created: su.created_at || null, lastSignIn: su.last_sign_in_at || null,
                 provider: md.provider || "email", providers: md.providers || [md.provider || "email"] };
        try {
            var sFlag = "elaraSessionLogged:" + user.id;
            if (!sessionStorage.getItem(sFlag)) {
                sessionStorage.setItem(sFlag, "1");
                var hist = load("elaraLoginActivity", []), sig = deviceLabel(), nowT = Date.now();
                var recent = hist[0] && hist[0].device === sig && nowT - hist[0].t < 30 * 60000;
                if (!recent) {
                    var seenBefore = hist.some(function (e) { return e.device === sig; });
                    hist.unshift({ t: nowT, device: sig, method: info.provider });
                    save("elaraLoginActivity", hist.slice(0, 30));
                    if (hist.length > 1 && !seenBefore) sessionStorage.setItem("elaraNewDeviceAlert", "A sign-in from " + sig + " was recorded on your account.");
                }
            }
        } catch (e) { /* ignore */ }
    }

    /* ----- activity log ----- */
    function log(text, icon, who) {
        var list = load("elaraActivity", []);
        list.unshift({ t: Date.now(), who: who || (user ? user.first : (localStorage.getItem("elaraFirstName") || "You")), text: text, icon: icon || "fa-bolt" });
        save("elaraActivity", list.slice(0, 60));
    }
    function activity(n) { return load("elaraActivity", []).slice(0, n || 10); }
    function ago(t) {
        var s = Math.max(0, Math.round((Date.now() - t) / 1000));
        if (s < 45) return "Just now";
        var m = Math.round(s / 60); if (m < 60) return m + " minute" + (m === 1 ? "" : "s") + " ago";
        var h = Math.round(m / 60); if (h < 24) return h + " hour" + (h === 1 ? "" : "s") + " ago";
        var d = Math.round(h / 24); return d + " day" + (d === 1 ? "" : "s") + " ago";
    }

    /* ----- tasks ----- */
    function tasks() {
        var t = load("elaraTasks", null);
        if (t) return t;
        if (!DEMO) return [];
        var now = new Date(), k = dayKey(now);
        t = [
            { id: 1, title: "Clean Kitchen", description: "Deep clean the kitchen and sanitize all surfaces.", priority: "High", assignee: "Justin", date: k, time: "17:00", status: "In Progress", progress: 65 },
            { id: 2, title: "Buy Groceries", description: "Purchase milk, bread, eggs and vegetables.", priority: "Medium", assignee: "Sarah", date: dayKey(addDays(now, 1)), time: "10:00", status: "Pending", progress: 25 },
            { id: 3, title: "Laundry", description: "Wash, dry and fold all clothes.", priority: "Low", assignee: "James", date: k, time: "09:00", status: "Completed", progress: 100 },
            { id: 4, title: "Take Out Trash", description: "Bins go out tonight.", priority: "Low", assignee: "Justin", date: k, time: "19:00", status: "Pending", progress: 0 }
        ];
        save("elaraTasks", t);
        return t;
    }
    function saveTasks(t) { save("elaraTasks", t); }

    /* ----- members ----- */
    var ROLE_PERMS = {
        owner:  { smartHome: true, tasks: true, shopping: true, analytics: true },
        adult:  { smartHome: true, tasks: true, shopping: true, analytics: true },
        member: { smartHome: true, tasks: true, shopping: true, analytics: false },
        guest:  { smartHome: false, tasks: true, shopping: false, analytics: false }
    };
    function members() {
        var m = load("elaraMembers", null);
        if (m && m.length) return m;
        if (shared) return m || [];   // joined a household: never start a new one from here
        if (user) {
            m = [{ id: 1, name: user.first, email: user.email, role: "owner", status: "online", location: "Home", avatar: "", color: "", permissions: Object.assign({}, ROLE_PERMS.owner) }];
        } else {
            m = [
                { id: 1, name: "Justin", email: "justin@example.com", role: "owner", status: "online", location: "Home", avatar: "DSC_0156.JPG", color: "" },
                { id: 2, name: "Nkosazana", email: "nkosazana@example.com", role: "adult", status: "online", location: "Home", avatar: "", color: "" },
                { id: 3, name: "Thabo", email: "thabo@example.com", role: "member", status: "away", location: "Away", avatar: "", color: "blue" },
                { id: 4, name: "Lerato", email: "lerato@example.com", role: "member", status: "online", location: "Home", avatar: "", color: "pink" },
                { id: 5, name: "Sipho", email: "sipho@example.com", role: "guest", status: "pending", location: "Invitation sent", avatar: "", color: "orange" }
            ];
        }
        m.forEach(function (x) { if (!x.permissions) x.permissions = Object.assign({}, ROLE_PERMS[x.role] || ROLE_PERMS.member); });
        save("elaraMembers", m);
        return m;
    }
    function saveMembers(m) { save("elaraMembers", m); }

    /* ---------------------------------------------------------
       6. Device registry
    --------------------------------------------------------- */
    // watts = rated power, duty = fraction of the time it really draws it while "on"
    var DEFAULT_DEVICES = [
        { name: "Main Lights",     room: "Living Room", icon: "fa-lightbulb",       type: "Light",   watts: 60,   duty: 1,   on: true },
        { name: "Smart TV",        room: "Living Room", icon: "fa-tv",              type: "Switch",  watts: 120,  duty: 1,   on: false },
        { name: "Air Conditioner", room: "Living Room", icon: "fa-fan",             type: "Switch",  watts: 1400, duty: 0.6, on: true },
        { name: "Smart Fridge",    room: "Kitchen",     icon: "fa-snowflake",       type: "Switch",  watts: 150,  duty: 0.4, on: true },
        { name: "Oven",            room: "Kitchen",     icon: "fa-fire-burner",     type: "Switch",  watts: 2200, duty: 0.7, on: false },
        { name: "Coffee Machine",  room: "Kitchen",     icon: "fa-mug-hot",         type: "Switch",  watts: 900,  duty: 1,   on: false },
        { name: "Bedroom Lights",  room: "Bedroom",     icon: "fa-lightbulb",       type: "Light",   watts: 20,   duty: 1,   on: true },
        { name: "Ceiling Fan",     room: "Bedroom",     icon: "fa-wind",            type: "Switch",  watts: 60,   duty: 1,   on: false },
        { name: "Smart Curtains",  room: "Bedroom",     icon: "fa-window-maximize", type: "Switch",  watts: 10,   duty: 0.05, on: false },
        { name: "Garage Door",     room: "Garage",      icon: "fa-door-open",       type: "Switch",  watts: 350,  duty: 0.02, on: false },
        { name: "Outdoor Lights",  room: "Garage",      icon: "fa-lightbulb",       type: "Light",   watts: 30,   duty: 1,   on: true },
        { name: "Geyser",          room: "Bathroom",    icon: "fa-fire",            type: "Switch",  watts: 3000, duty: 0.5, on: true }
    ];
    function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
    function devId(room, name) { return slug(room) + "__" + slug(name); }

    function devices() {
        var d = load("elaraDevices", null);
        if (d) {
            // camera support was removed: drop any camera saved by an earlier version
            var kept = d.filter(function (x) { return x.type !== "Camera" && !/camera/i.test(x.name); });
            if (kept.length !== d.length) { d = kept; save("elaraDevices", d); }
            return d;
        }
        var now = Date.now();
        d = DEFAULT_DEVICES.map(function (x) {
            return Object.assign({ id: devId(x.room, x.name), created: now, createdOn: x.on }, x);
        });
        save("elaraDevices", d);
        return d;
    }
    function saveDevices(d) { save("elaraDevices", d); }
    function findDevice(nameOrId, room) {
        var all = devices(), id = room ? devId(room, nameOrId) : nameOrId;
        return all.filter(function (d) { return d.id === id || (!room && d.name.toLowerCase() === String(nameOrId).toLowerCase()); })[0];
    }
    function ensureDevice(spec) {
        var all = devices();
        var id = devId(spec.room, spec.name);
        var found = all.filter(function (d) { return d.id === id; })[0];
        if (found) return found;
        var d = Object.assign({ type: "Switch", watts: guessWatts(spec.name), duty: 1, on: true, icon: "fa-plug" }, spec,
                              { id: id, created: Date.now() });
        d.createdOn = d.on;
        all.push(d); saveDevices(all);
        return d;
    }
    function guessWatts(name) {
        var n = String(name).toLowerCase();
        if (/geyser|heater/.test(n)) return 3000; if (/oven|stove/.test(n)) return 2200; if (/air|aircon|ac\b/.test(n)) return 1400;
        if (/kettle|iron|dryer/.test(n)) return 2000; if (/fridge|freezer/.test(n)) return 150; if (/tv/.test(n)) return 120;
        if (/light|lamp|bulb/.test(n)) return 20; if (/fan/.test(n)) return 60; if (/camera/.test(n)) return 8; return 50;
    }
    function removeDevice(id) { saveDevices(devices().filter(function (d) { return d.id !== id; })); }

    // log an on/off change (also feeds the activity log)
    function setDevice(id, on, opts) {
        var all = devices(), d = all.filter(function (x) { return x.id === id; })[0];
        if (!d || d.on === !!on) return d;
        d.on = !!on; saveDevices(all);
        var ev = load("elaraEnergyLog", []);
        ev.push({ t: Date.now(), id: id, on: !!on });
        save("elaraEnergyLog", ev.slice(-6000));
        if (!(opts && opts.silent)) log(d.name + " turned " + (on ? "ON" : "OFF"), d.icon);
        return d;
    }

    /* ---------------------------------------------------------
       7. Energy engine (kWh from the real on/off history)
    --------------------------------------------------------- */
    function intervalsFor(dev, evs, to) {
        var out = [], t = dev.created, on = !!dev.createdOn;
        evs.forEach(function (e) {
            if (e.t < t) return;
            if (on) out.push([t, e.t]);
            on = e.on; t = e.t;
        });
        if (on) out.push([t, to]);
        return out;
    }
    // average power (kW) a metered device really draws while it is switched on
    function meterAvgKw(m, d) {
        return m && m.nOn >= 3 ? m.sumOn / m.nOn / 1000 : (d ? d.watts * (d.duty || 1) / 1000 : 0.05);
    }
    // add kWh into hourly buckets, spread over [a, z]
    function spreadBuckets(bk, a, z, kwh) {
        if (!(kwh > 0) || z <= a) return;
        var total = z - a;
        while (a < z) {
            var dt = new Date(a), nextHour = new Date(dt); nextHour.setMinutes(0, 0, 0); nextHour.setHours(dt.getHours() + 1);
            var seg = Math.min(z, nextHour.getTime()), key = String(nextHour.getTime() - 3600000);
            bk[key] = Math.round(((bk[key] || 0) + kwh * (seg - a) / total) * 1e6) / 1e6;
            a = seg;
        }
    }

    /* A real reading from a smart switch with a power meter (CBi / Tuya).
       r = { w: watts now, e: lifetime kWh counter (optional), on: true/false }.
       The energy used since the previous reading is worked out and saved by the hour,
       so Analytics shows what the switch really measured instead of an estimate. */
    function recordReading(id, r) {
        var w = Number(r && r.w);
        if (!isFinite(w) || w < 0) return;
        var now = (r && r.t) || Date.now(), on = !!r.on;
        var e = (r.e == null || !isFinite(Number(r.e))) ? null : Number(r.e);
        var st = load("elaraMeterState", {}), buckets = load("elaraMeterKwh", {});
        var m = st[id], bk = buckets[id] = buckets[id] || {};
        if (!m) {
            st[id] = { first: now, lastT: now, lastW: w, lastE: e, lastOn: on, sumOn: on ? w : 0, nOn: on ? 1 : 0, peak: w };
        } else if (now > m.lastT + 5000) {
            var gap = now - m.lastT, dtH = gap / 3600000, kwh = 0;
            if (gap <= 15 * 60000) {
                kwh = (m.lastW + w) / 2 / 1000 * dtH;                       // page was open: average the power readings
            } else {
                var delta = (e != null && m.lastE != null) ? e - m.lastE : null;
                if (delta != null && delta >= 0 && delta <= 8 * dtH) {
                    kwh = delta;                                              // page was closed: use the meter's own energy counter
                } else {
                    var dev = devices().filter(function (x) { return x.id === id; })[0];
                    var kw = meterAvgKw(m, dev);
                    var evs = load("elaraEnergyLog", []).filter(function (x) { return x.id === id; }).sort(function (a, b) { return a.t - b.t; });
                    if (dev) intervalsFor(dev, evs, now).forEach(function (iv) {
                        var a = Math.max(iv[0], m.lastT), z = Math.min(iv[1], now);
                        if (z > a) kwh += (z - a) / 3600000 * kw;             // no counter: estimate from on/off history
                    });
                }
            }
            spreadBuckets(bk, m.lastT, now, kwh);
            m.lastT = now; m.lastW = w; m.lastOn = on;
            if (e != null) m.lastE = e;
            if (on) { m.sumOn += w; m.nOn++; }
            if (w > m.peak) m.peak = w;
        } else { return; }
        save("elaraMeterState", st); save("elaraMeterKwh", buckets);
    }

    function rangeBounds(range, now) {
        var sod = startOfDay(now).getTime();
        if (range === "today") return { from: sod, days: 1 };
        if (range === "month") return { from: addDays(sod, -29).getTime(), days: 30 };
        return { from: addDays(sod, -6).getTime(), days: 7 };
    }
    function integrate(range, to, offsetPeriods, realOnly) {
        var now = to || Date.now();
        var b = rangeBounds(range, now);
        var spanMs = b.days * 86400000;
        var from = b.from - (offsetPeriods || 0) * spanMs;
        var end = offsetPeriods ? from + spanMs : now;
        var logAll = load("elaraEnergyLog", []);
        var res = { from: from, to: end, total: 0, byDevice: {}, byRoom: {}, peak: 0, parts: { morning: 0, afternoon: 0, evening: 0, night: 0 },
                    series: new Array(range === "today" ? 24 : b.days).fill(0) };
        var meterState = load("elaraMeterState", {}), meterKwh = load("elaraMeterKwh", {});
        function addKwh(d, when, kwh) {
            var h = when.getHours();
            res.total += kwh;
            res.byDevice[d.id] = (res.byDevice[d.id] || 0) + kwh;
            res.byRoom[d.room] = (res.byRoom[d.room] || 0) + kwh;
            var part = h >= 6 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 22 ? "evening" : "night";
            res.parts[part] += kwh;
            var idx = range === "today" ? h : Math.floor((startOfDay(when).getTime() - from) / 86400000);
            if (idx >= 0 && idx < res.series.length) res.series[idx] += kwh;
        }
        function put(d, a, z, kw) {                       // constant power kw over [a, z]
            while (a < z) {
                var dt = new Date(a), nextHour = new Date(dt); nextHour.setMinutes(0, 0, 0); nextHour.setHours(dt.getHours() + 1);
                var seg = Math.min(z, nextHour.getTime());
                addKwh(d, dt, (seg - a) / 3600000 * kw);
                a = seg;
            }
        }
        devices().forEach(function (d) {
            var evs = logAll.filter(function (e) { return e.id === d.id; }).sort(function (a, c) { return a.t - c.t; });
            var kw = d.watts * (d.duty || 1) / 1000;
            var m = meterState[d.id];                      // real meter readings exist for this device
            if (realOnly && !m) return;                    // real-readings mode: devices without a meter are left out
            var limit = m ? m.first : Infinity;            // before the first reading: rated-power estimate
            if (!(realOnly && m)) intervalsFor(d, evs, now).forEach(function (iv) {
                put(d, Math.max(iv[0], from), Math.min(iv[1], end, limit), kw);
            });
            if (m) {
                var bk = meterKwh[d.id] || {};
                Object.keys(bk).forEach(function (k) {     // measured energy, saved by the hour
                    var hr = Number(k);
                    if (hr >= from && hr < end) addKwh(d, new Date(hr), bk[k]);
                });
                // since the last reading (e.g. the page is closed) while it is on: use its real average draw
                if (!offsetPeriods && d.on && now > m.lastT) put(d, Math.max(m.lastT, from), Math.min(now, end), meterAvgKw(m, d));
            }
        });
        return res;
    }
    // With a power meter connected, Analytics shows only what the meter really measured.
    // The person can switch estimates for the other devices back on (elaraIncludeEstimates = "1").
    function realOnlyMode() {
        return localStorage.getItem("elaraEnergySample") !== "1" &&
               Object.keys(load("elaraMeterState", {})).length > 0 &&
               localStorage.getItem("elaraIncludeEstimates") !== "1";
    }
    function energy(range) {
        var realOnly = realOnlyMode();
        var cur = integrate(range, null, 0, realOnly), prev = integrate(range, null, 1, realOnly);
        var tariff = Number(localStorage.getItem("elaraTariff")) || cfg.tariffPerKwh || 2.5;
        var meterNow = load("elaraMeterState", {});
        var shown = devices().filter(function (d) { return !realOnly || meterNow[d.id]; });
        var rows = shown.map(function (d) { return { id: d.id, name: d.name, room: d.room, icon: d.icon, kwh: cur.byDevice[d.id] || 0, measured: !!meterNow[d.id], watts: meterNow[d.id] ? meterNow[d.id].lastW : null }; })
            .sort(function (a, b) { return b.kwh - a.kwh; });
        var rooms = Object.keys(cur.byRoom).map(function (r) { return { room: r, kwh: cur.byRoom[r] }; }).sort(function (a, b) { return b.kwh - a.kwh; });
        var autos = load("elaraAutomations", null), autoPct = null;
        if (autos && autos.length) autoPct = Math.round(autos.filter(function (a) { return a.on; }).length / autos.length * 100);

        // the efficiency figures need real history behind them: otherwise they stay empty instead of inventing a score
        var enough = cur.total >= 0.5;
        var saving = null, deviceEff = null, overall = null;
        if (enough) {
            var peakShare = cur.parts.evening / cur.total;
            deviceEff = Math.round(Math.max(40, 100 - peakShare * 60));
            if (prev.total > 0) saving = Math.max(0, Math.round((prev.total - cur.total) / prev.total * 100));
            var bits = [deviceEff]; if (saving !== null) bits.push(Math.min(100, 70 + saving)); if (autoPct !== null) bits.push(autoPct);
            overall = Math.round(bits.reduce(function (s, v) { return s + v; }, 0) / bits.length);
        }
        return {
            range: range, total: cur.total, prevTotal: prev.total, cost: cur.total * tariff, tariff: tariff,
            devices: rows, rooms: rooms, parts: cur.parts, series: cur.series,
            active: shown.filter(function (d) { return d.on; }).length, deviceCount: shown.length,
            saving: saving, deviceEff: deviceEff, autoPct: autoPct, efficiency: overall, enough: enough,
            hasData: cur.total >= 0.005 || prev.total >= 0.005, metered: Object.keys(meterNow).length, realOnly: realOnly,
            sample: localStorage.getItem("elaraEnergySample") === "1",
            change: prev.total > 0 ? Math.round((cur.total - prev.total) / prev.total * 100) : null
        };
    }
    // fabricate a believable 30 days of use so the analytics can be demonstrated
    function generateSample(days) {
        days = days || 30;
        var all = devices(), now = Date.now(), start = addDays(startOfDay(now), -days).getTime(), ev = [];
        var pat = {
            "Geyser": [[4.5, 6.5, 1], [17, 19, 1]], "Air Conditioner": [[13, 17.5, 0.65]], "Smart TV": [[18.5, 22.5, 0.9]],
            "Main Lights": [[17.5, 22.5, 1]], "Bedroom Lights": [[6, 6.75, 1], [20.5, 22.75, 1]], "Outdoor Lights": [[18, 23, 1], [0, 5.5, 1]],
            "Oven": [[17.75, 18.75, 0.5]], "Coffee Machine": [[6.25, 6.5, 0.9]], "Ceiling Fan": [[21, 23.5, 0.4]],
            "Smart Fridge": [[0, 24, 1]], "Garage Door": [[7.5, 7.55, 0.9], [17.4, 17.45, 0.9]], "Smart Curtains": [[7, 7.05, 0.8], [18, 18.05, 0.8]]
        };
        all.forEach(function (d) { d.created = start; d.createdOn = false; });
        for (var i = 0; i < days; i++) {
            var day = addDays(start, i);
            all.forEach(function (d) {
                (pat[d.name] || []).forEach(function (w) {
                    if (Math.random() > w[2]) return;
                    var a = day.getTime() + (w[0] + (Math.random() - .5) * .4) * 3600000;
                    var z = day.getTime() + (w[1] + (Math.random() - .5) * .4) * 3600000;
                    if (a >= now) return;
                    ev.push({ t: Math.round(a), id: d.id, on: true });
                    if (z <= now && z > a) ev.push({ t: Math.round(z), id: d.id, on: false });   // still running if it ends in the future
                });
            });
        }
        ev.sort(function (a, b) { return a.t - b.t; });
        var last = {}; ev.forEach(function (e) { last[e.id] = e.on; });
        all.forEach(function (d) { if (d.id in last) d.on = last[d.id]; });
        saveDevices(all); save("elaraEnergyLog", ev.slice(-6000)); localStorage.setItem("elaraEnergySample", "1");
    }
    function clearEnergy() {
        var now = Date.now(); var all = devices();
        all.forEach(function (d) { d.created = now; d.createdOn = d.on; });
        saveDevices(all); save("elaraEnergyLog", []); if (localStorage.getItem("elaraEnergySample") !== "1") { save("elaraMeterKwh", {}); save("elaraMeterState", {}); }   // clearing sample data keeps real meter readings
        localStorage.removeItem("elaraEnergySample");
    }

    // wipe everything this person has stored (their tasks, events, members, devices ...)
    // A member of someone else's household only clears their own personal settings, never the owner's data.
    function resetData() {
        var base = shared ? ownPrefix : prefix, keys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k.indexOf(base + "elara") === 0 && (!shared || PERSONAL.test(k.slice(base.length)))) keys.push(k);
        }
        keys.forEach(function (k) {
            realRemove.call(localStorage, k);
            if (user) enqueue(k.slice(base.length), null);
        });
        return flush();
    }

    /* ----- household links (table elara_household_links) ----- */
    function linkJob(fn) {
        if (!user || shared || !cfg.supabaseUrl) return Promise.resolve(false);
        return getClient().then(fn).then(function (r) {
            if (r && r.error) { console.warn("[Elara] household link:", r.error.message); return false; }
            return true;
        }).catch(function (e) { console.warn("[Elara] household link:", e.message); return false; });
    }
    var household = {
        isOwner: !shared, ownerId: dataId,
        invite: function (email, role) {
            var em = String(email).trim().toLowerCase(), rl = role || "member";
            return linkJob(function (c) {
                return c.from("elara_household_links").insert({ owner_id: user.id, email: em, role: rl }).then(function (r) {
                    if (r.error && r.error.code === "23505")      // already invited: just refresh the role
                        return c.from("elara_household_links").update({ role: rl }).eq("owner_id", user.id).eq("email", em);
                    return r;
                });
            });
        },
        setRole: function (email, role) {
            return linkJob(function (c) { return c.from("elara_household_links").update({ role: role }).eq("owner_id", user.id).eq("email", String(email).trim().toLowerCase()); });
        },
        revoke: function (email) {
            return linkJob(function (c) { return c.from("elara_household_links").delete().eq("owner_id", user.id).eq("email", String(email).trim().toLowerCase()); });
        }
    };

    // I joined someone's household: turn my "pending" entry in their member list into a real member
    function activateSelf() {
        if (!shared || !user.email) return;
        var m = load("elaraMembers", null);
        if (!m || !m.length) return;
        var me = m.filter(function (x) { return String(x.email).toLowerCase() === user.email.toLowerCase(); })[0];
        if (!me || me.status !== "pending") return;
        me.status = "online"; me.location = "Home";
        if (!me.name) me.name = user.first;
        save("elaraMembers", m);
        log("joined the household", "fa-user-check", me.name);
    }
    activateSelf();

    window.ElaraData = {
        user: user, info: info, prefix: prefix, shared: shared, household: household, config: cfg, demo: DEMO, signOut: signOut, flush: flush, getClient: getClient, resetData: resetData,
        log: log, activity: activity, ago: ago,
        tasks: { all: tasks, save: saveTasks },
        members: { all: members, save: saveMembers, ROLE_PERMS: ROLE_PERMS },
        devices: { all: devices, save: saveDevices, find: findDevice, ensure: ensureDevice, set: setDevice, record: recordReading, remove: removeDevice, id: devId, DEFAULTS: DEFAULT_DEVICES },
        energy: { compute: energy, generateSample: generateSample, clear: clearEnergy },
        util: { dayKey: dayKey, addDays: addDays, startOfDay: startOfDay, pad: pad, load: load, save: save }
    };
})();
