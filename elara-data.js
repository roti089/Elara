/* ==========================================================
   ELARA DATA LAYER  (loaded on every dashboard page)

   1. Finds the logged-in Supabase user. Every "elara..." localStorage key is
      stored per household (or per person for personal keys) without the pages
      having to know about it.
   2. Syncs with Supabase (table elara_user_data). When two people change the
      same thing at once their changes are MERGED, not overwritten, and every
      open screen updates live (Supabase Realtime).
   3. Household sharing + permissions (owner decides who may view / edit what).
   4. Shared stores: activity log, tasks, roster, presence, availability,
      device registry, energy engine, notifications, backups.
   Load order: elara-config.js, elara-data.js, elara-theme.js, elara-common.js, page script
========================================================== */
(function () {
    "use strict";

    var cfg = window.ELARA_CONFIG || {};
    var TABLE = "elara_user_data";
    var realGet = Storage.prototype.getItem;
    var realSet = Storage.prototype.setItem;
    var realRemove = Storage.prototype.removeItem;

    function safeParse(s, fb) { try { var v = JSON.parse(s); return v == null ? fb : v; } catch (e) { return fb; } }
    function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function lsGet(k) { try { return realGet.call(localStorage, k); } catch (e) { return null; } }
    function lsSet(k, v) { try { realSet.call(localStorage, k, v); return true; } catch (e) { console.warn("[Elara] storage full:", e.message); return false; } }
    function lsDel(k) { try { realRemove.call(localStorage, k); } catch (e) { /* ignore */ } }
    function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
    function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }

    /* ---------------------------------------------------------
       1. Who is logged in?  (Supabase keeps the session in localStorage)
    --------------------------------------------------------- */
    function readSession() {
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                var match = cfg.sessionStorageKey ? k === cfg.sessionStorageKey : /^sb-.+-auth-token$/.test(k);
                if (!match) continue;
                var s = safeParse(lsGet(k), null);
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
        user = { id: session.user.id, email: (session.user.email || "").toLowerCase(), name: String(full).trim(), first: String(full).trim().split(/\s+/)[0] };
    }

    /* ---------------------------------------------------------
       2. Whose data?  Personal keys stay with the person; local-only keys never leave this browser;
          everything else belongs to the household (the owner's account).
          Keep PERSONAL in step with elara_is_personal() in elara-setup.sql.
    --------------------------------------------------------- */
    var PERSONAL = /^elara(FirstName|LastName|Email|Phone|ProfileImage|LoginActivity|Theme|NotifPrefs|LocationConsent|MyLocation|VoicePrefs)(:.*)?$/;
    var LOCAL_ONLY = /^elara(Alerts|Fired|NotifDismissed|RosterCache|AccessCache|BackupCheck|Hydrated|Base|Home:|ReceiptFiles|PendingLocal|ImportLog|CalendarLinks|EnergyCache|Sun:)/;

    var HOME_KEY = user ? "elaraHome:" + user.id : "";
    var ACCESS_KEY = user ? "elaraAccessCache:" + user.id : "";
    var dataId = user ? user.id : "";
    if (user) {
        var savedHome = lsGet(HOME_KEY);
        if (savedHome && /^[0-9a-f-]{36}$/i.test(savedHome)) dataId = savedHome;
    }
    var shared = !!user && dataId !== user.id;          // true = joined someone else's household
    var access = safeParse(ACCESS_KEY ? lsGet(ACCESS_KEY) : null, null);
    if (!access || access.ownerId !== dataId) access = { ownerId: dataId, role: shared ? "member" : "owner", perms: shared ? {} : null };

    function synced(k) { return typeof k === "string" && k.indexOf("elara") === 0 && !LOCAL_ONLY.test(k); }
    function scopeUid(k) { return PERSONAL.test(k) || LOCAL_ONLY.test(k) ? user.id : dataId; }
    function fullKey(uid, k) { return "elara:" + uid + ":" + k; }
    function mapKey(k) { return user && typeof k === "string" && k.indexOf("elara") === 0 ? fullKey(scopeUid(k), k) : k; }

    /* which part of the home a key belongs to (mirror of elara_key_area() in SQL) */
    function keyArea(k) {
        if (k === "elaraTasks") return "tasks";
        if (/^elara(ShoppingItems|CartItems|Receipts|Warranties|ShoppingActivities|Pantry)$/.test(k)) return "shopping";
        if (/^elara(Schedules|ScheduleLog|CalendarSources)$/.test(k)) return "schedule";
        if (/^elara(Devices|EnergyLog|MeterState|MeterKwh|Automations|AutomationRuns|CbiLinked|EnergySample|IncludeEstimates|Tariff)$/.test(k)) return "smartHome";
        if (/^elara(Activity|Presence|Availability)$/.test(k)) return "common";
        return "home";
    }

    /* ---------------------------------------------------------
       3. Permissions.  Owner: everything.  Member: what the owner granted.
          level: "view" or "edit".  Areas: tasks shopping schedule smartHome analytics reports home members common
    --------------------------------------------------------- */
    var AREAS = ["tasks", "shopping", "schedule", "smartHome", "analytics", "reports"];
    var ROLE_PERMS = {
        adult:  { tasks: "edit", shopping: "edit", schedule: "edit", smartHome: "edit", analytics: "view", reports: "view" },
        member: { tasks: "edit", shopping: "edit", schedule: "edit", smartHome: "edit", analytics: "none", reports: "none" },
        guest:  { tasks: "view", shopping: "none", schedule: "view", smartHome: "none", analytics: "none", reports: "none" }
    };
    function isOwner() { return !user || !shared; }
    function levelOf(area) {
        if (isOwner()) return "edit";
        if (area === "common") return "edit";
        if (area === "home" || area === "members" || area === "dashboard" || area === "settings") return "view";
        var p = access.perms || {};
        return p[area] === "edit" || p[area] === "view" ? p[area] : "none";
    }
    function can(area, level) {
        var l = levelOf(area);
        if (level === "edit") return l === "edit";
        if (l !== "none") return true;
        // analytics / reports read device, task, shopping and schedule data
        if (area === "smartHome" && (levelOf("analytics") !== "none" || levelOf("reports") !== "none")) return true;
        return false;
    }
    function canWriteKey(k) { return PERSONAL.test(k) || can(keyArea(k), "edit"); }
    function canReadKey(k) {
        if (PERSONAL.test(k)) return true;
        var a = keyArea(k);
        if (can(a, "view")) return true;
        if (a === "smartHome" && (can("analytics") || can("reports"))) return true;
        if ((a === "tasks" || a === "shopping" || a === "schedule") && can("reports")) return true;
        return false;
    }

    /* ---------------------------------------------------------
       4. Change events: pages call ElaraData.onChange(fn) to redraw when data changes
          (another member saved something, or the first cloud load finished).
    --------------------------------------------------------- */
    var listeners = [], pendingKeys = {}, emitTimer = null;
    function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }
    function emit(keys) {
        (keys || []).forEach(function (k) { pendingKeys[k] = 1; });
        clearTimeout(emitTimer);
        emitTimer = setTimeout(function () {
            var list = Object.keys(pendingKeys); pendingKeys = {};
            if (!list.length) return;
            listeners.slice().forEach(function (fn) { try { fn(list); } catch (e) { console.error("[Elara] change handler:", e); } });
            try { document.dispatchEvent(new CustomEvent("elara:change", { detail: { keys: list } })); } catch (e) { /* ignore */ }
        }, 60);
    }

    /* ---------------------------------------------------------
       5. Transparent per-user localStorage + change queue
    --------------------------------------------------------- */
    var dirty = {}, flushTimer = null;
    function markDirty(uid, k) { dirty[uid + "|" + k] = 1; clearTimeout(flushTimer); flushTimer = setTimeout(flush, 800); }

    Storage.prototype.getItem = function (k) { return realGet.call(this, this === localStorage ? mapKey(k) : k); };
    Storage.prototype.setItem = function (k, v) {
        if (this !== localStorage) return realSet.call(this, k, v);
        var isElara = user && typeof k === "string" && k.indexOf("elara") === 0;
        if (isElara && synced(k) && !canWriteKey(k)) {
            readOnlyWarning(k);
            return;                                           // not allowed: keep the screen honest by not saving
        }
        realSet.call(this, mapKey(k), v);
        if (isElara && synced(k) && cfg.supabaseUrl) markDirty(scopeUid(k), k);
    };
    Storage.prototype.removeItem = function (k) {
        if (this !== localStorage) return realRemove.call(this, k);
        var isElara = user && typeof k === "string" && k.indexOf("elara") === 0;
        if (isElara && synced(k) && !canWriteKey(k)) { readOnlyWarning(k); return; }
        realRemove.call(this, mapKey(k));
        if (isElara && synced(k) && cfg.supabaseUrl) markDirty(scopeUid(k), k);
    };

    var warnedAt = 0;
    var AREA_NAMES = { tasks: "Tasks", shopping: "Shopping", schedule: "Schedule", smartHome: "Smart Home", home: "home settings" };
    function readOnlyWarning(k) {
        if (Date.now() - warnedAt < 4000) return;
        warnedAt = Date.now();
        var msg = "You can view " + (AREA_NAMES[keyArea(k)] || "this") + " but not change it. Ask the home owner for edit access.";
        setTimeout(function () { if (window.ElaraUI) ElaraUI.toast(msg, "error"); }, 0);
    }

    /* last version we know the cloud has (for three-way merging) */
    function baseKey(uid, k) { return "elaraBase|" + uid + "|" + k; }
    function getBase(uid, k) { return lsGet(baseKey(uid, k)); }
    function setBase(uid, k, v) { if (v == null) lsDel(baseKey(uid, k)); else lsSet(baseKey(uid, k), v); }

    /* ---------------------------------------------------------
       6. Three-way merge: base (last synced), mine, theirs.
          Lists merge item by item (by id), objects key by key.
    --------------------------------------------------------- */
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
    function itemKey(x) {
        if (x && typeof x === "object") {
            if (x.k != null) return "k:" + x.k;
            if (x.id != null && !("on" in x && "t" in x)) return "i:" + x.id;
        }
        return "j:" + JSON.stringify(x);
    }
    function index(arr) { var m = {}; (arr || []).forEach(function (x) { m[itemKey(x)] = x; }); return m; }
    function merge3(b, l, r) {
        if (r === undefined || r === null) return l;
        if (l === undefined || l === null) return r;
        if (same(l, r)) return l;
        if (b !== undefined && b !== null && same(l, b)) return r;
        if (b !== undefined && b !== null && same(r, b)) return l;
        if (Array.isArray(l) && Array.isArray(r)) {
            var bm = index(Array.isArray(b) ? b : []), lm = index(l), rm = index(r), out = [], k;
            l.forEach(function (x) {
                k = itemKey(x);
                if (k in rm) out.push(merge3(bm[k], x, rm[k]));
                else if (k in bm) { if (!same(bm[k], x)) out.push(x); }          // they deleted it; keep only if I changed it
                else out.push(x);                                                  // I added it
            });
            r.forEach(function (x) {
                k = itemKey(x);
                if (k in lm) return;
                if (k in bm) { if (!same(bm[k], x)) out.push(x); }                 // I deleted it; keep only if they changed it
                else out.push(x);                                                  // they added it
            });
            return out;
        }
        if (isObj(l) && isObj(r)) {
            var bo = isObj(b) ? b : {}, res = {}, keys = {};
            Object.keys(l).concat(Object.keys(r)).forEach(function (x) { keys[x] = 1; });
            Object.keys(keys).forEach(function (x) {
                var inL = x in l, inR = x in r, inB = x in bo;
                if (inL && inR) res[x] = merge3(bo[x], l[x], r[x]);
                else if (inL) { if (!(inB && same(bo[x], l[x]))) res[x] = l[x]; }
                else if (inR) { if (!(inB && same(bo[x], r[x]))) res[x] = r[x]; }
            });
            return res;
        }
        return l;                                                                  // plain values: mine wins
    }
    function mergeStr(base, local, remote) {
        if (remote == null) return local;
        if (local == null || local === remote) return remote;
        if (base === local) return remote;
        if (base === remote) return local;
        var B = safeParse(base, undefined), L, R;
        try { L = JSON.parse(local); R = JSON.parse(remote); } catch (e) { return local; }
        if (typeof L !== "object" || typeof R !== "object") return local;
        return JSON.stringify(merge3(B, L, R));
    }
    function valueStr(v) { return v && typeof v === "object" && typeof v.v === "string" ? v.v : null; }

    /* ---------------------------------------------------------
       7. Supabase client (loaded on demand, never blocks the page)
    --------------------------------------------------------- */
    var clientPromise = null;
    function getClient() {
        if (clientPromise) return clientPromise;
        clientPromise = new Promise(function (resolve, reject) {
            if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return reject(new Error("Supabase not configured"));
            function make() { resolve(window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)); }
            if (window.supabase && window.supabase.createClient) return make();
            var s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
            s.onload = make;
            s.onerror = function () { reject(new Error("Could not load supabase-js")); };
            document.head.appendChild(s);
        });
        return clientPromise;
    }
    function authHeaders() {
        return getClient().then(function (c) { return c.auth.getSession(); }).then(function (s) {
            var h = { "Content-Type": "application/json" };
            if (s.data && s.data.session) h.Authorization = "Bearer " + s.data.session.access_token;
            if (cfg.supabaseAnonKey) h.apikey = cfg.supabaseAnonKey;
            return h;
        });
    }
    /* POST to one of our Edge Functions; resolves with the JSON body or rejects with a readable error */
    function callFunction(url, body) {
        if (!url) return Promise.reject(new Error("not set up"));
        return authHeaders().then(function (h) {
            return fetch(url, { method: "POST", headers: h, body: JSON.stringify(body || {}) });
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
                if (!r.ok || j.error) { var e = new Error(j.error || ("HTTP " + r.status)); e.status = r.status; e.body = j; throw e; }
                return j;
            });
        });
    }

    /* ---------------------------------------------------------
       8. Upload changes (compare-and-swap: if someone saved in between we merge and try again)
    --------------------------------------------------------- */
    var homeReady = Promise.resolve(), flushing = null, setupIssue = null;

    function pushKey(c, uid, k, attempt) {
        attempt = attempt || 0;
        var fk = fullKey(uid, k);
        if (!canWriteKey(k)) {                                    // permissions changed: undo the local change
            return c.from(TABLE).select("value").eq("user_id", uid).eq("key", k).maybeSingle().then(function (res) {
                var remote = res.data ? valueStr(res.data.value) : null;
                if (remote == null) lsDel(fk); else lsSet(fk, remote);
                setBase(uid, k, remote); emit([k]);
            });
        }
        return c.from(TABLE).select("value,updated_at").eq("user_id", uid).eq("key", k).maybeSingle().then(function (res) {
            if (res.error) throw res.error;
            var row = res.data, remote = row ? valueStr(row.value) : null;
            var local = lsGet(fk), base = getBase(uid, k), q;

            if (local == null) {                                  // deleted here
                if (!row) { setBase(uid, k, null); return; }
                if (base !== null && base !== remote) {           // they changed it after I last saw it: keep theirs
                    lsSet(fk, remote); setBase(uid, k, remote); emit([k]); return;
                }
                q = c.from(TABLE).delete().eq("user_id", uid).eq("key", k).eq("updated_at", row.updated_at).select("key");
            } else {
                var merged = row ? mergeStr(base, local, remote) : local;
                if (merged !== local) { lsSet(fk, merged); emit([k]); }
                if (row && merged === remote) { setBase(uid, k, remote); return; }
                q = row
                    ? c.from(TABLE).update({ value: { v: merged } }).eq("user_id", uid).eq("key", k).eq("updated_at", row.updated_at).select("key")
                    : c.from(TABLE).insert({ user_id: uid, key: k, value: { v: merged } }).select("key");
                var written = merged;
            }
            return q.then(function (w) {
                if (w.error && w.error.code !== "23505") throw w.error;
                if (w.error || !w.data || !w.data.length) {       // someone saved first (or no permission): retry
                    if (attempt < 4) return pushKey(c, uid, k, attempt + 1);
                    throw new Error("could not save " + k + " (permission or conflict)");
                }
                setBase(uid, k, local == null ? null : written);
            });
        });
    }

    function doFlush() {
        var keys = Object.keys(dirty);
        if (!keys.length || !user) return Promise.resolve();
        dirty = {};
        return getClient().then(function (c) {
            return keys.reduce(function (p, qk) {
                var i = qk.indexOf("|"), uid = qk.slice(0, i), k = qk.slice(i + 1);
                return p.then(function () { return pushKey(c, uid, k); }).catch(function (e) {
                    console.warn("[Elara] sync failed for " + k + ":", e.message || e);
                    if (!/permission|42501|row-level/i.test(String(e.message || e.code))) dirty[qk] = 1;   // retry later
                });
            }, Promise.resolve());
        }).catch(function (e) { keys.forEach(function (k) { dirty[k] = 1; }); console.warn("[Elara] sync failed:", e.message); });
    }
    function flush() {
        if (flushing) return flushing.then(flush);
        flushing = homeReady.then(doFlush).then(function () { flushing = null; }, function () { flushing = null; });
        return flushing;
    }
    window.addEventListener("beforeunload", function () { if (Object.keys(dirty).length) flush(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && Object.keys(dirty).length) flush(); });
    // offline (e.g. a phone with no signal): changes stay on the device and are sent when the connection is back
    window.addEventListener("online", function () { if (Object.keys(dirty).length) flush(); });
    setInterval(function () { if (navigator.onLine !== false && Object.keys(dirty).length) flush(); }, 30000);

    /* ---------------------------------------------------------
       9. Apply a value from the cloud (first load, or a live update from another member)
    --------------------------------------------------------- */
    function applyRemote(uid, k, remote) {
        var fk = fullKey(uid, k), local = lsGet(fk), base = getBase(uid, k);
        if (local === remote) { setBase(uid, k, remote); return false; }
        if (local == null || local === base || base === null && remote != null && !(uid + "|" + k in dirty)) {
            if (remote == null) lsDel(fk); else lsSet(fk, remote);
            setBase(uid, k, remote);
            return true;
        }
        // I have unsaved changes: merge theirs in, keep mine queued
        var merged = remote == null ? local : mergeStr(base, local, remote);
        lsSet(fk, merged); setBase(uid, k, remote);
        if (merged !== remote) markDirty(uid, k);
        return merged !== local;
    }

    /* ---------------------------------------------------------
       10. Which household am I in?  (runs on every login / page load)
    --------------------------------------------------------- */
    function resolveHome() {
        if (!user || !cfg.supabaseUrl) return;
        homeReady = getClient().then(function (client) {
            return client.auth.getSession().then(function (r) {
                if (!r.data || !r.data.session) throw new Error("no session");
                return client.rpc("elara_accept_invites");
            });
        }).then(function (res) {
            if (res.error) throw res.error;
            var row = (res.data || [])[0];
            var target = row ? row.home_owner : user.id;
            access = row ? { ownerId: target, role: row.home_role || "member", perms: row.home_permissions || {} }
                         : { ownerId: user.id, role: "owner", perms: null };
            lsSet(ACCESS_KEY, JSON.stringify(access));
            if (target === dataId) { emit(["access"]); return; }
            // switched household (joined one, or was removed from one): reload into the right data
            if (target === user.id) lsDel(HOME_KEY); else lsSet(HOME_KEY, target);
            // changes queued for the old household must not be uploaded; keep only personal ones
            Object.keys(dirty).forEach(function (qk) { if (!PERSONAL.test(qk.slice(qk.indexOf("|") + 1))) delete dirty[qk]; });
            return doFlush().then(function () { location.reload(); return new Promise(function () {}); });
        }).catch(function (e) {
            var msg = String(e && (e.message || e.code) || e);
            console.warn("[Elara] household check failed:", msg);
            if (/elara_accept_invites|does not exist|PGRST202|42883|schema cache/i.test(msg)) {
                setupIssue = "Household sharing isn't set up in Supabase yet. Run elara-setup.sql (README, step 2).";
                emit(["setup"]);
            }
        });
    }

    /* pull everything this person may see, then keep it live */
    function hydrate() {
        if (!user || !cfg.supabaseUrl) return;
        var ids = shared ? [user.id, dataId] : [user.id];
        homeReady.then(function () { return getClient(); }).then(function (client) {
            return client.auth.getSession().then(function (r) {
                if (!r.data || !r.data.session) throw new Error("no session");
                return client.from(TABLE).select("user_id,key,value").in("user_id", ids);
            });
        }).then(function (res) {
            if (res.error) throw res.error;
            var changed = [], seen = {};
            (res.data || []).forEach(function (row) {
                if (scopeUid(row.key) !== row.user_id || !synced(row.key)) return;
                seen[row.user_id + "|" + row.key] = 1;
                if (applyRemote(row.user_id, row.key, valueStr(row.value))) changed.push(row.key);
            });
            // keys this browser has but the cloud doesn't: either deleted by someone else, or never uploaded
            for (var i = localStorage.length - 1; i >= 0; i--) {
                var fk = localStorage.key(i);
                ids.forEach(function (id) {
                    var p = "elara:" + id + ":";
                    if (fk.indexOf(p) !== 0) return;
                    var k = fk.slice(p.length);
                    if (!synced(k) || scopeUid(k) !== id || seen[id + "|" + k]) return;
                    if (!canReadKey(k)) { lsDel(fk); changed.push(k); return; }
                    var base = getBase(id, k), local = lsGet(fk);
                    if (base !== null && base === local) { lsDel(fk); setBase(id, k, null); changed.push(k); }
                    else if (canWriteKey(k)) markDirty(id, k);
                });
            }
            var onceKey = "elaraHydrated:" + user.id + ":" + dataId;
            var first = !lsGet(onceKey);
            lsSet(onceKey, "1");
            if (first && changed.length) { location.reload(); return; }   // first visit on this device: start clean
            if (changed.length) emit(changed);
            subscribeLive();
        }).catch(function (e) { console.warn("[Elara] could not load cloud data:", e.message); });
    }

    /* ---------------------------------------------------------
       11. Live updates (Supabase Realtime)
    --------------------------------------------------------- */
    var live = null;
    function subscribeLive() {
        if (live || !user) return;
        getClient().then(function (c) {
            live = c.channel("elara-" + user.id + "-" + Date.now());
            var watch = shared ? [dataId, user.id] : [user.id];
            watch.forEach(function (uid) {
                live.on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: "user_id=eq." + uid }, function (p) {
                    var row = p.new && p.new.key ? p.new : p.old;
                    if (!row || !row.key || scopeUid(row.key) !== uid || !synced(row.key)) return;
                    var remote = p.eventType === "DELETE" ? null : valueStr(p.new.value);
                    if (applyRemote(uid, row.key, remote)) emit([row.key]);
                });
            });
            live.on("postgres_changes", { event: "*", schema: "public", table: "elara_household_links", filter: "owner_id=eq." + dataId }, function () {
                refreshRoster(); if (shared) recheckAccess();
            });
            live.on("postgres_changes", { event: "INSERT", schema: "public", table: "elara_notifications", filter: "recipient=eq." + user.id }, function (p) {
                serverNotes.unshift(p.new); emit(["notifications"]);
                try { document.dispatchEvent(new CustomEvent("elara:notification", { detail: p.new })); } catch (e) { /* ignore */ }
            });
            live.subscribe();
        }).catch(function () { /* offline */ });
    }
    var recheckTimer = null;
    function recheckAccess() {
        clearTimeout(recheckTimer);
        recheckTimer = setTimeout(function () {
            getClient().then(function (c) { return c.rpc("elara_accept_invites"); }).then(function (res) {
                var row = res && !res.error && (res.data || [])[0];
                if (!row) { lsDel(HOME_KEY); location.reload(); return; }           // removed from the home
                var was = JSON.stringify(access.perms);
                access = { ownerId: row.home_owner, role: row.home_role, perms: row.home_permissions || {} };
                lsSet(ACCESS_KEY, JSON.stringify(access));
                if (JSON.stringify(access.perms) !== was) location.reload();       // permissions changed: redraw everything
            });
        }, 400);
    }

    function signOut() {
        var done = function () {
            try {
                for (var i = localStorage.length - 1; i >= 0; i--) {
                    var k = localStorage.key(i);
                    if (/^sb-.+-auth-token/.test(k)) lsDel(k);
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
       12. Login guard
    --------------------------------------------------------- */
    function toLogin() {
        ssSet("elaraBounced", String(Date.now()));
        location.replace(cfg.loginPage || "Loginpage.html");
    }
    if (cfg.requireLogin && !user) {
        var fromProvider = /access_token=|refresh_token=/.test(location.hash) || /[?&]code=/.test(location.search);
        if (fromProvider && cfg.supabaseUrl) {
            getClient().then(function (c) { return c.auth.getSession(); }).then(function (r) {
                if (r && r.data && r.data.session) { history.replaceState(null, "", location.pathname); location.reload(); }
                else toLogin();
            }).catch(toLogin);
        } else toLogin();
        window.ElaraData = null;
        return;
    }

    /* ---------------------------------------------------------
       13. Small helpers + stores
    --------------------------------------------------------- */
    function load(key, fb) { return safeParse(localStorage.getItem(key), fb); }
    function save(key, v) { localStorage.setItem(key, JSON.stringify(v)); }
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
    var DEMO = !user;   // sample data only when nobody is logged in (requireLogin: false)

    function me() {
        if (!user) return { id: "demo-1", name: "Justin", first: "Justin", email: "justin@example.com" };
        var first = localStorage.getItem("elaraFirstName") || user.first;
        var last = localStorage.getItem("elaraLastName") || "";
        return { id: user.id, first: first, name: (first + " " + last).trim(), email: user.email };
    }

    /* migrate keys written by older versions ("elaraFirstName:<id>" -> "elaraFirstName") */
    if (user) {
        ["elaraFirstName", "elaraLastName", "elaraEmail", "elaraPhone", "elaraProfileImage"].forEach(function (k) {
            var old = lsGet(fullKey(user.id, k + ":" + user.id)) || lsGet(fullKey(dataId, k + ":" + user.id));
            if (old && !lsGet(fullKey(user.id, k))) localStorage.setItem(k, old);
            lsDel(fullKey(user.id, k + ":" + user.id)); lsDel(fullKey(dataId, k + ":" + user.id));
        });
        var names = user.name.split(/\s+/);
        [["elaraFirstName", names[0]], ["elaraLastName", names.slice(1).join(" ")], ["elaraEmail", user.email]].forEach(function (p) {
            if (p[1] && !localStorage.getItem(p[0])) localStorage.setItem(p[0], p[1]);
        });
    }

    /* ----- sign-in history (Settings > Login Activity) + account info ----- */
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
        var sFlag = "elaraSessionLogged:" + user.id;
        if (!ssGet(sFlag)) {
            ssSet(sFlag, "1");
            var hist = load("elaraLoginActivity", []), sig = deviceLabel(), nowT = Date.now();
            var recent = hist[0] && hist[0].device === sig && nowT - hist[0].t < 30 * 60000;
            if (!recent) {
                var seenBefore = hist.some(function (e) { return e.device === sig; });
                hist.unshift({ t: nowT, device: sig, method: info.provider });
                save("elaraLoginActivity", hist.slice(0, 30));
                if (hist.length > 1 && !seenBefore) ssSet("elaraNewDeviceAlert", "A sign-in from " + sig + " was recorded on your account.");
            }
        }
    }

    /* ----- activity log (every entry says who did it) ----- */
    function log(text, icon, who) {
        if (!can("common", "edit")) return;
        var list = load("elaraActivity", []), m = me();
        list.unshift({ k: rid(), t: Date.now(), who: who || m.first, by: m.id, text: String(text).slice(0, 200), icon: icon || "fa-bolt" });
        save("elaraActivity", list.slice(0, 120));
    }
    function activity(n) {
        return load("elaraActivity", []).slice().sort(function (a, b) { return b.t - a.t; }).slice(0, n || 10);
    }
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
            { id: 1, title: "Clean Kitchen", description: "Deep clean the kitchen and sanitize all surfaces.", priority: "High", assigneeId: "demo-1", assignee: "Justin", createdBy: "demo-1", createdByName: "Justin", date: k, time: "17:00", status: "In Progress", progress: 65 },
            { id: 2, title: "Buy Groceries", description: "Purchase milk, bread, eggs and vegetables.", priority: "Medium", assigneeId: "demo-2", assignee: "Nkosazana", createdBy: "demo-1", createdByName: "Justin", date: dayKey(addDays(now, 1)), time: "10:00", status: "Pending", progress: 25 },
            { id: 3, title: "Laundry", description: "Wash, dry and fold all clothes.", priority: "Low", assigneeId: "demo-3", assignee: "Thabo", createdBy: "demo-1", createdByName: "Justin", date: k, time: "09:00", status: "Completed", progress: 100, completedBy: "demo-3", completedByName: "Thabo", completedAt: Date.now() - 3600000 }
        ];
        save("elaraTasks", t);
        return t;
    }
    function saveTasks(t) { save("elaraTasks", t); }

    /* ---------------------------------------------------------
       14. Household roster (owner + members) from elara_household_links + elara_profiles
    --------------------------------------------------------- */
    var DEMO_ROSTER = [
        { id: "demo-1", userId: "demo-1", name: "Justin", email: "justin@example.com", role: "owner", status: "active", permissions: null, avatar: "" },
        { id: "demo-2", userId: "demo-2", name: "Nkosazana", email: "nkosazana@example.com", role: "adult", status: "active", permissions: ROLE_PERMS.adult, avatar: "" },
        { id: "demo-3", userId: "demo-3", name: "Thabo", email: "thabo@example.com", role: "member", status: "active", permissions: ROLE_PERMS.member, avatar: "" },
        { id: "demo-4", userId: "demo-4", name: "Lerato", email: "lerato@example.com", role: "member", status: "active", permissions: ROLE_PERMS.member, avatar: "" },
        { id: "p-demo-5", userId: null, linkId: "demo-5", name: "Sipho", email: "sipho@example.com", role: "guest", status: "pending", permissions: ROLE_PERMS.guest, avatar: "" }
    ];
    function roster() {
        var list;
        if (!user) list = DEMO_ROSTER.slice();
        else {
            list = safeParse(lsGet("elara:" + user.id + ":elaraRosterCache:" + dataId), null);
            if (!list || !list.length) {
                var m = me();
                list = [{ id: dataId, userId: dataId, name: shared ? "Home owner" : m.first, email: shared ? "" : m.email, role: "owner", status: "active", permissions: null, avatar: "" }];
                if (shared) list.push({ id: user.id, userId: user.id, name: m.first, email: user.email, role: access.role, status: "active", permissions: access.perms, avatar: "" });
            }
        }
        var myId = user ? user.id : "demo-1";
        return list.map(function (x) {
            var o = Object.assign({}, x);
            o.isMe = o.userId === myId;
            if (o.isMe) { var m = me(); o.name = m.first || o.name; o.avatar = localStorage.getItem("elaraProfileImage") || o.avatar; }
            return o;
        });
    }
    function people() { return roster().filter(function (m) { return m.status === "active"; }); }
    function person(id) { return roster().filter(function (m) { return m.userId === id || m.id === id; })[0] || null; }

    var rosterLoading = null;
    function refreshRoster() {
        if (!user || !cfg.supabaseUrl) return Promise.resolve(roster());
        if (rosterLoading) return rosterLoading;
        rosterLoading = homeReady.then(getClient).then(function (c) {
            return c.from("elara_household_links").select("id,member_id,email,role,status,permissions,name,created_at,accepted_at")
                .eq("owner_id", dataId).order("created_at").then(function (res) {
                    if (res.error) throw res.error;
                    var links = res.data || [];
                    var ids = [dataId].concat(links.filter(function (l) { return l.member_id; }).map(function (l) { return l.member_id; }));
                    return c.from("elara_profiles").select("user_id,display_name,email,avatar").in("user_id", ids).then(function (pr) {
                        var prof = {};
                        (pr.data || []).forEach(function (p) { prof[p.user_id] = p; });
                        var po = prof[dataId] || {};
                        var list = [{ id: dataId, userId: dataId, name: po.display_name || (dataId === user.id ? me().first : "Home owner"),
                                      email: po.email || (dataId === user.id ? user.email : ""), role: "owner", status: "active", permissions: null, avatar: po.avatar || "" }];
                        links.forEach(function (l) {
                            var p = l.member_id ? prof[l.member_id] || {} : {};
                            list.push({ id: l.member_id || "p-" + l.id, userId: l.member_id || null, linkId: l.id,
                                        name: p.display_name || l.name || l.email.split("@")[0], email: l.email, role: l.role,
                                        status: l.status, permissions: Object.assign({}, ROLE_PERMS[l.role] || ROLE_PERMS.member, l.permissions || {}),
                                        avatar: p.avatar || "", invitedAt: l.created_at, joinedAt: l.accepted_at });
                        });
                        lsSet("elara:" + user.id + ":elaraRosterCache:" + dataId, JSON.stringify(list));
                        emit(["roster"]);
                        return roster();
                    });
                });
        }).catch(function (e) {
            console.warn("[Elara] roster:", e.message || e);
            if (/column|relation|does not exist|schema cache/i.test(e.message || "")) { setupIssue = "The members list can't load because the database is out of date. Run the latest elara-setup.sql (README, step 2)."; emit(["setup"]); }
            return roster();
        })
          .then(function (r) { rosterLoading = null; return r; });
        return rosterLoading;
    }

    /* my name + photo, as other members see them */
    var profileTimer = null;
    function saveProfile() {
        if (!user || !cfg.supabaseUrl) return Promise.resolve();
        clearTimeout(profileTimer);
        return new Promise(function (resolve) {
            profileTimer = setTimeout(function () {
                var m = me();
                getClient().then(function (c) {
                    return c.from("elara_profiles").upsert({ user_id: user.id, display_name: m.name.slice(0, 60) || m.first,
                        email: user.email, avatar: localStorage.getItem("elaraProfileImage") || null, updated_at: new Date().toISOString() });
                }).then(function (r) { if (r && r.error) console.warn("[Elara] profile:", r.error.message); resolve(); refreshRoster(); },
                        function () { resolve(); });
            }, 300);
        });
    }

    var household = {
        get isOwner() { return isOwner(); },
        ownerId: dataId,
        refresh: refreshRoster,
        /* invite: done by the invite Edge Function (records + emails). Fallback: record only. */
        invite: function (opts) {
            var body = { email: String(opts.email).trim().toLowerCase(), name: opts.name, role: opts.role, permissions: opts.permissions, redirectTo: opts.redirectTo };
            if (!user) return Promise.resolve({ ok: true, demo: true });
            if (cfg.inviteEndpoint) return callFunction(cfg.inviteEndpoint, body).then(function (j) { refreshRoster(); return j; });
            return getClient().then(function (c) {
                return c.from("elara_household_links").insert({ owner_id: user.id, email: body.email, role: body.role, permissions: body.permissions, name: body.name });
            }).then(function (r) { if (r.error) throw r.error; refreshRoster(); return { ok: true, recordedOnly: true }; });
        },
        update: function (linkId, changes) {
            if (!user) return Promise.resolve();
            return getClient().then(function (c) { return c.from("elara_household_links").update(changes).eq("id", linkId).eq("owner_id", user.id); })
                .then(function (r) { if (r.error) throw r.error; return refreshRoster(); });
        },
        remove: function (linkId) {
            if (!user) return Promise.resolve();
            return getClient().then(function (c) { return c.from("elara_household_links").delete().eq("id", linkId).eq("owner_id", user.id); })
                .then(function (r) { if (r.error) throw r.error; return refreshRoster(); });
        },
        leave: function () {
            if (!user || !shared) return Promise.resolve();
            return getClient().then(function (c) { return c.from("elara_household_links").delete().eq("member_id", user.id); })
                .then(function (r) { if (r.error) throw r.error; lsDel(HOME_KEY); lsDel(ACCESS_KEY); });
        }
    };

    /* ----- presence (home / away) and day-by-day availability ----- */
    function presence() { return load("elaraPresence", {}); }
    /* people set their OWN home/away and busy/away/available, never someone else's */
    function setPresence(uid, state) {
        if (uid !== me().id) return false;
        var p = presence(); p[uid] = { state: state === "away" ? "away" : "home", t: Date.now(), by: me().id }; save("elaraPresence", p);
        return true;
    }
    function availability() { return load("elaraAvailability", {}); }
    function availabilityOn(date, uid) { var a = availability(); return (a[date] && a[date][uid]) || "available"; }
    function setAvailability(date, uid, state) {
        if (uid !== me().id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < dayKey()) return false;
        if (["available", "busy", "away"].indexOf(state) < 0) return false;
        var a = availability(), cutoff = dayKey(addDays(new Date(), -60));
        Object.keys(a).forEach(function (d) { if (d < cutoff) delete a[d]; });
        a[date] = a[date] || {};
        if (state === "available") delete a[date][uid]; else a[date][uid] = state;
        if (!Object.keys(a[date]).length) delete a[date];
        save("elaraAvailability", a);
    }

    /* ---------------------------------------------------------
       15. Device registry
           Real homes: only switches imported from CBi Home / Smart Life (they have a tuyaId).
           Demo mode (no login): a few sample devices so the pages can be tried out.
    --------------------------------------------------------- */
    var DEMO_DEVICES = [
        { name: "Geyser",         room: "Bathroom",    icon: "fa-fire",      type: "Geyser",  on: false },
        { name: "Main Lights",    room: "Living Room", icon: "fa-lightbulb", type: "Light",   on: false },
        { name: "Kettle",         room: "Kitchen",     icon: "fa-mug-hot",   type: "Plug",    on: false },
        { name: "Outdoor Lights", room: "Garden",      icon: "fa-lightbulb", type: "Light",   on: false }
    ];
    var DEVICE_TYPES = { Light: "fa-lightbulb", Geyser: "fa-fire", "Air conditioner": "fa-fan", Heater: "fa-temperature-arrow-up",
                         Fridge: "fa-snowflake", Plug: "fa-plug", Pool: "fa-water-ladder", Gate: "fa-door-open", Other: "fa-microchip" };
    function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
    function devId(room, name) { return slug(room) + "__" + slug(name); }
    function guessType(name, cat) {
        var n = String(name).toLowerCase();
        if (/geyser|water heater|boiler/.test(n) || cat === "rs") return "Geyser";
        if (/light|lamp|bulb/.test(n) || cat === "dj" || cat === "dd") return "Light";
        if (/air ?con|aircon|\bac\b/.test(n) || cat === "kt") return "Air conditioner";
        if (/heater/.test(n)) return "Heater";
        if (/fridge|freezer/.test(n)) return "Fridge";
        if (/pool|pump/.test(n)) return "Pool";
        if (/gate|garage/.test(n)) return "Gate";
        return "Plug";
    }

    function devices() {
        var d = load("elaraDevices", null);
        if (!user) {
            if (d) return d;
            d = DEMO_DEVICES.map(function (x) { return Object.assign({ id: devId(x.room, x.name), created: Date.now(), demo: true }, x); });
            save("elaraDevices", d);
            return d;
        }
        d = d || [];
        // older versions added made-up devices that weren't connected to anything: drop them once
        var real = d.filter(function (x) { return x.tuyaId; });
        if (real.length !== d.length && can("smartHome", "edit")) save("elaraDevices", real);
        return real;
    }
    function visibleDevices() { return devices().filter(function (d) { return !d.hidden; }); }
    function saveDevices(d) { save("elaraDevices", d); }
    function findDevice(nameOrId, room) {
        var all = devices(), id = room ? devId(room, nameOrId) : nameOrId;
        return all.filter(function (d) { return d.id === id || d.tuyaId === id || (!room && d.name.toLowerCase() === String(nameOrId).toLowerCase()); })[0];
    }
    function updateDevice(id, changes) {
        if (!can("smartHome", "edit")) { readOnlyWarning("elaraDevices"); return null; }
        var all = devices(), d = all.filter(function (x) { return x.id === id; })[0];
        if (!d) return null;
        ["name", "room", "type", "hidden"].forEach(function (k) { if (k in changes) d[k] = changes[k]; });
        if (changes.type) d.icon = DEVICE_TYPES[changes.type] || d.icon;
        saveDevices(all);
        return d;
    }
    /* add or refresh switches from the CBi / Smart Life account */
    function importDevices(list) {
        if (!can("smartHome", "edit")) return { added: 0 };
        var all = devices(), added = 0;
        (list || []).forEach(function (t) {
            if (!t || !t.id) return;
            var ex = all.filter(function (d) { return d.tuyaId === t.id; })[0];
            if (ex) { ex.tuyaCode = t.code || ex.tuyaCode; ex.hasMeter = !!t.hasMeter; ex.on = !!t.on; return; }
            var name = String(t.name || "CBi switch").slice(0, 40), type = guessType(name, t.category);
            all.push({ id: "t_" + String(t.id).slice(0, 60), tuyaId: String(t.id), tuyaCode: t.code || "switch_1", name: name, room: "CBi Devices",
                       type: type, icon: DEVICE_TYPES[type], hasMeter: !!t.hasMeter, on: !!t.on, created: Date.now() });
            added++;
        });
        saveDevices(all);
        return { added: added };
    }
    function removeDevice(id) { saveDevices(devices().filter(function (d) { return d.id !== id; })); }

    // energy log entries remember WHO switched (for the per-person reports)
    var switchNotes = [], switchTimer = null;
    function setDevice(id, on, opts) {
        opts = opts || {};
        var all = devices(), d = all.filter(function (x) { return x.id === id; })[0];
        if (!d || d.on === !!on) return d;
        if (!can("smartHome", "edit")) { if (!opts.external) readOnlyWarning("elaraDevices"); return d; }
        var m = me(), ext = !!opts.external;
        d.on = !!on; d.changedBy = ext ? null : m.id; d.changedAt = Date.now(); saveDevices(all);
        var ev = load("elaraEnergyLog", []);
        ev.push({ k: rid(), t: Date.now(), id: id, on: !!on, by: ext ? null : m.id, who: ext ? "CBi app / automation" : m.first, auto: opts.auto || ext || undefined });
        save("elaraEnergyLog", ev.slice(-6000));
        if (!opts.silent) log(d.name + " turned " + (on ? "ON" : "OFF") + (opts.auto ? " (automation)" : ext ? " (outside Elara)" : ""), d.icon);
        if (opts.notify !== false && !opts.auto && !ext) {
            switchNotes.push(d.name + " " + (on ? "on" : "off"));
            clearTimeout(switchTimer);
            switchTimer = setTimeout(function () {
                var list = switchNotes; switchNotes = [];
                notify({ to: "household", kind: "smartHome", title: me().first + " switched " + (list.length === 1 ? list[0] : list.length + " devices"),
                         body: list.join(", "), href: "dashboard-smart-home.html" });
            }, 2500);
        }
        return d;
    }
    /* switch the REAL CBi / Smart Life switch; Elara's copy only changes once the switch accepted the command */
    function switchDevice(id, on, opts) {
        var d = devices().filter(function (x) { return x.id === id; })[0];
        if (!d) return Promise.reject(new Error("Unknown device"));
        if (!can("smartHome", "edit")) { readOnlyWarning("elaraDevices"); return Promise.reject(new Error("You can only view Smart Home.")); }
        if (!d.tuyaId) { setDevice(id, on, opts); return Promise.resolve(true); }          // demo device
        if (!cfg.tuyaEndpoint) return Promise.reject(new Error("CBi isn't connected yet (README, step 8)."));
        var st = liveState(d);
        if (st && st.online === false) return Promise.reject(new Error(d.name + " is offline. Check its power and Wi-Fi."));
        return callFunction(cfg.tuyaEndpoint, { action: "set", deviceId: d.tuyaId, code: d.tuyaCode || "switch_1", value: !!on })
            .then(function () { setDevice(id, on, opts); setTimeout(pollDevices, 2500); return true; });
    }

    /* ---------------------------------------------------------
       16. Live state + energy, from the switches' own power meters
           elara_device_state: latest on/off, online and watts per switch
           elara_energy:       kWh per switch per hour (recorded by the server)
           Nothing is estimated. A switch without a power meter shows no energy.
    --------------------------------------------------------- */
    var EN_KEY = "elaraEnergyCache:" + (user ? user.id + ":" + dataId : "demo");
    var energyStore = safeParse(lsGet(EN_KEY), null) || { rows: [], state: {}, at: 0 };
    var energyLoading = null;
    function liveState(d) { return d && d.tuyaId ? energyStore.state[d.tuyaId] || null : null; }
    function loadEnergy(force) {
        if (!user || !cfg.supabaseUrl || !(can("smartHome") || can("analytics") || can("reports"))) return Promise.resolve(energyStore);
        if (energyLoading) return energyLoading;
        if (!force && Date.now() - energyStore.at < 90000) return Promise.resolve(energyStore);
        var since = new Date(Date.now() - 62 * 86400000).toISOString(), rows = [];
        energyLoading = homeReady.then(getClient).then(function (c) {
            function page(from) {
                return c.from("elara_energy").select("device,hour,kwh,peak_w").eq("owner_id", dataId).gte("hour", since)
                    .order("hour").range(from, from + 999).then(function (r) {
                        if (r.error) throw r.error;
                        rows = rows.concat(r.data || []);
                        return (r.data || []).length === 1000 && from < 60000 ? page(from + 1000) : null;
                    });
            }
            return page(0).then(function () { return c.from("elara_device_state").select("device,last_at,watts,is_on,online").eq("owner_id", dataId); })
                .then(function (r) {
                    if (r.error) throw r.error;
                    var st = {};
                    (r.data || []).forEach(function (x) { st[x.device] = { watts: x.watts, on: x.is_on, online: x.online, at: new Date(x.last_at).getTime() }; });
                    energyStore = { rows: rows.map(function (x) { return { d: x.device, h: new Date(x.hour).getTime(), k: Number(x.kwh) || 0, p: Number(x.peak_w) || 0 }; }), state: st, at: Date.now() };
                    lsSet(EN_KEY, JSON.stringify(energyStore));
                    emit(["energy"]);
                    return energyStore;
                });
        }).catch(function (e) {
            if (/elara_energy|relation|does not exist|schema cache/i.test(e.message || "")) setupIssue = setupIssue || "Energy tables are missing. Run the latest elara-setup.sql (README, step 2).";
            console.warn("[Elara] energy:", e.message || e); return energyStore;
        }).then(function (r) { energyLoading = null; return r; });
        return energyLoading;
    }
    /* ask the switches how they are right now (the server also records the reading as energy) */
    var polling = null;
    function pollDevices() {
        if (!user || !cfg.tuyaEndpoint || polling || document.hidden || !can("smartHome")) return Promise.resolve(null);
        if (!devices().some(function (d) { return d.tuyaId; })) return Promise.resolve(null);
        polling = callFunction(cfg.tuyaEndpoint, { action: "poll" }).then(function (j) {
            var all = devices(), changed = false;
            (j.devices || []).forEach(function (t) {
                energyStore.state[t.id] = { watts: t.watts, on: t.on, online: t.online, at: Date.now() };
                var d = all.filter(function (x) { return x.tuyaId === t.id; })[0];
                if (!d) return;
                if (d.hasMeter !== !!t.hasMeter && can("smartHome", "edit")) { d.hasMeter = !!t.hasMeter; changed = true; }
                if (d.on !== !!t.on) setDevice(d.id, !!t.on, { external: true, silent: false, notify: false });   // switched in the CBi app or by an automation
            });
            if (changed) saveDevices(devices().map(function (d) { var t = (j.devices || []).filter(function (x) { return x.id === d.tuyaId; })[0]; if (t) d.hasMeter = !!t.hasMeter; return d; }));
            lsSet(EN_KEY, JSON.stringify(energyStore));
            emit(["devices", "energy"]);
            return j;
        }).catch(function (e) { console.warn("[Elara] CBi:", e.message); return null; })
          .then(function (r) { polling = null; return r; });
        return polling;
    }
    if (user) {
        homeReady.then(function () { loadEnergy(true); pollDevices(); });
        setInterval(function () { if (!document.hidden) pollDevices(); }, Math.max(20, cfg.tuyaPollSeconds || 60) * 1000);
        setInterval(function () { if (!document.hidden) loadEnergy(); }, 120000);
        document.addEventListener("visibilitychange", function () { if (!document.hidden) { pollDevices(); loadEnergy(); } });
    }

    function rangeBounds(range, now) {
        var sod = startOfDay(now).getTime();
        if (range === "today") return { from: sod, days: 1 };
        if (range === "month") return { from: addDays(sod, -29).getTime(), days: 30 };
        return { from: addDays(sod, -6).getTime(), days: 7 };
    }
    /* who: optional callback(kwh, device, whenMs, userIdWhoSwitchedOn) for per-person reports */
    function integrate(range, to, offsetPeriods, realOnly, from0, end0, who) {
        var now = to || Date.now(), b = rangeBounds(range, now), spanMs = b.days * 86400000;
        var from = from0 != null ? from0 : b.from - (offsetPeriods || 0) * spanMs;
        var end = end0 != null ? end0 : (offsetPeriods ? from + spanMs : now);
        var days = Math.max(1, Math.round((end - from) / 86400000));
        var res = { from: from, to: end, total: 0, byDevice: {}, byRoom: {}, peak: 0, parts: { morning: 0, afternoon: 0, evening: 0, night: 0 },
                    series: new Array(range === "today" ? 24 : (from0 != null ? days : b.days)).fill(0) };
        var byTuya = {}; devices().forEach(function (d) { if (d.tuyaId) byTuya[d.tuyaId] = d; });
        var events = load("elaraEnergyLog", []).slice().sort(function (a, c) { return a.t - c.t; }), evBy = {};
        events.forEach(function (e) { (evBy[e.id] = evBy[e.id] || []).push(e); });
        energyStore.rows.forEach(function (r) {
            if (r.h < from || r.h >= end || !(r.k > 0)) return;
            var d = byTuya[r.d] || { id: r.d, name: "Removed device", room: "Other", icon: "fa-plug" };
            var when = new Date(r.h), h = when.getHours();
            res.total += r.k;
            res.byDevice[d.id] = (res.byDevice[d.id] || 0) + r.k;
            res.byRoom[d.room] = (res.byRoom[d.room] || 0) + r.k;
            if (r.p > res.peak) res.peak = r.p;
            res.parts[h >= 6 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 22 ? "evening" : "night"] += r.k;
            var idx = range === "today" ? h : Math.floor((startOfDay(when).getTime() - startOfDay(from).getTime()) / 86400000);
            if (idx >= 0 && idx < res.series.length) res.series[idx] += r.k;
            if (who) {
                var by = null, list = evBy[d.id] || [];
                for (var i = list.length - 1; i >= 0; i--) if (list[i].t <= r.h + 3600000) { by = list[i].on ? list[i].by || null : null; break; }
                who(r.k, d, r.h, by);
            }
        });
        return res;
    }
    /* ---------------------------------------------------------
       16b. Automations: which real switches go on/off, and when
            kind: "time" (at HH:MM) | "sunset" | "sunrise" (+ offset minutes) | "manual" (a scene you run yourself)
            Run by the elara-tuya scheduled job every 5 minutes (works when nobody has Elara open);
            without that job, by any open Elara screen in the home.
    --------------------------------------------------------- */
    function defaultAutomations() {
        var devs = visibleDevices();
        function ids(fn) { return devs.filter(fn).map(function (d) { return d.id; }); }
        var outdoor = function (d) { return d.type === "Light" && /outdoor|outside|garden|patio|porch|security|gate/i.test(d.name + " " + d.room); };
        return [
            { id: "morning", name: "Morning Routine", icon: "fa-sun", kind: "time", at: "05:30", days: [1, 2, 3, 4, 5], action: "on", on: false,
              devices: ids(function (d) { return d.type === "Geyser"; }) },
            { id: "night", name: "Night Mode", icon: "fa-moon", kind: "time", at: "22:30", days: [], action: "off", on: false,
              devices: ids(function (d) { return d.type !== "Fridge" && !outdoor(d) && d.type !== "Gate"; }) },
            { id: "sunset", name: "Outdoor lights at sunset", icon: "fa-cloud-sun", kind: "sunset", offset: 0, days: [], action: "on", on: false, devices: ids(outdoor) },
            { id: "sunrise", name: "Outdoor lights off at sunrise", icon: "fa-sun", kind: "sunrise", offset: 0, days: [], action: "off", on: false, devices: ids(outdoor) },
            { id: "away", name: "Away Mode", icon: "fa-house-lock", kind: "manual", days: [], action: "off", on: true,
              devices: ids(function (d) { return d.type !== "Fridge"; }) }
        ];
    }
    function automations() {
        var list = load("elaraAutomations", null);
        if (Array.isArray(list) && list.length && list[0] && list[0].id) {
            var ok = {}; devices().forEach(function (d) { ok[d.id] = 1; });
            return list.map(function (a) { return Object.assign({}, a, { devices: (a.devices || []).filter(function (id) { return ok[id]; }) }); });
        }
        return defaultAutomations();      // shown until the owner saves a change
    }
    function saveAutomations(list) {
        var clean = (list || []).slice(0, 20).map(function (a) {
            var kind = ["time", "sunset", "sunrise", "manual"].indexOf(a.kind) > -1 ? a.kind : "time";
            return { id: String(a.id || rid()).replace(/[^\w-]/g, "").slice(0, 40), name: String(a.name || "Automation").replace(/[<>]/g, "").slice(0, 40),
                     icon: /^fa-[a-z-]+$/.test(a.icon || "") ? a.icon : "fa-robot", kind: kind,
                     at: kind === "time" && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.at || "") ? a.at : undefined,
                     offset: kind === "sunset" || kind === "sunrise" ? Math.max(-120, Math.min(120, Math.round(Number(a.offset) || 0))) : undefined,
                     days: (a.days || []).filter(function (d) { return d >= 0 && d <= 6; }), action: a.action === "on" ? "on" : "off", on: !!a.on,
                     devices: (a.devices || []).map(String).slice(0, 50) };
        });
        save("elaraAutomations", clean);
        return clean;
    }

    function tariff() { var t = Number(localStorage.getItem("elaraTariff")); return t > 0 && t < 50 ? t : (cfg.tariffPerKwh || 2.5); }
    function energy(range) {
        var cur = integrate(range, null, 0), prev = integrate(range, null, 1), tf = tariff();
        var all = visibleDevices(), connected = all.filter(function (d) { return d.tuyaId; });
        var rows = connected.map(function (d) {
            var st = liveState(d) || {};
            return { id: d.id, name: d.name, room: d.room, icon: d.icon, type: d.type, kwh: cur.byDevice[d.id] || 0,
                     measured: !!d.hasMeter || st.watts != null, watts: st.watts == null ? null : st.watts, online: st.online !== false };
        }).sort(function (a, b) { return b.kwh - a.kwh || a.name.localeCompare(b.name); });
        var rooms = Object.keys(cur.byRoom).map(function (r) { return { room: r, kwh: cur.byRoom[r] }; }).sort(function (a, b) { return b.kwh - a.kwh; });
        var live = connected.reduce(function (s, d) { var st = liveState(d); return s + (st && st.on !== false && st.watts ? st.watts : 0); }, 0);
        return {
            range: range, total: cur.total, prevTotal: prev.total, cost: cur.total * tf, tariff: tf, peak: cur.peak,
            devices: rows, rooms: rooms, parts: cur.parts, series: cur.series,
            active: all.filter(function (d) { return d.on; }).length, deviceCount: all.length,
            connected: connected.length, metered: rows.filter(function (r) { return r.measured; }).length, livePower: live,
            hasData: cur.total > 0.0005 || prev.total > 0.0005, updated: energyStore.at,
            change: prev.total > 0.01 ? Math.round((cur.total - prev.total) / prev.total * 100) : null
        };
    }
    /* ---------------------------------------------------------
       17. Notifications to other members (elara-push Edge Function)
           to: "household" | [userIds]   kind: tasks schedule shopping smartHome energy members security general
    --------------------------------------------------------- */
    var serverNotes = [];
    /* tells other people in the home. With the elara-push function: in-app + push (respecting each person's
       notification settings and access). Without it: an in-app notification row only (bell + realtime). */
    var pushBroken = false;
    function notify(opts) {
        if (!user || !cfg.supabaseUrl || !opts || !opts.title) return Promise.resolve(null);
        var to = opts.to;
        if (Array.isArray(to)) { to = to.filter(function (id) { return id && id !== user.id && !/^p-|^demo/.test(id); }); if (!to.length) return Promise.resolve(null); }
        var body = { action: "send", to: to, kind: opts.kind || "general", title: String(opts.title).slice(0, 120),
                     body: String(opts.body || "").slice(0, 400), href: opts.href || "dashboard-content.html" };
        function direct() {
            var ids = Array.isArray(to) ? to : people().map(function (p) { return p.userId; }).filter(function (id) { return id && id !== user.id; });
            if (!ids.length) return Promise.resolve(null);
            return getClient().then(function (c) {
                return c.from("elara_notifications").insert(ids.map(function (id) {
                    return { recipient: id, sender: user.id, owner_id: dataId, kind: body.kind, title: body.title, body: body.body, href: body.href };
                }));
            }).then(function (r) { if (r.error) throw r.error; return { ok: true, direct: true }; })
              .catch(function (e) { console.warn("[Elara] notify:", e.message || e); return null; });
        }
        if (!cfg.pushEndpoint || pushBroken) return direct();
        return callFunction(cfg.pushEndpoint, body).catch(function (e) {
            if (/404|not found|failed to fetch|500|VAPID/i.test(e.message || "")) pushBroken = true;
            console.warn("[Elara] push function:", e.message, "- sending in-app only");
            return direct();
        });
    }
    var notifications = {
        list: function () { return serverNotes.slice(); },
        load: function () {
            if (!user || !cfg.supabaseUrl) return Promise.resolve([]);
            return getClient().then(function (c) {
                return c.from("elara_notifications").select("*").eq("recipient", user.id).order("created_at", { ascending: false }).limit(40);
            }).then(function (r) { if (!r.error) { serverNotes = r.data || []; emit(["notifications"]); } return serverNotes; })
              .catch(function () { return serverNotes; });
        },
        markRead: function (ids) {
            if (!user || !ids || !ids.length) return Promise.resolve();
            var now = new Date().toISOString();
            serverNotes.forEach(function (n) { if (ids.indexOf(n.id) > -1) n.read_at = now; });
            return getClient().then(function (c) { return c.from("elara_notifications").update({ read_at: now }).in("id", ids); }).catch(function () {});
        },
        remove: function (ids) {
            if (!user || !ids || !ids.length) return Promise.resolve();
            serverNotes = serverNotes.filter(function (n) { return ids.indexOf(n.id) === -1; });
            return getClient().then(function (c) { return c.from("elara_notifications").delete().in("id", ids); }).catch(function () {});
        }
    };

    /* ---------------------------------------------------------
       18. Backups (owner only): download, restore, automatic daily cloud copy (14 kept)
    --------------------------------------------------------- */
    function snapshot() {
        var keys = {};
        for (var i = 0; i < localStorage.length; i++) {
            var fk = localStorage.key(i), p = "elara:" + (user ? dataId : "") + ":";
            if (!user) { if (/^elara[A-Z]/.test(fk) && !PERSONAL.test(fk) && !LOCAL_ONLY.test(fk)) keys[fk] = lsGet(fk); continue; }
            if (fk.indexOf(p) !== 0) continue;
            var k = fk.slice(p.length);
            if (synced(k) && !PERSONAL.test(k)) keys[k] = lsGet(fk);
        }
        return { app: "elara", version: 2, created: new Date().toISOString(), ownerId: user ? dataId : null,
                 homeName: localStorage.getItem("elaraHomeName") || "", keys: keys };
    }
    function validBackup(b) {
        return b && b.app === "elara" && b.keys && typeof b.keys === "object" &&
            Object.keys(b.keys).every(function (k) { return /^elara[A-Za-z]+$/.test(k) && !PERSONAL.test(k) && typeof b.keys[k] === "string"; });
    }
    var backup = {
        snapshot: snapshot,
        valid: validBackup,
        restore: function (b) {
            if (!isOwner()) return Promise.reject(new Error("Only the home owner can restore a backup."));
            if (!validBackup(b)) return Promise.reject(new Error("That file isn't an Elara backup."));
            var current = snapshot().keys;
            Object.keys(current).forEach(function (k) { if (!(k in b.keys)) localStorage.removeItem(k); });
            Object.keys(b.keys).forEach(function (k) { localStorage.setItem(k, b.keys[k]); });
            log("restored a backup from " + new Date(b.created).toLocaleString(), "fa-clock-rotate-left");
            return flush();
        },
        list: function () {
            if (!user || !isOwner()) return Promise.resolve([]);
            return getClient().then(function (c) { return c.from("elara_backups").select("id,created_at,label,size_bytes").order("created_at", { ascending: false }).limit(30); })
                .then(function (r) { if (r.error) throw r.error; return r.data || []; });
        },
        get: function (id) {
            return getClient().then(function (c) { return c.from("elara_backups").select("data").eq("id", id).single(); })
                .then(function (r) { if (r.error) throw r.error; return r.data.data; });
        },
        create: function (label) {
            if (!user || !isOwner()) return Promise.reject(new Error("Only the home owner can make backups."));
            return flush().then(getClient).then(function (c) {
                var data = snapshot(), text = JSON.stringify(data);
                return c.from("elara_backups").insert({ owner_id: user.id, label: String(label || "Manual backup").slice(0, 80), size_bytes: text.length, data: data })
                    .then(function (r) {
                        if (r.error) throw r.error;
                        lsSet("elara:" + user.id + ":elaraBackupCheck", String(Date.now()));
                        return c.from("elara_backups").select("id").eq("owner_id", user.id).order("created_at", { ascending: false }).range(14, 100);
                    }).then(function (old) {
                        var ids = (old.data || []).map(function (x) { return x.id; });
                        if (ids.length) return c.from("elara_backups").delete().in("id", ids);
                    });
            });
        },
        remove: function (id) {
            return getClient().then(function (c) { return c.from("elara_backups").delete().eq("id", id); }).then(function (r) { if (r.error) throw r.error; });
        },
        /* once a day, when the owner opens Elara */
        auto: function () {
            if (!user || !isOwner() || !cfg.supabaseUrl) return;
            var last = Number(lsGet("elara:" + user.id + ":elaraBackupCheck") || 0);
            if (Date.now() - last < 20 * 3600000) return;
            lsSet("elara:" + user.id + ":elaraBackupCheck", String(Date.now()));
            homeReady.then(function () {
                return backup.list().then(function (list) {
                    var newest = list[0] ? new Date(list[0].created_at).getTime() : 0;
                    if (Date.now() - newest > 24 * 3600000 && Object.keys(snapshot().keys).length) return backup.create("Automatic daily backup");
                });
            }).catch(function (e) { console.warn("[Elara] automatic backup:", e.message || e); });
        }
    };

    /* everything this person has stored (owners: the home's data; members: their personal settings only) */
    function resetData() {
        var base = shared ? fullKey(user.id, "") : (user ? fullKey(dataId, "") : ""), keys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (!user) { if (/^elara[A-Z]/.test(k)) keys.push(k); continue; }
            if (k.indexOf(base) === 0) {
                var short = k.slice(base.length);
                if (synced(short) && (!shared || PERSONAL.test(short))) keys.push(short);
            }
        }
        keys.forEach(function (k) { localStorage.removeItem(k); });
        return flush();
    }

    /* ---------------------------------------------------------
       19. Start
    --------------------------------------------------------- */
    if (user) {
        resolveHome();
        hydrate();
        homeReady.then(function () { refreshRoster(); notifications.load(); });
        if (!ssGet("elaraProfileSaved:" + user.id)) { ssSet("elaraProfileSaved:" + user.id, "1"); homeReady.then(saveProfile); }
        if (cfg.requireLogin) {
            getClient().then(function (c) {
                return c.auth.getSession().then(function (r) {
                    if (r && r.data && !r.data.session) return toLogin();
                    if (c.auth.mfa && c.auth.mfa.getAuthenticatorAssuranceLevel) {
                        return c.auth.mfa.getAuthenticatorAssuranceLevel().then(function (a) {
                            if (a && a.data && a.data.nextLevel === "aal2" && a.data.currentLevel !== "aal2") toLogin();
                        });
                    }
                });
            }).catch(function () { /* keep working offline */ });
        }
    }

    window.ElaraData = {
        user: user, info: info, prefix: user ? fullKey(dataId, "") : "", shared: shared, config: cfg, demo: DEMO,
        me: me, signOut: signOut, flush: flush, getClient: getClient, callFunction: callFunction, resetData: resetData,
        ready: function () { return homeReady; },
        onChange: onChange, emit: emit,
        get setupIssue() { return setupIssue; },
        access: { can: can, level: levelOf, get role() { return isOwner() ? "owner" : access.role; }, get perms() { return isOwner() ? null : access.perms; }, AREAS: AREAS, keyArea: keyArea },
        can: can,
        log: log, activity: activity, ago: ago, rid: rid,
        tasks: { all: tasks, save: saveTasks },
        members: { all: roster, active: people, find: person, refresh: refreshRoster, ROLE_PERMS: ROLE_PERMS, saveProfile: saveProfile },
        household: household,
        presence: { all: presence, set: setPresence },
        availability: { all: availability, on: availabilityOn, set: setAvailability },
        devices: { all: visibleDevices, everything: devices, save: saveDevices, find: findDevice, update: updateDevice, import: importDevices, set: setDevice, switch: switchDevice,
                   remove: removeDevice, id: devId, live: liveState, poll: pollDevices, TYPES: DEVICE_TYPES },
        energy: { compute: energy, integrate: integrate, tariff: tariff, load: loadEnergy },
        automations: { all: automations, save: saveAutomations, defaults: defaultAutomations },
        notify: notify, notifications: notifications,
        backup: backup,
        util: { dayKey: dayKey, addDays: addDays, startOfDay: startOfDay, pad: pad, load: load, save: save }
    };
})();
