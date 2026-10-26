/* ==========================================================
              ELARA SMART HOME PAGE
   Runs on the shared device registry (ElaraData.devices), so the
   Dashboard, Analytics and the AI assistant all see the same devices.
   Theme, logout and dialogs come from elara-common.js
========================================================== */
(function () {
    "use strict";

    var D = window.ElaraData;
    var cfg = window.ELARA_CONFIG || {};
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function toast(m, t) { if (window.ElaraUI) ElaraUI.toast(m, t); }
    if (!D) return;

    /* ---------------- registry <-> page ---------------- */
    var LABELS = {
        "Garage Door": { on: "Open", off: "Closed" },
        "Oven": { on: "ON", off: "Standby" }, "Ceiling Fan": { on: "ON", off: "Standby" }
    };
    function deviceEls() { return Array.prototype.slice.call(document.querySelectorAll(".rooms-grid .device")); }
    function nameOf(el) { return el.querySelector(".device-info h4").textContent.trim(); }
    function roomOf(el) { var h = el.closest(".room-card").querySelector(".room-title h3"); return h.textContent.trim(); }
    function inputOf(el) { return el.querySelector(".switch input"); }
    function idOf(el) { return D.devices.id(roomOf(el), nameOf(el)); }

    function paint(el) {
        var input = inputOf(el), pill = el.querySelector(".device-status");
        if (!input || !pill) return;
        var l = LABELS[nameOf(el)] || { on: "ON", off: "OFF" };
        pill.textContent = input.checked ? l.on : l.off;
        pill.classList.remove("online", "offline", "standby");
        pill.classList.add(input.checked ? "online" : (l.off === "Standby" ? "standby" : "offline"));
    }

    function deviceHTML(d) {
        return '<div class="device" data-custom="1"><div class="device-left"><i class="fa-solid ' + esc(d.icon) + '"></i>' +
            '<div class="device-info"><h4>' + esc(d.name) + '</h4><p>' + esc(d.type + (d.tuyaId ? " \u2022 CBi" : "")) + '</p></div></div>' +
            '<div class="device-right"><span class="device-status online">ON</span><label class="switch"><input type="checkbox" checked><span class="slider"></span></label></div></div>';
    }
    function roomCardHTML(room) {
        return '<div class="room-card"><div class="room-header"><div class="room-title"><i class="fa-solid fa-house"></i><div><h3>' + esc(room) + '</h3><p>0 Connected Devices</p></div></div></div><div class="device-list"></div></div>';
    }
    function findRoomList(room) {
        var cards = document.querySelectorAll(".room-card");
        for (var i = 0; i < cards.length; i++) {
            var h = cards[i].querySelector(".room-title h3");
            if (h && h.textContent.trim() === room) return cards[i].querySelector(".device-list");
        }
        var grid = document.querySelector(".rooms-grid");
        if (!grid) return null;
        grid.insertAdjacentHTML("beforeend", roomCardHTML(room));
        return grid.lastElementChild.querySelector(".device-list");
    }

    function sync() {
        // 1. every device already on the page goes into the registry
        deviceEls().forEach(function (el) {
            var icon = el.querySelector(".device-left i");
            var d = D.devices.ensure({
                name: nameOf(el), room: roomOf(el), icon: icon ? icon.className.replace("fa-solid ", "") : "fa-plug",
                type: /light/i.test(nameOf(el)) ? "Light" : "Switch", on: inputOf(el).checked
            });
            el.dataset.id = d.id;
        });
        // 2. devices that exist in the registry but not on the page (added earlier / from CBi) are drawn
        var present = {}; deviceEls().forEach(function (el) { present[el.dataset.id] = 1; });
        D.devices.all().forEach(function (d) {
            if (present[d.id]) return;
            var list = findRoomList(d.room); if (!list) return;
            list.insertAdjacentHTML("beforeend", deviceHTML(d));
            list.lastElementChild.dataset.id = d.id;
        });
        // 3. the registry is the source of truth for on/off
        deviceEls().forEach(function (el) {
            var d = D.devices.all().filter(function (x) { return x.id === el.dataset.id; })[0];
            if (d) inputOf(el).checked = d.on;
            paint(el);
            if (!el.querySelector(".device-remove")) {
                var b = document.createElement("button");
                b.type = "button"; b.className = "device-remove"; b.title = "Remove device"; b.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                el.querySelector(".device-right").appendChild(b);
            }
        });
        counts();
    }

    function counts() {
        var lights = D.devices.all().filter(function (d) { return d.on && /light/i.test(d.name); }).length;
        if ($("lightsCount")) $("lightsCount").textContent = lights;
        document.querySelectorAll(".room-card").forEach(function (room) {
            var n = room.querySelectorAll(".device").length;
            var p = room.querySelector(".room-title p");
            if (p) p.textContent = n + " Connected Device" + (n === 1 ? "" : "s");
            room.style.display = n ? "" : "none";
        });
    }

    /* ---------------- switching (local + CBi/Tuya) ---------------- */
    function remoteSet(d, on) {
        if (!d.tuyaId || !cfg.tuyaEndpoint) return Promise.resolve(true);
        return callTuya({ action: "set", deviceId: d.tuyaId, code: d.tuyaCode || "switch_1", value: on }).then(function () { return true; });
    }
    document.addEventListener("change", function (e) {
        var input = e.target;
        if (!input.matches || !input.matches('.switch input[type="checkbox"]')) return;
        var el = input.closest(".device");
        if (el) {
            var d = D.devices.all().filter(function (x) { return x.id === el.dataset.id; })[0];
            var want = input.checked;
            D.devices.set(el.dataset.id, want);
            paint(el); counts();
            remoteSet(d || {}, want).then(function () {
                toast(nameOf(el) + " turned " + (want ? "ON" : "OFF"), want ? "success" : "info");
            }).catch(function (err) {
                D.devices.set(el.dataset.id, !want); input.checked = !want; paint(el); counts();
                toast("CBi couldn\u2019t switch " + nameOf(el) + ": " + err.message, "error");
            });
            return;
        }
        var auto = input.closest(".automation-item");
        if (auto) {
            saveAutomations();
            var h = auto.querySelector("h4");
            var nm = h ? h.textContent.trim() : "Automation";
            D.log(nm + (input.checked ? " enabled" : " disabled"), "fa-robot");
            toast(nm + (input.checked ? " enabled" : " disabled"), input.checked ? "success" : "info");
        }
    });
    function saveAutomations() {
        var list = Array.prototype.map.call(document.querySelectorAll(".automation-item"), function (a) {
            return { name: a.querySelector("h4").textContent.trim(), on: a.querySelector("input").checked };
        });
        D.util.save("elaraAutomations", list);
    }
    (function restoreAutomations() {
        var saved = D.util.load("elaraAutomations", null);
        document.querySelectorAll(".automation-item").forEach(function (a) {
            var s = saved && saved.filter(function (x) { return x.name === a.querySelector("h4").textContent.trim(); })[0];
            if (s) a.querySelector("input").checked = s.on;
        });
        saveAutomations();
    })();

    /* remove a device */
    document.addEventListener("click", function (e) {
        var b = e.target.closest(".device-remove"); if (!b) return;
        var el = b.closest(".device"), name = nameOf(el);
        ElaraUI.confirm({ title: "Remove " + name + "?", message: "It will disappear from your home and from the energy statistics from now on.", confirmText: "Remove device" })
            .then(function (ok) {
                if (!ok) return;
                D.devices.remove(el.dataset.id); el.remove(); counts();
                D.log("removed device " + name, "fa-trash"); toast(name + " was removed.");
            });
    });

    /* ---------------- quick controls ---------------- */
    document.querySelectorAll(".quick-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var label = btn.querySelector("span").textContent.trim();
            function setMany(list, on) { list.forEach(function (d) { D.devices.set(d.id, on, { silent: true }); }); D.log(label + " turned " + (on ? "ON" : "OFF"), "fa-bolt"); sync(); }
            if (label === "Lights") {
                var lights = D.devices.all().filter(function (d) { return /light/i.test(d.name); });
                var any = lights.some(function (d) { return d.on; });
                setMany(lights, !any); btn.classList.toggle("active", !any); toast("All lights turned " + (any ? "OFF" : "ON"), any ? "info" : "success");
            } else if (label === "Aircon") {
                var ac = D.devices.all().filter(function (d) { return /air/i.test(d.name); });
                if (!ac.length) return toast("No air conditioner found.", "error");
                var on = !ac[0].on; setMany(ac, on); btn.classList.toggle("active", on); toast("Air conditioner turned " + (on ? "ON" : "OFF"), on ? "success" : "info");
            } else if (label === "Geyser") {
                var gy = D.devices.all().filter(function (d) { return /geyser/i.test(d.name); });
                if (!gy.length) return toast("No geyser found.", "error");
                var gOn = !gy[0].on; setMany(gy, gOn); btn.classList.toggle("active", gOn); toast("Geyser " + (gOn ? "heating water" : "turned OFF"), gOn ? "success" : "info");
            }
        });
    });

    /* ---------------- search ---------------- */
    if ($("deviceSearch")) {
        $("deviceSearch").addEventListener("input", function () {
            var q = this.value.toLowerCase().trim();
            document.querySelectorAll(".room-card").forEach(function (room) {
                var roomHit = room.querySelector(".room-title h3").textContent.toLowerCase().indexOf(q) > -1, vis = 0;
                room.querySelectorAll(".device").forEach(function (dev) {
                    var show = !q || roomHit || dev.textContent.toLowerCase().indexOf(q) > -1;
                    dev.style.display = show ? "" : "none"; if (show) vis++;
                });
                room.style.display = vis ? "" : "none";
            });
        });
    }

    /* ---------------- add device modal ---------------- */
    var modal = $("deviceModal"), form = $("deviceForm");
    function openModal() {
        if (!modal) return; if (form) form.reset();
        modal.classList.add("active"); document.body.style.overflow = "hidden";
        var n = form && form.querySelector('input[type="text"]'); if (n) setTimeout(function () { n.focus(); }, 50);
    }
    function closeModal() { if (!modal) return; modal.classList.remove("active"); document.body.style.overflow = ""; }
    if ($("addDeviceBtn")) $("addDeviceBtn").addEventListener("click", openModal);
    if ($("closeDeviceModal")) $("closeDeviceModal").addEventListener("click", closeModal);
    if ($("cancelDevice")) $("cancelDevice").addEventListener("click", closeModal);
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
    var TYPE_ICONS = { Light: "fa-lightbulb", Switch: "fa-plug", Thermostat: "fa-temperature-half" };
    if (form) {
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var name = form.querySelector('input[type="text"]').value.trim();
            var sels = form.querySelectorAll("select"), room = sels[0].value, type = sels[1].value;
            if (!name) return toast("Please enter a device name.", "error");
            if (D.devices.find(name, room)) return toast(name + " already exists in " + room + ".", "error");
            closeModal();
            var overlay = $("loadingOverlay"); if (overlay) overlay.classList.add("active");
            setTimeout(function () {
                if (overlay) overlay.classList.remove("active");
                D.devices.ensure({ name: name, room: room, type: type, icon: TYPE_ICONS[type] || "fa-microchip", on: true });
                sync(); D.log("added device " + name + " to " + room, "fa-plus"); toast(name + " added to " + room);
            }, 700);
        });
    }

    /* ---------------- CBi Home (Tuya cloud) ---------------- */
    function callTuya(body) {
        if (!cfg.tuyaEndpoint) return Promise.reject(new Error("CBi connection is not set up yet"));
        return D.getClient().then(function (c) { return c.auth.getSession(); }).then(function (s) {
            var headers = { "Content-Type": "application/json" };
            if (s.data && s.data.session) headers.Authorization = "Bearer " + s.data.session.access_token;
            if (cfg.supabaseAnonKey) headers.apikey = cfg.supabaseAnonKey;
            return fetch(cfg.tuyaEndpoint, { method: "POST", headers: headers, body: JSON.stringify(body) });
        }).then(function (r) { return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error || ("HTTP " + r.status)); return j; }); });
    }

    function addCbiButton() {
        if ($("cbiBtn")) return;
        var host = document.querySelector(".top-actions") || document.querySelector(".topbar");
        if (!host) return;
        var b = document.createElement("button");
        b.id = "cbiBtn"; b.type = "button"; b.className = "cbi-btn";
        b.innerHTML = '<i class="fa-solid fa-link"></i> CBi Home';
        host.insertBefore(b, host.firstChild);
        b.addEventListener("click", openCbi);
    }
    function openCbi() {
        var old = $("cbiModal"); if (old) old.remove();
        var linked = D.util.load("elaraCbiLinked", false);
        var ov = document.createElement("div");
        ov.id = "cbiModal"; ov.className = "eui-overlay";
        ov.innerHTML =
            '<div class="eui-box cbi-box">' +
                '<div class="eui-icon info"><i class="fa-solid fa-link"></i></div>' +
                '<h3>Connect CBi Home</h3>' +
                '<p>CBi Home is the Smart Life app with CBi\u2019s name on it, and both run on the Tuya cloud. Tuya only lets Elara link to the <strong>Smart Life</strong> app, so a CBi switch has to be moved there first.</p>' +
                (cfg.tuyaEndpoint
                    ? '<div class="cbi-status ' + (linked ? "ok" : "") + '">' + (linked ? '<i class="fa-solid fa-circle-check"></i> Connected' : '<i class="fa-solid fa-plug"></i> Ready to connect') + '</div>' +
                      '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-r="0">Close</button><button type="button" class="eui-btn primary" data-sync="1">' + (linked ? "Sync devices" : "Connect &amp; import devices") + '</button></div>'
                    : '<ol class="cbi-steps"><li>In <strong>CBi Home</strong>, remove the switch. Put it in pairing mode (reset it).</li>' +
                      '<li>In <strong>Smart Life</strong>, add it. If scanning finds nothing, add it by category (for example Electrical &gt; Switch Module).</li>' +
                      '<li>On iot.tuya.com, link your Smart Life account with the QR code, then deploy <code>elara-tuya</code> (see <em>README-SETUP.md</em>).</li>' +
                      '<li>Paste its URL into <code>tuyaEndpoint</code> in <code>elara-config.js</code> and press Connect here.</li></ol>' +
                      '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-r="0">Close</button></div>') +
            '</div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        ov.addEventListener("click", function (e) {
            if (e.target === ov || e.target.closest("[data-r]")) return ov.remove();
            var s = e.target.closest("[data-sync]");
            if (!s) return;
            s.disabled = true; s.textContent = "Connecting...";
            callTuya({ action: "list" }).then(function (res) {
                var added = 0;
                (res.devices || []).forEach(function (t) {
                    var ex = D.devices.all().filter(function (d) { return d.tuyaId === t.id; })[0];
                    if (ex) { D.devices.set(ex.id, !!t.on, { silent: true }); return; }
                    var d = D.devices.ensure({ name: t.name, room: t.room || "CBi Devices", icon: t.icon || "fa-plug", type: "Switch", watts: t.watts, on: !!t.on });
                    var all = D.devices.all(); all.forEach(function (x) { if (x.id === d.id) { x.tuyaId = t.id; x.tuyaCode = t.code || "switch_1"; } }); D.devices.save(all);
                    added++;
                });
                D.util.save("elaraCbiLinked", true);
                D.log("synced CBi Home (" + added + " new device" + (added === 1 ? "" : "s") + ")", "fa-link");
                ov.remove(); sync(); toast("CBi Home connected. " + added + " new device" + (added === 1 ? "" : "s") + " imported.");
            }).catch(function (err) {
                s.disabled = false; s.textContent = "Try again"; toast("Couldn\u2019t reach CBi: " + err.message, "error");
            });
        });
    }

    /* ---------------- energy chart (real history) ---------------- */
    function drawChart() {
        var canvas = $("energyChart");
        if (!canvas || typeof Chart === "undefined") return;
        var e = D.energy.compute("week"), names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], labels = [];
        for (var i = 6; i >= 0; i--) labels.push(names[D.util.addDays(new Date(), -i).getDay()]);
        new Chart(canvas, {
            type: "line",
            data: { labels: labels, datasets: [{ label: "Energy (kWh)", data: e.series.map(function (v) { return +v.toFixed(2); }),
                borderColor: "#6C63FF", backgroundColor: "rgba(108,99,255,.15)", fill: true, tension: .4, borderWidth: 3, pointRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#b8bfd9" } } },
                scales: { x: { ticks: { color: "#b8bfd9" }, grid: { color: "rgba(255,255,255,.05)" } }, y: { beginAtZero: true, ticks: { color: "#b8bfd9" }, grid: { color: "rgba(255,255,255,.05)" } } } }
        });
    }

    /* ---------------- activity feed (real log) ---------------- */
    function renderActivity() {
        var list = document.querySelector(".activity-list"); if (!list) return;
        var items = D.activity(6);
        list.innerHTML = items.length ? items.map(function (a) {
            return '<div class="activity-item"><div class="activity-left"><div class="activity-icon"><i class="fa-solid ' + esc(a.icon) + '"></i></div>' +
                   '<div class="activity-info"><h4>' + esc(a.who) + " " + esc(a.text) + '</h4><p>' + esc(D.ago(a.t)) + '</p></div></div><span class="activity-time">' + esc(D.ago(a.t)) + '</span></div>';
        }).join("") : '<p style="opacity:.65;padding:16px">No activity yet.</p>';
    }
    document.addEventListener("change", function (e) { if (e.target.closest && e.target.closest(".switch")) setTimeout(renderActivity, 50); });


    /* ---------------- numbers on this page come from real data ---------------- */
    function compare(change, what) {
        if (change === null) return "No earlier data to compare";
        if (change === 0) return "Same as " + what;
        return Math.abs(change) + "% " + (change < 0 ? "lower" : "higher") + " than " + what;
    }
    function cardByTitle(selector, title) {
        return Array.prototype.filter.call(document.querySelectorAll(selector), function (c) {
            var h = c.querySelector("h3"); return h && h.textContent.trim() === title;
        })[0];
    }
    function setCard(card, value, note) {
        if (!card) return;
        card.querySelector("h2").textContent = value;
        if (note) card.querySelector("p").textContent = note;
    }
    function renderEnergyCards() {
        var today = D.energy.compute("today"), week = D.energy.compute("week"), month = D.energy.compute("month");
        setCard(cardByTitle(".energy-card", "Today"), today.total.toFixed(1) + " kWh", compare(today.change, "yesterday"));
        setCard(cardByTitle(".energy-card", "This Week"), week.total.toFixed(1) + " kWh", compare(week.change, "last week"));
        setCard(cardByTitle(".energy-card", "This Month"), month.total.toFixed(1) + " kWh", "About R" + month.cost.toFixed(0) + " at R" + month.tariff.toFixed(2) + "/kWh");
        setCard(cardByTitle(".stats .card", "Power Usage"), today.total.toFixed(1) + " kWh", "Today\u2019s Usage");
    }

    /* outside temperature (the page has no indoor sensor): real weather for the home's place */
    function renderTemperature() {
        var card = cardByTitle(".stats .card", "Temperature");
        if (!card) return;
        card.querySelector("h3").textContent = "Outside Temperature";
        function show(w) { setCard(card, window.ElaraCommon ? ElaraCommon.fmtTemp(w.temp) : Math.round(w.temp) + "\u00b0C", w.city); }
        try { var c = JSON.parse(sessionStorage.getItem("elaraTemp") || "null"); if (c && Date.now() - c.t < 15 * 60000) return show(c); } catch (e) { /* ignore */ }
        var home = null; try { home = JSON.parse(localStorage.getItem("elaraHomeCoords") || "null"); } catch (e) { /* ignore */ }
        var lat = home ? home.lat : (cfg.defaultLat || -26.2041), lon = home ? home.lon : (cfg.defaultLon || 28.0473);
        var city = home ? (home.city || String(home.label || "").split(",")[0]) : (localStorage.getItem("elaraHomeCity") || cfg.defaultCity || "Home");
        card.querySelector("p").textContent = "Loading...";
        fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m&timezone=" + encodeURIComponent(localStorage.getItem("elaraTimezone") || "auto"))
            .then(function (r) { if (!r.ok) throw new Error("weather"); return r.json(); })
            .then(function (j) { var w = { temp: j.current.temperature_2m, city: city, t: Date.now() }; try { sessionStorage.setItem("elaraTemp", JSON.stringify(w)); } catch (e) { /* ignore */ } show(w); })
            .catch(function () { setCard(card, "--", "Weather unavailable"); });
    }

    sync(); addCbiButton(); drawChart(); renderActivity(); renderEnergyCards(); renderTemperature();
    document.addEventListener("change", function (e) { if (e.target.closest && e.target.closest(".device .switch")) setTimeout(renderEnergyCards, 60); });
    setInterval(renderActivity, 30000);

    /* ---------------- live power from CBi switches (feeds Analytics) ---------------- */
    // Tuya sends raw numbers: power in 0.1 W, voltage in 0.1 V, current in mA, energy in 0.001 kWh.
    // If the first reading looks 10x or 100x off, change the matching number in tuyaScales (elara-config.js).
    var SCALES = { cur_power: 1, cur_voltage: 1, cur_current: 0, add_ele: 3 };
    var cfgScales = cfg.tuyaScales || {};
    function readCode(status, code) {
        var v = null;
        if (Array.isArray(status)) status.forEach(function (s) { if (s && s.code === code) v = s.value; });
        else if (status && typeof status === "object" && code in status) v = status[code];
        return v;
    }
    function readNum(res, code) {
        var v = readCode(res.status || res.result || res, code);
        if (v == null || v === "" || isNaN(Number(v))) return null;
        var sc = cfgScales[code] != null ? cfgScales[code] : (res.scales && res.scales[code] != null ? res.scales[code] : SCALES[code]);
        return Number(v) / Math.pow(10, sc || 0);
    }
    function fmtPower(w) { return w >= 1000 ? (w / 1000).toFixed(2) + " kW" : Math.round(w) + " W"; }

    function pollPower() {
        if (!cfg.tuyaEndpoint || document.hidden) return;
        D.devices.all().filter(function (d) { return d.tuyaId; }).forEach(function (d) {
            callTuya({ action: "status", deviceId: d.tuyaId }).then(function (res) {
                var w = readNum(res, "cur_power");
                if (w == null) {
                    if (!sessionStorage.getItem("elaraNoMeterWarn")) {
                        sessionStorage.setItem("elaraNoMeterWarn", "1");
                        toast(d.name + " isn\u2019t sending power readings yet, so Analytics keeps estimating.", "info");
                    }
                    return;
                }
                var on = readCode(res.status || res.result || res, d.tuyaCode || "switch_1");
                on = on === true || on === "true" ? true : on === false || on === "false" ? false : d.on;
                var el = document.querySelector('.device[data-id="' + d.id + '"]');
                if (on !== d.on) {                       // switched outside Elara (e.g. in the CBi app): follow it
                    D.devices.set(d.id, on, { silent: true });
                    if (el) { var inp = inputOf(el); if (inp) inp.checked = on; paint(el); counts(); }
                }
                D.devices.record(d.id, { w: w, e: readNum(res, "add_ele"), on: on });
                if (el) {
                    var p = el.querySelector(".device-info p");
                    if (p) p.textContent = d.type + " \u2022 CBi \u2022 " + fmtPower(w);
                }
                renderEnergyCards();
            }).catch(function (err) { console.warn("CBi power reading failed:", err.message); });
        });
    }
    var pollMs = Math.max(30, Number(cfg.tuyaPollSeconds) || 60) * 1000;   // each reading is one Tuya API call
    setTimeout(pollPower, 1500);
    setInterval(pollPower, pollMs);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) pollPower(); });
    document.addEventListener("change", function (e) {   // after switching a CBi device, read it again shortly
        if (e.target && e.target.matches && e.target.matches('.switch input[type="checkbox"]')) setTimeout(pollPower, 5000);
    });
})();
