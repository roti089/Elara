/* ==========================================================
   ELARA SERVICE WORKER
   Shows push notifications (even when Elara is closed) and opens the
   right page when one is tapped. Must sit in the same folder as the pages.
========================================================== */
/* ---------- app shell cache: Elara opens fast and still shows something when offline ----------
   Pages: network first (always the newest version when online), cached copy when offline.
   Scripts, styles, icons: also network first, cached copy when offline.
   Supabase, weather and other websites are never cached (your data always comes live). */
var CACHE = "elara-v8";   // change this number after updating files so phones fetch the new version
var SHELL = [
    "dashboard-content.html", "dashboard-tasks.html", "dashboard-shopping.html", "dashboard-schedule.html",
    "dashboard-smart-home.html", "dashboard-analytics.html", "dashboard-reports.html", "dashboard-members.html",
    "dashboard-settings.html", "Loginpage.html", "Homepage.html", "offline.html",
    "elara-config.js", "elara-data.js", "elara-theme.js", "elara-assistant.js", "elara-common.js", "elara-features.js", "elara-pwa.js", "guest.html",
    "dashboard-content.js", "dashboard-content.css", "dashboard-tasks.js", "dashboard-tasks.css", "dashboard-shopping.js", "dashboard-shopping.css", "dashboard-schedule.js", "dashboard-schedule.css", "dashboard-smart-home.js", "dashboard-smart-home.css", "dashboard-analytics.js", "dashboard-analytics.css", "dashboard-reports.js", "dashboard-reports.css", "dashboard-members.js", "dashboard-members.css", "dashboard-settings.js", "dashboard-settings.css",
    "elara-sidebar.css", "manifest.webmanifest", "Elara logo.png", "favicon.ico",
    "icons/icon-192.png", "icons/icon-512.png", "icons/badge-96.png", "icons/sc-shop.png", "icons/sc-task.png", "icons/sc-geyser.png", "icons/sc-voice.png"
];
self.addEventListener("install", function (e) {
    e.waitUntil(caches.open(CACHE).then(function (c) {
        return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf("elara-") === 0 && k !== CACHE && !/-lib$/.test(k); }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
    var req = e.request, url = new URL(req.url);
    if (req.method !== "GET") return;
    // versioned libraries (icons font, Supabase, charts, receipt reader): keep a copy so Elara works offline
    if (/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//.test(req.url) && /@\d|\/\d+\.\d+\.\d+\//.test(req.url)) {
        e.respondWith(caches.open("elara-lib").then(function (c) {
            return c.match(req).then(function (hit) {
                return hit || fetch(req).then(function (res) { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; });
            });
        }));
        return;
    }
    if (url.origin !== self.location.origin) return;                              // Supabase, APIs: straight to the network
    if (req.mode === "navigate") {
        e.respondWith(fetch(req).then(function (res) {
            var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(url.pathname.split("/").pop() || "Homepage.html", copy); });
            return res;
        }).catch(function () {
            var name = url.pathname.split("/").pop() || "Homepage.html";
            return caches.match(name).then(function (r) { return r || caches.match("offline.html"); });
        }));
        return;
    }
    // network first so a new version is never mixed with an old one; the cache is the offline fallback
    e.respondWith(fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
});

self.addEventListener("push", function (event) {
    var data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "Elara", body: event.data ? event.data.text() : "" }; }
    var title = data.title || "Elara";
    event.waitUntil(self.registration.showNotification(title, {
        body: data.body || "",
        icon: "icons/icon-192.png",
        badge: "icons/badge-96.png",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        data: { href: data.href || "dashboard-content.html" }
    }));
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    var href = (event.notification.data && event.notification.data.href) || "dashboard-content.html";
    var url = new URL(href, self.registration.scope).href;
    event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) {
            if ("focus" in list[i]) { list[i].navigate(url).catch(function () {}); return list[i].focus(); }
        }
        return self.clients.openWindow(url);
    }));
});
