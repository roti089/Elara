/* ==========================================================
              ELARA SMART HOME
   Your real CBi Home / Smart Life switches: switch them, see their live
   power, the energy their meters measured, and set up automations.
   Nothing here is made up: a switch without a power meter shows no energy.
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI, C = window.ElaraCommon || {}, cfg = window.ELARA_CONFIG || {}, F = window.ElaraFeatures;
    if (!D) return;
    window.ElaraPageLive = true;

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function canEdit() { return D.can("smartHome", "edit"); }
    function kwh(v) { return v < 0.1 ? (v * 1000).toFixed(0) + " Wh" : (v < 10 ? v.toFixed(2) : v.toFixed(1)) + " kWh"; }
    function watts(w) { return w == null ? "—" : w >= 1000 ? (w / 1000).toFixed(2) + " kW" : Math.round(w) + " W"; }
    var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var ROOM_ICONS = { "Living Room": "fa-couch", Kitchen: "fa-kitchen-set", Bedroom: "fa-bed", Garage: "fa-warehouse", Bathroom: "fa-bath", Garden: "fa-seedling", Office: "fa-briefcase", Outside: "fa-tree", "CBi Devices": "fa-link" };
    var ROOMS = ["Living Room", "Kitchen", "Bedroom", "Bathroom", "Garage", "Garden", "Outside", "Office", "CBi Devices"];
    var query = "";
    var cbiReady = !!(cfg.tuyaEndpoint && D.user);

    /* ---------------- banner: what to do next ---------------- */
    function renderBanner() {
        var b = $("smartBanner"), devs = D.devices.all();
        var msg = "";
        if (D.demo) msg = '<i class="fa-solid fa-flask"></i> Demo mode: these devices aren’t real. Log in and connect CBi Home to control your own switches.';
        else if (!cfg.tuyaEndpoint) msg = '<i class="fa-solid fa-link-slash"></i> CBi Home isn’t connected yet. Deploy the <code>elara-tuya</code> function (README, step 8), then press <strong>CBi Home</strong>.';
        else if (!devs.length) msg = '<i class="fa-solid fa-plug-circle-plus"></i> No switches yet. Press <strong>CBi Home</strong> to import the switches from your Smart Life account.';
        b.hidden = !msg; b.innerHTML = msg;
    }

    /* ---------------- rooms + devices ---------------- */
    function renderRooms() {
        var all = D.devices.all(), grid = $("roomsGrid"), rooms = {};
        all.forEach(function (d) { (rooms[d.room] = rooms[d.room] || []).push(d); });
        var names = Object.keys(rooms).sort(function (a, b) { var ia = ROOMS.indexOf(a), ib = ROOMS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
        grid.innerHTML = names.map(function (room) {
            var list = rooms[room].filter(function (d) { return !query || (d.name + " " + room + " " + d.type).toLowerCase().indexOf(query) > -1; });
            if (!list.length) return "";
            var on = rooms[room].filter(function (d) { return d.on; }).length;
            return '<div class="room-card"><div class="room-header"><div class="room-title"><i class="fa-solid ' + (ROOM_ICONS[room] || "fa-house") + '"></i><div><h3>' + esc(room) + "</h3><p>" +
                rooms[room].length + " device" + (rooms[room].length === 1 ? "" : "s") + " • " + on + " on</p></div></div></div><div class=\"device-list\">" + list.map(deviceHTML).join("") + "</div></div>";
        }).join("") || (all.length ? '<div class="panel smart-empty"><i class="fa-solid fa-magnifying-glass"></i><p>No devices match your search.</p></div>' : "");
    }
    function deviceHTML(d) {
        var st = D.devices.live(d) || {}, offline = st.online === false, by = d.changedBy ? D.members.find(d.changedBy) : null;
        var power = d.tuyaId ? (offline ? "Offline" : d.hasMeter || st.watts != null ? watts(d.on ? st.watts : 0) + " now" : "No power meter") : "Demo device";
        var who = d.changedAt ? (d.on ? "on" : "off") + " " + (by ? "by " + (by.isMe ? "you" : by.name) + " " : "") + D.ago(d.changedAt) : "";
        var lim = F ? F.leftOn.hours(d) : 0, onFor = d.on && st.since ? (Date.now() - st.since) / 3600000 : 0;
        if (lim && onFor >= lim) who = "on for " + Math.floor(onFor) + " h" + (who ? " • " + who : "");
        return '<div class="device' + (offline ? " is-offline" : "") + (lim && onFor >= lim ? " left-on" : "") + '" data-id="' + esc(d.id) + '"><div class="device-left"><i class="fa-solid ' + esc(d.icon || "fa-plug") + '"></i><div class="device-info"><h4>' + esc(d.name) + "</h4><p>" +
            esc(power + (who ? " • " + who : "")) + "</p></div></div>" +
            '<div class="device-right"><span class="device-status ' + (offline ? "offline" : d.on ? "online" : "standby") + '">' + (offline ? "Offline" : d.on ? "ON" : "OFF") + "</span>" +
            '<label class="switch"><input type="checkbox"' + (d.on ? " checked" : "") + (canEdit() && !offline ? "" : " disabled") + ' aria-label="' + esc(d.name + " in " + d.room) + '"><span class="slider"></span></label>' +
            (canEdit() ? '<button type="button" class="device-edit" title="Edit" aria-label="Edit ' + esc(d.name) + '"><i class="fa-solid fa-pen"></i></button>' : "") + "</div></div>";
    }
    $("roomsGrid").addEventListener("change", function (e) {
        var input = e.target; if (!input.matches(".switch input")) return;
        var d = D.devices.find(input.closest(".device").dataset.id), want = input.checked;
        if (!d) return;
        input.disabled = true;
        D.devices.switch(d.id, want).then(function () { UI.toast(d.name + " turned " + (want ? "ON" : "OFF"), want ? "success" : "info"); })
            .catch(function (err) { input.checked = !want; UI.toast("Couldn’t switch " + d.name + ": " + err.message, "error"); })
            .then(render);
    });
    $("roomsGrid").addEventListener("click", function (e) {
        var b = e.target.closest(".device-edit"); if (!b || !canEdit()) return;
        var d = D.devices.find(b.closest(".device").dataset.id); if (!d) return;
        var rooms = ROOMS.concat(D.devices.all().map(function (x) { return x.room; })).filter(function (r, i, a) { return a.indexOf(r) === i; });
        UI.form({
            title: "Edit " + d.name, icon: d.icon || "fa-plug", submitText: "Save",
            text: "This only changes how the device appears in Elara. The type is used by the quick buttons and automations.",
            fields: [
                { name: "name", label: "Name", value: d.name, required: true, maxlength: 40 },
                { name: "room", label: "Room", type: "select", value: d.room, options: rooms.concat(["New room..."]) },
                { name: "newRoom", label: "New room name (if you chose New room)", value: "", maxlength: 30 },
                { name: "type", label: "Type", type: "select", value: d.type || "Plug", options: Object.keys(D.devices.TYPES) },
                { name: "leftOnHours", label: "Warn me if it's left on for", type: "select", value: String(F ? F.leftOn.hours(d) : 0),
                  options: [["0", "Never"], ["1", "1 hour"], ["2", "2 hours"], ["3", "3 hours"], ["4", "4 hours"], ["6", "6 hours"], ["8", "8 hours"], ["12", "12 hours"], ["24", "24 hours"]] },
                { name: "hidden", label: "Show in Elara", type: "select", value: "no", options: [["no", "Yes"], ["yes", "No, hide this device"]] }
            ],
            validate: function (v) {
                if (v.name.length < 2 || v.name.length > 40 || !/[a-z]/i.test(v.name) || /[<>]/.test(v.name)) return "The name must be 2 to 40 characters with a letter, without < or >.";
                if (v.room === "New room..." && (v.newRoom.length < 2 || v.newRoom.length > 30 || /[<>]/.test(v.newRoom))) return "Type a room name of 2 to 30 characters.";
                return null;
            }
        }).then(function (v) {
            if (!v) return;
            var room = v.room === "New room..." ? v.newRoom : v.room;
            D.devices.update(d.id, { name: v.name, room: room, type: v.type, hidden: v.hidden === "yes", leftOnHours: v.type !== d.type && d.leftOnHours == null && F && Number(v.leftOnHours) === F.leftOn.hours(d) ? null : Number(v.leftOnHours) });
            D.log("updated device " + v.name, "fa-pen");
            UI.toast(v.hidden === "yes" ? v.name + " is hidden. Show it again from CBi Home." : "Saved."); render();
        });
    });

    /* ---------------- stats ---------------- */
    function renderStats() {
        var all = D.devices.all(), e = D.energy.compute("today");
        $("activeDevices").textContent = all.filter(function (d) { return d.on; }).length;
        $("devicesNote").textContent = "of " + all.length + " device" + (all.length === 1 ? "" : "s");
        $("livePower").textContent = e.metered ? watts(e.livePower) : "—";
        $("liveNote").textContent = e.metered ? "From " + e.metered + " switch" + (e.metered === 1 ? "" : "es") + " with a power meter" : "None of your switches report power";
        $("powerToday").textContent = e.hasData || e.metered ? kwh(e.total) : "—";
        $("todayNote").textContent = e.hasData ? "About R" + e.cost.toFixed(2) + " at R" + e.tariff.toFixed(2) + "/kWh" : "Measured by your switches";
        document.querySelectorAll(".quick-btn[data-quick]").forEach(function (b) {
            var g = group(b.dataset.quick); b.classList.toggle("active", b.dataset.quick !== "alloff" && g.some(function (d) { return d.on; }));
            b.disabled = !g.length;
        });
    }
    function compare(change, what) {
        if (change === null) return "Nothing earlier to compare";
        if (change === 0) return "Same as " + what;
        return Math.abs(change) + "% " + (change < 0 ? "lower" : "higher") + " than " + what;
    }
    function renderEnergy() {
        var t = D.energy.compute("today"), w = D.energy.compute("week"), m = D.energy.compute("month");
        var any = t.metered || w.hasData || m.hasData;
        $("eToday").textContent = any ? kwh(t.total) : "—"; $("eTodayNote").textContent = any ? compare(t.change, "yesterday") : "";
        $("eWeek").textContent = any ? kwh(w.total) : "—"; $("eWeekNote").textContent = any ? compare(w.change, "the week before") : "";
        $("eMonth").textContent = any ? kwh(m.total) : "—"; $("eMonthNote").textContent = any ? "About R" + m.cost.toFixed(0) + " at R" + m.tariff.toFixed(2) + "/kWh" : "";
        $("energyNote").textContent = !t.connected ? "Connect CBi switches with a power meter to see real energy use"
            : !t.metered ? "Your switches are connected, but none of them report power"
            : "Measured by " + t.metered + " switch" + (t.metered === 1 ? "" : "es") + (t.updated ? " • updated " + D.ago(t.updated) : "");
        drawChart(w);
    }
    var chart = null;
    function drawChart(w) {
        var canvas = $("energyChart"), empty = !w.hasData;
        $("chartEmpty").hidden = !empty; canvas.style.display = empty ? "none" : "";
        if (empty || typeof Chart === "undefined") return;
        var labels = [];
        for (var i = 6; i >= 0; i--) labels.push(DAYS[D.util.addDays(new Date(), -i).getDay()]);
        var data = w.series.map(function (v) { return +v.toFixed(3); });
        var light = document.body.classList.contains("light-theme"), tick = light ? "#4b5375" : "#b8bfd9", grid = light ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.05)";
        if (chart) { chart.data.labels = labels; chart.data.datasets[0].data = data; chart.update(); return; }
        chart = new Chart(canvas, {
            type: "bar",
            data: { labels: labels, datasets: [{ label: "kWh", data: data, backgroundColor: "#6C63FF", borderRadius: 8, maxBarThickness: 46 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tick }, grid: { color: grid } } } }
        });
    }
    function renderByPerson() {
        var per = {}, tf = D.energy.tariff();
        D.energy.integrate("week", null, 0, false, null, null, function (k, dev, when, by) { var key = by || "auto"; per[key] = (per[key] || 0) + k; });
        var total = Object.keys(per).reduce(function (s, k) { return s + per[k]; }, 0);
        var rows = Object.keys(per).map(function (k) {
            var p = k === "auto" ? null : D.members.find(k);
            return { name: k === "auto" ? "Automations / CBi app" : p ? (p.isMe ? p.name + " (you)" : p.name) : "Former member", kwh: per[k] };
        }).filter(function (r) { return r.kwh >= 0.0005; }).sort(function (a, b) { return b.kwh - a.kwh; });
        $("energyByPerson").innerHTML = rows.length ? rows.map(function (r) {
            var pct = total ? Math.round(r.kwh / total * 100) : 0;
            return '<div class="person-energy"><div><strong>' + esc(r.name) + "</strong><small>" + kwh(r.kwh) + " • R" + (r.kwh * tf).toFixed(2) + "</small></div><span>" + pct + '%</span><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
        }).join("") + (D.can("reports") ? '<a class="report-link" href="dashboard-reports.html">Full report per person <i class="fa-solid fa-arrow-right"></i></a>' : "")
            : '<p class="muted">Nothing measured in the last 7 days.</p>';
    }

    /* ---------------- automations ---------------- */
    function describe(a) {
        var names = D.devices.all().filter(function (d) { return a.devices.indexOf(d.id) > -1; }).map(function (d) { return d.name; });
        var what = (names.length ? (names.length <= 2 ? names.join(" and ") : names.length + " devices") : "no devices yet") + " " + (a.action === "on" ? "on" : "off");
        var days = !a.days.length || a.days.length === 7 ? "Every day" : a.days.join() === "1,2,3,4,5" ? "Weekdays" : a.days.join() === "0,6" ? "Weekends" : a.days.map(function (d) { return DAYS[d]; }).join(", ");
        var off = a.offset ? " " + (a.offset > 0 ? "+" : "−") + Math.abs(a.offset) + " min" : "";
        if (a.kind === "manual") return "Run it yourself • " + what;
        return days + (a.kind === "time" ? " at " + a.at : a.kind === "sunset" ? " at sunset" + off : " at sunrise" + off) + " • " + what;
    }
    function renderAutomations() {
        var paused = !(C.homeAuto ? C.homeAuto().automations : true), list = D.automations.all();
        $("autoNote").textContent = paused ? "Paused in Settings > Smart Home" : cfg.serverAutomations ? "Run by the server, even when Elara is closed" : "Run while Elara is open on a device in the home";
        $("automationList").innerHTML = list.map(function (a) {
            var ctrl = a.kind === "manual"
                ? '<button type="button" class="ghost-btn" data-run="' + esc(a.id) + '"' + (canEdit() && a.devices.length ? "" : " disabled") + '>Run now</button>'
                : '<label class="switch"><input type="checkbox" data-auto="' + esc(a.id) + '"' + (a.on ? " checked" : "") + (canEdit() ? "" : " disabled") + ' aria-label="' + esc(a.name) + '"><span class="slider"></span></label>';
            return '<div class="automation-item' + (a.devices.length ? "" : " incomplete") + '"><div class="automation-left"><i class="fa-solid ' + esc(a.icon) + '"></i><div><h4>' + esc(a.name) + "</h4><p>" + esc(describe(a)) + "</p></div></div>" +
                '<div class="auto-actions">' + ctrl + (canEdit() ? '<button type="button" class="device-edit" data-edit-auto="' + esc(a.id) + '" aria-label="Edit ' + esc(a.name) + '"><i class="fa-solid fa-pen"></i></button>' : "") + "</div></div>";
        }).join("") || '<p class="muted">No automations.</p>';
    }
    $("automationList").addEventListener("change", function (e) {
        var input = e.target.closest("[data-auto]"); if (!input || !canEdit()) return;
        var list = D.automations.all(), a = list.filter(function (x) { return x.id === input.dataset.auto; })[0];
        if (!a) return;
        if (input.checked && !a.devices.length) { input.checked = false; UI.toast("Choose which devices “" + a.name + "” should switch first (pencil button).", "error"); return; }
        if (input.checked && a.kind !== "time" && !D.util.load("elaraHomeCoords", null)) UI.toast("Set your home location in Settings so sunrise and sunset are right.", "info");
        a.on = input.checked; D.automations.save(list);
        D.log(a.name + (a.on ? " switched on" : " switched off"), "fa-robot");
        UI.toast(a.name + (a.on ? " is on." : " is off."), a.on ? "success" : "info");
        renderAutomations();
    });
    $("automationList").addEventListener("click", function (e) {
        var run = e.target.closest("[data-run]"), ed = e.target.closest("[data-edit-auto]");
        if (run && canEdit()) {
            var a = D.automations.all().filter(function (x) { return x.id === run.dataset.run; })[0]; if (!a) return;
            run.disabled = true;
            (C.runAutomation ? C.runAutomation(a, false) : Promise.resolve({ switched: 0, failed: 0 })).then(function (r) {
                if (a.id === "away") D.notify({ to: "household", kind: "security", title: "Away Mode", body: D.me().first + " ran Away Mode (" + r.switched + " device" + (r.switched === 1 ? "" : "s") + " off).", href: "dashboard-smart-home.html" });
                UI.toast(a.name + ": " + r.switched + " switched" + (r.failed ? ", " + r.failed + " failed (offline?)" : "") + ".", r.failed ? "error" : "success");
                run.disabled = false; render();
            });
        }
        if (ed && canEdit()) editAutomation(D.automations.all().filter(function (x) { return x.id === ed.dataset.editAutomation || x.id === ed.dataset.editAuto; })[0]);
    });
    $("addAutomation").addEventListener("click", function () { if (canEdit()) editAutomation(null); });

    function editAutomation(a) {
        var isNew = !a;
        a = a || { id: "a" + Date.now().toString(36), name: "", icon: "fa-clock", kind: "time", at: "18:00", offset: 0, days: [], action: "on", on: true, devices: [] };
        var devs = D.devices.all();
        var ov = document.createElement("div");
        ov.className = "eui-overlay";
        ov.innerHTML = '<form class="eui-box eui-form auto-form" novalidate><div class="eui-icon info"><i class="fa-solid fa-robot"></i></div><h3>' + (isNew ? "New automation" : "Edit automation") + "</h3>" +
            '<label>Name<input name="name" maxlength="40" value="' + esc(a.name) + '" placeholder="e.g. Pool pump"></label>' +
            '<label>When<select name="kind"><option value="time">At a time</option><option value="sunset">At sunset</option><option value="sunrise">At sunrise</option><option value="manual">Only when I press Run</option></select></label>' +
            '<label class="k-time">Time<input type="time" name="at" value="' + esc(a.at || "18:00") + '"></label>' +
            '<label class="k-sun">Minutes before (−) or after (+)<input type="number" name="offset" min="-120" max="120" step="5" value="' + esc(a.offset || 0) + '"></label>' +
            '<fieldset class="k-days"><legend>Days (none ticked = every day)</legend><div class="day-picks">' + DAYS.map(function (d, i) {
                return '<label><input type="checkbox" name="day" value="' + i + '"' + (a.days.indexOf(i) > -1 ? " checked" : "") + "> " + d + "</label>";
            }).join("") + "</div></fieldset>" +
            '<label>Switch them<select name="action"><option value="on">On</option><option value="off">Off</option></select></label>' +
            '<fieldset><legend>Which devices</legend><div class="dev-picks">' + (devs.length ? devs.map(function (d) {
                return '<label><input type="checkbox" name="dev" value="' + esc(d.id) + '"' + (a.devices.indexOf(d.id) > -1 ? " checked" : "") + "> " + esc(d.name) + " <small>" + esc(d.room) + "</small></label>";
            }).join("") : "<p>No devices yet. Connect CBi Home first.</p>") + "</div></fieldset>" +
            '<p class="eui-err" aria-live="assertive"></p><div class="eui-actions">' + (isNew ? "" : '<button type="button" class="eui-btn danger" data-del>Delete</button>') +
            '<button type="button" class="eui-btn ghost" data-close>Cancel</button><button type="submit" class="eui-btn primary">Save</button></div></form>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        var f = ov.querySelector("form");
        f.kind.value = a.kind; f.action.value = a.action;
        function sync() {
            var k = f.kind.value;
            f.querySelector(".k-time").style.display = k === "time" ? "" : "none";
            f.querySelector(".k-sun").style.display = k === "sunset" || k === "sunrise" ? "" : "none";
            f.querySelector(".k-days").style.display = k === "manual" ? "none" : "";
        }
        sync(); f.kind.addEventListener("change", sync);
        f.name.focus();
        function close() { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); }
        ov.addEventListener("click", function (e) {
            if (e.target === ov || e.target.closest("[data-close]")) close();
            if (e.target.closest("[data-del]")) UI.confirm({ title: "Delete “" + a.name + "”?", message: "It will stop running.", confirmText: "Delete" }).then(function (ok) {
                if (!ok) return;
                D.automations.save(D.automations.all().filter(function (x) { return x.id !== a.id; }));
                D.log("deleted automation " + a.name, "fa-trash"); close(); render();
            });
        });
        ov.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            var v = { name: f.name.value.trim(), kind: f.kind.value, at: f.at.value, offset: Number(f.offset.value), action: f.action.value,
                      days: Array.prototype.map.call(f.querySelectorAll('[name="day"]:checked'), function (x) { return Number(x.value); }),
                      devices: Array.prototype.map.call(f.querySelectorAll('[name="dev"]:checked'), function (x) { return x.value; }) };
            var err = v.name.length < 2 || v.name.length > 40 || /[<>]/.test(v.name) ? "Give it a name of 2 to 40 characters."
                : v.kind === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.at) ? "Choose a time."
                : (v.kind === "sunset" || v.kind === "sunrise") && (!isFinite(v.offset) || v.offset < -120 || v.offset > 120) ? "The offset must be between −120 and 120 minutes."
                : !v.devices.length ? "Tick at least one device." : null;
            if (err) { f.querySelector(".eui-err").textContent = err; return; }
            var list = D.automations.all(), idx = -1;
            list.forEach(function (x, i) { if (x.id === a.id) idx = i; });
            var item = Object.assign({}, a, v, { icon: v.kind === "manual" ? a.icon || "fa-wand-magic-sparkles" : v.kind === "time" ? (a.icon && a.icon !== "fa-cloud-sun" ? a.icon : "fa-clock") : v.kind === "sunset" ? "fa-cloud-sun" : "fa-sun" });
            if (idx > -1) list[idx] = item; else list.push(item);
            D.automations.save(list);
            D.log((isNew ? "added automation " : "changed automation ") + v.name, "fa-robot");
            UI.toast(v.name + " saved."); close(); render();
        });
    }


    /* =========================================================
       PREPAID ELECTRICITY
       Meter readings make it accurate (the meter counts the whole house). Without two readings,
       Elara uses what your smart switches measured, and says so.
    ========================================================= */
    function money(n) { return "R" + Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function units(n) { return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + " units"; }
    function renderPrepaid() {
        if (!F || !$("prepaidBody")) return;
        var st = F.prepaid.status(), box = $("prepaidBody");
        if (!st.setUp) {
            $("prepaidNote").textContent = "Units left and how long they'll last";
            box.innerHTML = '<div class="feature-empty"><i class="fa-solid fa-gauge"></i><p>Type in what your prepaid meter shows now, and the units each time you buy electricity. ' +
                "After two readings Elara knows how fast your home uses units and warns you about 3 days before they run out.</p></div>";
            return;
        }
        var days = st.daysLeft, warn = days != null && days <= st.warnDays;
        var buys = st.entries.filter(function (e) { return e.kind === "buy" && e.amount > 0 && e.units > 0; });
        var perUnit = buys.length ? buys.reduce(function (a, b) { return a + b.amount; }, 0) / buys.reduce(function (a, b) { return a + b.units; }, 0) : null;
        $("prepaidNote").textContent = st.basis === "meter" ? "From your meter readings" : st.basis === "switches" ? "Estimated from your smart switches only" : "Add another meter reading to see how long it lasts";
        box.innerHTML = '<div class="pp-main' + (warn ? " warn" : "") + '"><div><small>Units left (about)</small><strong>' + (st.balance == null ? "—" : units(st.balance)) + "</strong></div>" +
            "<div><small>Lasts about</small><strong>" + (days == null ? "—" : days < 1 ? "less than a day" : Math.floor(days) + " day" + (Math.floor(days) === 1 ? "" : "s")) + "</strong></div></div>" +
            (warn ? '<p class="pp-warn"><i class="fa-solid fa-triangle-exclamation"></i> Time to buy electricity.</p>' : "") +
            '<div class="pp-facts">' +
            (st.perDay ? "<span>Uses about <b>" + (Math.round(st.perDay * 10) / 10) + " units a day</b>" + (st.basis === "switches" ? " (switches only: the whole house uses more)" : "") + "</span>" : "") +
            (st.lastReading ? "<span>Last reading " + esc(units(st.lastReading.units)) + ", " + esc(D.ago(st.lastReading.t).toLowerCase()) + (st.lastReading.byName ? " by " + esc(st.lastReading.byName) : "") + "</span>" : "<span>No meter reading yet: add one so Elara knows the balance.</span>") +
            (st.spent30 ? "<span>Bought in the last 30 days: <b>" + money(st.spent30) + "</b> for " + units(st.units30) + "</span>" : "") +
            (perUnit ? "<span>You pay about " + money(perUnit) + " a unit</span>" : "") +
            '<label class="pp-warnset">Warn me at <select id="ppWarn"' + (canEdit() ? "" : " disabled") + ">" + [1, 2, 3, 4, 5, 7].map(function (n) { return '<option value="' + n + '"' + (n === st.warnDays ? " selected" : "") + ">" + n + " day" + (n === 1 ? "" : "s") + "</option>"; }).join("") + "</select> left</label>" +
            "</div>" +
            '<div class="pp-history">' + st.entries.slice(-5).reverse().map(function (e) {
                return '<div class="pp-row" data-id="' + esc(e.id) + '"><i class="fa-solid ' + (e.kind === "buy" ? "fa-cart-plus" : "fa-gauge") + '"></i><span>' + (e.kind === "buy" ? "Bought " + units(e.units) + (e.amount ? " for " + money(e.amount) : "") : "Meter showed " + units(e.units)) +
                    "<small>" + esc(new Date(e.t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) + (e.byName ? " • " + esc(e.byName) : "") + "</small></span>" +
                    (canEdit() ? '<button type="button" class="icon-act" data-pp-del aria-label="Delete this entry"><i class="fa-solid fa-trash"></i></button>' : "") + "</div>";
            }).join("") + "</div>";
    }
    function addPrepaid(kind) {
        if (!canEdit()) return UI.toast("You can view Smart Home but not change it.", "error");
        var buy = kind === "buy";
        UI.form({
            title: buy ? "Bought electricity" : "Meter reading", icon: buy ? "fa-bolt" : "fa-gauge", submitText: "Save",
            text: buy ? "Type the units on the token slip. If you've already loaded it, also type what the meter shows now: that keeps Elara accurate."
                      : "Type the number of units your prepaid meter shows right now.",
            fields: buy ? [
                { name: "units", label: "Units bought (kWh)", type: "number", min: 1, max: 5000, step: "0.1", required: true },
                { name: "amount", label: "Amount paid (R, optional)", type: "number", min: 0, max: 50000, step: "0.01" },
                { name: "meter", label: "Meter shows now, after loading (optional)", type: "number", min: 0, max: 20000, step: "0.1" }
            ] : [ { name: "units", label: "Units on the meter now", type: "number", min: 0, max: 20000, step: "0.1", required: true } ],
            validate: function (v) {
                var u = Number(v.units);
                if (v.units === "" || !isFinite(u) || u < (buy ? 1 : 0) || u > (buy ? 5000 : 20000)) return { field: "units", msg: buy ? "Enter the units bought (1 to 5000)." : "Enter the units the meter shows (0 to 20000)." };
                if (buy && v.amount !== "" && (!(Number(v.amount) >= 0) || Number(v.amount) > 50000)) return { field: "amount", msg: "Enter the amount from R0 to R50 000, or leave it empty." };
                if (buy && v.meter !== "" && (!(Number(v.meter) >= 0) || Number(v.meter) > 20000)) return { field: "meter", msg: "Enter what the meter shows (0 to 20000), or leave it empty." };
                if (buy && v.meter !== "" && Number(v.meter) < u * 0.5) return { field: "meter", msg: "That's less than you just loaded. Check the number on the meter." };
                return null;
            }
        }).then(function (v) {
            if (!v) return;
            var p = F.prepaid.get(), m = D.me(), t = Date.now();
            if (buy) {
                p.entries.push({ id: "b" + t.toString(36), t: t, kind: "buy", units: Number(v.units), amount: v.amount === "" ? 0 : Number(v.amount), by: m.id, byName: m.first });
                if (v.meter !== "") p.entries.push({ id: "r" + (t + 1).toString(36), t: t + 1, kind: "reading", units: Number(v.meter), by: m.id, byName: m.first });
            } else p.entries.push({ id: "r" + t.toString(36), t: t, kind: "reading", units: Number(v.units), by: m.id, byName: m.first });
            F.prepaid.save(p);
            D.log(buy ? "bought " + v.units + " units of electricity" + (v.amount ? " (R" + Number(v.amount).toFixed(2) + ")" : "") : "read the prepaid meter (" + v.units + " units)", buy ? "fa-bolt" : "fa-gauge");
            UI.toast("Saved."); renderPrepaid();
        });
    }
    $("prepaidBuy").addEventListener("click", function () { addPrepaid("buy"); });
    $("prepaidReading").addEventListener("click", function () { addPrepaid("reading"); });
    $("prepaidBody").addEventListener("change", function (e) {
        if (e.target.id !== "ppWarn" || !canEdit()) return;
        var p = F.prepaid.get(); p.warnDays = Number(e.target.value) || 3; F.prepaid.save(p); renderPrepaid();
    });
    $("prepaidBody").addEventListener("click", function (e) {
        var b = e.target.closest("[data-pp-del]"); if (!b || !canEdit()) return;
        var id = b.closest("[data-id]").dataset.id;
        UI.confirm({ title: "Delete this entry?", message: "Use this if it was typed wrong.", confirmText: "Delete" }).then(function (ok) {
            if (!ok) return;
            var p = F.prepaid.get(); p.entries = p.entries.filter(function (x) { return x.id !== id; }); F.prepaid.save(p); renderPrepaid();
        });
    });

    /* =========================================================
       GEYSER SAVINGS: worked out from the geyser's own measured energy (last 14 days)
       - night-time use (01:00-05:00, when nobody runs hot water) = what it costs to keep the water hot
       - heat only before the morning and evening hot-water times, off the rest of the day
       - saving: about half of that keep-warm energy for the hours it's off (water cools more slowly
         than it's topped up), never more than a third of what the geyser uses
    ========================================================= */
    function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
    function hhmm(h) { h = ((h % 24) + 24) % 24; return (h < 10 ? "0" : "") + h + ":00"; }
    function geyserPlanId(d) { return "geyser-" + hash(d.id).slice(0, 8); }
    function analyseGeyser(d) {
        var sod = D.util.startOfDay(new Date()).getTime(), from = sod - 14 * 86400000, rows = D.energy.rows().filter(function (r) { return r.d === d.tuyaId && r.h >= from && r.h < sod; });
        var days = {}, byHour = new Array(24).fill(0), total = 0, peak = 0;
        rows.forEach(function (r) { var dt = new Date(r.h); days[D.util.dayKey(dt)] = 1; byHour[dt.getHours()] += r.k; total += r.k; if (r.p > peak) peak = r.p; });
        var n = Object.keys(days).length;
        if (n < 3 || total < 0.3) return { ready: false, days: n };
        var perDay = total / n, avg = byHour.map(function (k) { return k / n; });
        var kw = peak > 500 ? peak / 1000 : 3, assumedKw = !(peak > 500);
        var night = (avg[1] + avg[2] + avg[3] + avg[4]) / 4;
        function peakIn(a, b, dflt) { var best = -1, bh = dflt; for (var h = a; h <= b; h++) if (avg[h] > best) { best = avg[h]; bh = h; } return best > night * 1.5 ? bh : dflt; }
        var len = Math.max(2, Math.min(4, Math.ceil(perDay / kw / 2 + 0.5)));
        var mEnd = peakIn(5, 10, 6), eEnd = peakIn(15, 22, 18);
        var mStart = Math.max(2, mEnd - len), eStart = Math.max(mEnd + 1, eEnd - len);
        var onHours = (mEnd - mStart) + (eEnd - eStart), offHours = 24 - onHours;
        var saveKwh = Math.min(night * offHours * 0.5, perDay * 0.33);
        return { ready: true, days: n, perDay: perDay, night: night, kw: kw, assumedKw: assumedKw, windows: [[mStart, mEnd], [eStart, eEnd]], offHours: offHours,
                 saveKwh: saveKwh, saveMonth: saveKwh * 30 * D.energy.tariff(), costMonth: perDay * 30 * D.energy.tariff() };
    }
    function planAutomations(d) { var id = geyserPlanId(d); return D.automations.all().filter(function (a) { return a.plan === id; }); }
    function renderGeyser() {
        if (!$("geyserBody")) return;
        var gs = D.devices.all().filter(function (d) { return d.type === "Geyser" && d.tuyaId; }), box = $("geyserBody");
        if (!gs.length) { box.innerHTML = '<div class="feature-empty"><i class="fa-solid fa-fire"></i><p>No geyser switch yet. Set your geyser switch\'s type to <b>Geyser</b> with its pencil button. It needs a power meter (most CBi geyser switches have one).</p></div>'; return; }
        box.innerHTML = gs.map(function (d) {
            var a = analyseGeyser(d), plan = planAutomations(d), on = plan.length && plan.every(function (x) { return x.on; });
            var others = D.automations.all().filter(function (x) { return !x.plan && x.on && x.kind !== "manual" && (x.devices || []).indexOf(d.id) > -1; });
            var head = '<div class="gs-head"><strong>' + esc(d.name) + "</strong>" + (on ? '<span class="gs-badge">Schedule on</span>' : "") + "</div>";
            if (!a.ready) return '<div class="gs-card">' + head + "<p>Elara needs at least 3 days of readings from this geyser to work out a schedule (it has " + a.days + "). Keep the switch connected and check back.</p></div>";
            var w = a.windows, times = hhmm(w[0][0]) + "–" + hhmm(w[0][1]) + " and " + hhmm(w[1][0]) + "–" + hhmm(w[1][1]);
            var since = on ? Math.min.apply(null, plan.map(function (x) { return x.since || Date.now(); })) : 0, effect = "";
            if (on && Date.now() - since > 2 * 86400000) {
                var rows = D.energy.rows().filter(function (r) { return r.d === d.tuyaId; }), before = 0, after = 0, bd = {}, ad = {};
                var sod = D.util.startOfDay(new Date()).getTime();
                rows.forEach(function (r) { var k = D.util.dayKey(new Date(r.h)); if (r.h < since && r.h >= since - 14 * 86400000) { before += r.k; bd[k] = 1; } else if (r.h >= since && r.h < sod) { after += r.k; ad[k] = 1; } });
                var nb = Object.keys(bd).length, na = Object.keys(ad).length;
                if (nb >= 3 && na >= 2) {
                    var pb = before / nb, pa = after / na, diff = pb - pa;
                    effect = '<p class="gs-effect ' + (diff > 0 ? "good" : "") + '"><i class="fa-solid fa-chart-line"></i> Since the schedule started: ' + pa.toFixed(1) + " kWh a day (was " + pb.toFixed(1) + "). " +
                        (diff > 0.05 ? "That's about <b>R" + Math.round(diff * 30 * D.energy.tariff()) + " a month</b> saved, measured." : "No measured saving yet.") + "</p>";
                }
            }
            return '<div class="gs-card" data-id="' + esc(d.id) + '">' + head +
                '<div class="gs-stats"><span><small>Uses</small><b>' + a.perDay.toFixed(1) + " kWh/day</b><small>about R" + Math.round(a.costMonth) + "/month</small></span>" +
                "<span><small>Keeping water hot</small><b>" + (a.night * 24).toFixed(1) + " kWh/day</b><small>measured at night</small></span></div>" +
                '<p class="gs-plan"><i class="fa-solid fa-clock"></i> Heat only <b>' + times + "</b>, off the other " + a.offHours + " hours.</p>" +
                (a.saveKwh >= 0.1 ? '<p class="gs-save">You\'d save about <b>R' + Math.round(a.saveMonth) + " a month</b> (" + a.saveKwh.toFixed(1) + " kWh a day).</p>"
                                  : '<p class="gs-save">Your geyser uses very little keeping water hot (good insulation, or it\'s already on a timer), so a schedule would save little.</p>') +
                effect +
                '<p class="gs-how">Worked out from ' + a.days + " days of this geyser's readings" + (a.assumedKw ? ", assuming a 3 kW element" : ", " + a.kw.toFixed(1) + " kW element") + ". The water may run out sooner if lots of hot water is used between the heating times.</p>" +
                (others.length ? '<p class="gs-warn"><i class="fa-solid fa-triangle-exclamation"></i> ' + others.length + " other automation" + (others.length === 1 ? " also switches" : "s also switch") + " this geyser: " + esc(others.map(function (x) { return x.name; }).join(", ")) + ".</p>" : "") +
                (canEdit() ? '<div class="feature-actions">' + (plan.length ? '<button type="button" class="ghost-btn" data-gs="off">Remove schedule</button>' : "") +
                    '<button type="button" class="ghost-btn primary-ghost" data-gs="on">' + (plan.length ? "Update schedule" : "Use this schedule") + "</button></div>" : "") + "</div>";
        }).join("");
    }
    $("geyserBody").addEventListener("click", function (e) {
        var b = e.target.closest("[data-gs]"); if (!b || !canEdit()) return;
        var d = D.devices.find(b.closest("[data-id]").dataset.id); if (!d) return;
        var id = geyserPlanId(d), rest = D.automations.all().filter(function (a) { return a.plan !== id; });
        if (b.dataset.gs === "off") {
            D.automations.save(rest); D.log("removed the heating schedule for " + d.name, "fa-fire"); UI.toast("Schedule removed. " + d.name + " stays as it is now.", "info"); return render();
        }
        var a = analyseGeyser(d); if (!a.ready) return;
        var w = a.windows, now = Date.now(), old = planAutomations(d), since = old.length ? Math.min.apply(null, old.map(function (x) { return x.since || now; })) : now;
        var mk = function (suffix, name, at, action) { return { id: id + "-" + suffix, name: name, icon: action === "on" ? "fa-fire" : "fa-power-off", kind: "time", at: at, days: [], action: action, on: true, devices: [d.id], plan: id, since: since }; };
        var plan = [mk("m1", d.name + " on (morning)", hhmm(w[0][0]), "on"), mk("m0", d.name + " off (morning)", hhmm(w[0][1]), "off"),
                    mk("e1", d.name + " on (evening)", hhmm(w[1][0]), "on"), mk("e0", d.name + " off (evening)", hhmm(w[1][1]), "off")];
        if (rest.length + plan.length > 30) return UI.toast("You have too many automations. Delete a few first.", "error");
        UI.confirm({ title: "Heat " + d.name + " on a schedule?", message: "Elara adds 4 automations: on at " + hhmm(w[0][0]) + ", off at " + hhmm(w[0][1]) + ", on at " + hhmm(w[1][0]) + ", off at " + hhmm(w[1][1]) + ", every day. You can change or remove them any time.",
                     confirmText: "Use schedule", danger: false, icon: "fa-fire" }).then(function (ok) {
            if (!ok) return;
            D.automations.save(rest.concat(plan));
            D.log("put " + d.name + " on a heating schedule (" + hhmm(w[0][0]) + "–" + hhmm(w[0][1]) + ", " + hhmm(w[1][0]) + "–" + hhmm(w[1][1]) + ")", "fa-fire");
            UI.toast("Schedule saved." + (cfg.serverAutomations ? "" : " It runs while Elara is open on a device; see README step 8 to run it all the time."));
            render();
        });
    });

    /* =========================================================
       LOAD-SHEDDING (EskomSePush, through the elara-tuya function: the API key stays on the server)
       elaraLoadsheddingArea: { id, name, region, devices:[], before:minutes, after:minutes|0, on }
       elaraLoadshedding:     { at, areaId, events:[{start,end,note}], days:[...], error }   (written by the server)
    ========================================================= */
    var lsLive = null;
    function lsArea() { return D.util.load("elaraLoadsheddingArea", null); }
    function lsData() { var a = D.util.load("elaraLoadshedding", null); return lsLive && (!a || lsLive.at > a.at) ? lsLive : a; }
    function fmtSlot(ev) {
        var s = new Date(ev.start), e = new Date(ev.end), today = D.util.dayKey(), k = D.util.dayKey(s);
        var day = k === today ? "Today" : k === D.util.dayKey(D.util.addDays(new Date(), 1)) ? "Tomorrow" : s.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
        var t = function (x) { return x.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }); };
        return day + " " + t(s) + "–" + t(e);
    }
    function renderLs() {
        if (!$("lsBody")) return;
        var a = lsArea(), data = lsData(), box = $("lsBody");
        if (!a || !a.id) {
            $("lsNote").textContent = "Your area's schedule from EskomSePush";
            box.innerHTML = '<div class="feature-empty"><i class="fa-solid fa-plug-circle-xmark"></i><p>Choose your area and Elara shows when the power goes off, and can switch your geyser off just before so it doesn\'t surge when the power comes back. ' +
                (cfg.tuyaEndpoint ? "Needs a free EskomSePush API key on the server (README, step 8)." : "Needs the elara-tuya function and a free EskomSePush API key (README, step 8).") + "</p></div>";
            return;
        }
        $("lsNote").textContent = a.name + (a.region ? ", " + a.region : "");
        if (!/_/.test(a.id)) { box.innerHTML = '<p class="gs-warn"><i class="fa-solid fa-triangle-exclamation"></i> EskomSePush changed its area codes. Press <b>Set up</b> and choose your area again.</p>'; return; }
        var now = Date.now(), evs = ((data && data.areaId === a.id && data.events) || []).filter(function (ev) { return new Date(ev.end).getTime() > now; }).slice(0, 5);
        var cur = evs.filter(function (ev) { return new Date(ev.start).getTime() <= now; })[0];
        var devs = (a.devices || []).map(function (id) { var d = D.devices.find(id); return d ? d.name : null; }).filter(Boolean);
        box.innerHTML = (data && data.error && data.areaId === a.id ? '<p class="gs-warn"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(data.error) + "</p>" : "") +
            (cur ? '<div class="ls-now"><i class="fa-solid fa-power-off"></i> Load-shedding now (' + esc(cur.note || "") + "), until " + esc(new Date(cur.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })) + "</div>" : "") +
            (evs.length ? '<div class="ls-list">' + evs.map(function (ev) { return '<div class="ls-slot' + (ev === cur ? " now" : "") + '"><strong>' + esc(fmtSlot(ev)) + "</strong><span>" + esc(ev.note || "") + "</span></div>"; }).join("") + "</div>"
                        : data && data.areaId === a.id ? '<p class="ls-clear"><i class="fa-solid fa-circle-check"></i> No load-shedding scheduled for your area.</p>' : "<p>Waiting for the first update from EskomSePush...</p>") +
            '<p class="ls-auto">' + (a.on && devs.length && a.before ? '<i class="fa-solid fa-robot"></i> Elara switches off <b>' + esc(devs.join(", ")) + "</b> " + a.before + " minutes before" + (a.after ? " and back on " + a.after + " minutes after the power returns" : "") + "."
                : "Elara isn't switching anything off for load-shedding.") + "</p>" +
            (data && data.at ? '<p class="gs-how">Updated ' + esc(D.ago(data.at).toLowerCase()) + ". Elara checks every 2 hours" +
                (data.allowance ? " (" + esc(data.allowance.count) + " of today's " + esc(data.allowance.limit) + " EskomSePush checks used)." : " (the free EskomSePush plan allows 50 checks a day).") + "</p>" : "");
    }
    function lsSetup() {
        if (!canEdit()) return UI.toast("You can view Smart Home but not change it.", "error");
        if (!cfg.tuyaEndpoint || !D.user) return UI.toast("Load-shedding needs the elara-tuya function deployed and you logged in (README, step 8).", "error");
        var a = lsArea() || { devices: D.devices.all().filter(function (d) { return d.type === "Geyser"; }).map(function (d) { return d.id; }), before: 10, after: 30, on: true };
        var devs = D.devices.all(), picked = a.id && /_/.test(a.id) ? { id: a.id, name: a.name, region: a.region, scheduleId: a.scheduleId } : null;   // old (v2) area codes must be chosen again
        var ov = document.createElement("div");
        ov.className = "eui-overlay";
        ov.innerHTML = '<form class="eui-box eui-form auto-form" novalidate><div class="eui-icon info"><i class="fa-solid fa-plug-circle-xmark"></i></div><h3>Load-shedding</h3>' +
            '<label>Your suburb or area<div class="ls-search"><input name="q" maxlength="60" placeholder="e.g. Fourways" value=""><button type="button" class="eui-btn ghost" data-find>Search</button></div></label>' +
            '<div class="ls-results">' + (picked ? '<p class="ls-picked">Area: <b>' + esc(picked.name) + "</b>" + (picked.region ? ", " + esc(picked.region) : "") + "</p>" : "") + "</div>" +
            '<fieldset><legend>Switch these off before load-shedding</legend><div class="dev-picks">' + (devs.length ? devs.map(function (d) {
                return '<label><input type="checkbox" name="dev" value="' + esc(d.id) + '"' + ((a.devices || []).indexOf(d.id) > -1 ? " checked" : "") + "> " + esc(d.name) + " <small>" + esc(d.room) + "</small></label>";
            }).join("") : "<p>No switches yet.</p>") + "</div></fieldset>" +
            '<label>How long before<select name="before"><option value="0">Don\'t switch anything off</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></label>' +
            '<label>Switch them back on<select name="after"><option value="0">No, leave them off</option><option value="15">15 minutes after the power is back</option><option value="30">30 minutes after</option><option value="60">1 hour after</option></select></label>' +
            '<p class="eui-err" aria-live="assertive"></p><div class="eui-actions">' + (a.id ? '<button type="button" class="eui-btn danger" data-del>Turn off</button>' : "") +
            '<button type="button" class="eui-btn ghost" data-close>Cancel</button><button type="submit" class="eui-btn primary">Save</button></div></form>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        var f = ov.querySelector("form"), res = ov.querySelector(".ls-results");
        f.before.value = String(a.before == null ? 10 : a.before); f.after.value = String(a.after == null ? 30 : a.after);
        function shut() { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); }
        function find() {
            var q = f.q.value.trim();
            if (q.length < 3) { f.querySelector(".eui-err").textContent = "Type at least 3 letters of your suburb."; return; }
            f.querySelector(".eui-err").textContent = ""; res.innerHTML = "<p>Searching...</p>";
            D.callFunction(cfg.tuyaEndpoint, { action: "lsSearch", text: q }).then(function (j) {
                var list = (j.areas || []).slice(0, 12);
                res.innerHTML = list.length ? '<div class="dev-picks">' + list.map(function (x, i) {
                    return '<label><input type="radio" name="area" value="' + i + '"' + (picked && picked.id === x.id ? " checked" : "") + "> " + esc(x.name) + " <small>" + esc(x.region || "") + "</small></label>";
                }).join("") + "</div>" : "<p>No areas found. Try a nearby suburb or your municipality.</p>";
                res.querySelectorAll('[name="area"]').forEach(function (r) { r.addEventListener("change", function () { picked = list[Number(r.value)]; }); });
                if (j.allowance) res.insertAdjacentHTML("beforeend", '<p class="gs-how">EskomSePush checks used today: ' + esc(j.allowance.count) + " of " + esc(j.allowance.limit) + ".</p>");
            }).catch(function (e) { res.innerHTML = '<p class="gs-warn">' + esc(e.message) + "</p>"; });
        }
        ov.querySelector("[data-find]").addEventListener("click", find);
        f.q.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); find(); } });
        ov.addEventListener("click", function (e) {
            if (e.target === ov || e.target.closest("[data-close]")) return shut();
            if (e.target.closest("[data-del]")) { D.util.save("elaraLoadsheddingArea", null); D.log("turned off load-shedding updates", "fa-plug-circle-xmark"); shut(); renderLs(); }
        });
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            if (!picked) { f.querySelector(".eui-err").textContent = "Search for your area and choose it."; return; }
            var chosen = Array.prototype.map.call(f.querySelectorAll('[name="dev"]:checked'), function (x) { return x.value; });
            var before = Number(f.before.value), after = Number(f.after.value);
            if (before && !chosen.length) { f.querySelector(".eui-err").textContent = "Tick the devices to switch off, or choose “Don't switch anything off”."; return; }
            var btn = f.querySelector('[type="submit"]'); btn.disabled = true; btn.textContent = "Saving...";
            // EskomSePush gives each area a separate schedule id: look it up once and keep it with the area
            (picked.scheduleId ? Promise.resolve(picked) : D.callFunction(cfg.tuyaEndpoint, { action: "lsArea", id: picked.id })).then(function (info) {
                D.util.save("elaraLoadsheddingArea", { id: String(picked.id).slice(0, 100), scheduleId: String(info.scheduleId || "").slice(0, 80), name: String(info.name || picked.name).slice(0, 80),
                    region: String(info.region || picked.region || "").slice(0, 80), devices: chosen, before: before, after: before ? after : 0, on: true, by: D.me().id, at: Date.now() });
                D.log("set the load-shedding area to " + (info.name || picked.name), "fa-plug-circle-xmark");
                shut(); renderLs();
                return D.flush().then(function () { return D.callFunction(cfg.tuyaEndpoint, { action: "lsRefresh" }); })
                    .then(function (j) { if (j && j.data) { lsLive = j.data; renderLs(); } UI.toast(j && j.data && j.data.error ? j.data.error : "Load-shedding schedule updated.", j && j.data && j.data.error ? "error" : "success"); })
                    .catch(function (err) { UI.toast("Saved, but couldn't get the schedule yet: " + err.message, "error"); });
            }).catch(function (err) {
                btn.disabled = false; btn.textContent = "Save";
                f.querySelector(".eui-err").textContent = err.message;
            });
        });
    }
    $("lsSetup").addEventListener("click", lsSetup);

    /* ---------------- quick controls (by device type) ---------------- */
    function group(kind) {
        var all = D.devices.all().filter(function (d) { var st = D.devices.live(d); return !st || st.online !== false; });
        if (kind === "alloff") return all.filter(function (d) { return d.type !== "Fridge"; });
        return all.filter(function (d) { return d.type === kind; });
    }
    document.querySelector(".quick-controls").addEventListener("click", function (e) {
        var b = e.target.closest("[data-quick]"); if (!b) return;
        if (!canEdit()) return UI.toast("You can view Smart Home but not change it.", "error");
        var kind = b.dataset.quick, list = group(kind), label = b.querySelector("span").textContent;
        if (!list.length) return UI.toast("No " + label.toLowerCase() + " found. Set a device's type with its pencil button.", "error");
        var on = kind === "alloff" ? false : !list.some(function (d) { return d.on; });
        var todo = list.filter(function (d) { return d.on !== on; });
        if (!todo.length) return UI.toast("Already " + (on ? "on" : "off") + ".", "info");
        b.disabled = true;
        Promise.all(todo.map(function (d) { return D.devices.switch(d.id, on, { silent: true }).then(function () { return 1; }, function () { return 0; }); })).then(function (r) {
            var n = r.reduce(function (s, x) { return s + x; }, 0);
            if (n) D.log(label + " turned " + (on ? "ON" : "OFF") + " (" + n + ")", "fa-bolt");
            UI.toast(n === todo.length ? label + " turned " + (on ? "ON" : "OFF") + "." : n + " of " + todo.length + " switched; the rest didn’t respond.", n === todo.length ? "success" : "error");
            b.disabled = false; render();
        });
    });

    /* ---------------- search ---------------- */
    var search = $("deviceSearch");
    if (search) search.addEventListener("input", function () { query = this.value.toLowerCase().trim().slice(0, 60); renderRooms(); });

    /* ---------------- CBi Home (Tuya cloud): connect + import ---------------- */
    function openCbi() {
        if (!canEdit()) return UI.toast("Only people who can change Smart Home can connect CBi.", "error");
        var hidden = D.devices.everything().filter(function (d) { return d.hidden; });
        var ov = document.createElement("div");
        ov.className = "eui-overlay";
        ov.innerHTML = '<div class="eui-box cbi-box" role="dialog" aria-modal="true"><div class="eui-icon info"><i class="fa-solid fa-link"></i></div><h3>CBi Home</h3>' +
            "<p>Elara controls your switches through the Smart Life account they're in (CBi Home runs on the same Tuya cloud). Switches with a power meter also send their energy use.</p>" +
            (cbiReady ? '<div class="eui-actions">' + (hidden.length ? '<button type="button" class="eui-btn ghost" data-unhide>Show ' + hidden.length + " hidden</button>" : "") +
                        '<button type="button" class="eui-btn ghost" data-close>Close</button><button type="button" class="eui-btn primary" data-sync>Import / refresh switches</button></div>'
                      : '<ol class="cbi-steps"><li>In <strong>CBi Home</strong>, remove the switch and reset it into pairing mode.</li><li>Add it in <strong>Smart Life</strong>.</li>' +
                        "<li>On iot.tuya.com link your Smart Life account, then deploy <code>elara-tuya</code> (README, step 8).</li><li>Its URL goes in <code>tuyaEndpoint</code> in <code>elara-config.js</code>.</li></ol>" +
                        '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-close>Close</button></div>') + "</div>";
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        ov.addEventListener("click", function (e) {
            if (e.target === ov || e.target.closest("[data-close]")) return ov.remove();
            if (e.target.closest("[data-unhide]")) { hidden.forEach(function (d) { D.devices.update(d.id, { hidden: false }); }); ov.remove(); render(); return UI.toast("Hidden devices are shown again."); }
            var s = e.target.closest("[data-sync]"); if (!s) return;
            s.disabled = true; s.textContent = "Connecting...";
            D.callFunction(cfg.tuyaEndpoint, { action: "list" }).then(function (res) {
                var r = D.devices.import(res.devices || []);
                var metered = (res.devices || []).filter(function (t) { return t.hasMeter; }).length;
                D.util.save("elaraCbiLinked", true);
                D.log("synced CBi Home (" + r.added + " new switch" + (r.added === 1 ? "" : "es") + ")", "fa-link");
                ov.remove(); D.devices.poll(); D.energy.load(true); render();
                UI.toast((res.devices || []).length + " switch" + ((res.devices || []).length === 1 ? "" : "es") + " found, " + r.added + " new. " + metered + " report power.");
            }).catch(function (err) { s.disabled = false; s.textContent = "Try again"; UI.toast("Couldn’t reach CBi: " + err.message, "error"); });
        });
    }
    $("cbiBtn").addEventListener("click", openCbi);
    $("syncFab").addEventListener("click", openCbi);

    /* ---------------- outside temperature ---------------- */
    function renderTemperature() {
        var home = D.util.load("elaraHomeCoords", null) || (localStorage.getItem("elaraLocationConsent") === "granted" ? D.util.load("elaraMyLocation", null) : null);
        var lat = home ? home.lat : (cfg.defaultLat || -26.2041), lon = home ? home.lon : (cfg.defaultLon || 28.0473);
        var city = home ? (home.city || String(home.label || "").split(",")[0]) : (cfg.defaultCity || "Johannesburg");
        function show(t) { $("outsideTemp").textContent = C.fmtTemp ? C.fmtTemp(t) : Math.round(t) + "°C"; $("outsideCity").textContent = city; }
        try { var c = JSON.parse(sessionStorage.getItem("elaraTemp:" + lat + "," + lon) || "null"); if (c && Date.now() - c.t < 15 * 60000) return show(c.temp); } catch (e) { /* ignore */ }
        fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m&timezone=auto")
            .then(function (r) { if (!r.ok) throw new Error("weather"); return r.json(); })
            .then(function (j) { try { sessionStorage.setItem("elaraTemp:" + lat + "," + lon, JSON.stringify({ temp: j.current.temperature_2m, t: Date.now() })); } catch (e) { /* ignore */ } show(j.current.temperature_2m); })
            .catch(function () { $("outsideTemp").textContent = "--"; $("outsideCity").textContent = "Weather unavailable"; });
    }

    /* ---------------- activity ---------------- */
    function renderActivity() {
        var items = D.activity(60).filter(function (a) { return /turned|device|automation|ran|away mode|cbi|switch|lights|geyser|aircon/i.test(a.text); }).slice(0, 8);
        $("deviceActivity").innerHTML = items.length ? items.map(function (a) {
            return '<div class="activity-item"><div class="activity-left"><div class="activity-icon"><i class="fa-solid ' + esc(a.icon) + '"></i></div><div class="activity-info"><h4>' + esc(a.who + " " + a.text) + "</h4><p>" + esc(new Date(a.t).toLocaleString()) + '</p></div></div><span class="activity-time">' + esc(D.ago(a.t)) + "</span></div>";
        }).join("") : '<p class="muted" style="padding:16px">No activity yet.</p>';
    }

    function render() { renderBanner(); renderRooms(); renderStats(); renderEnergy(); renderByPerson(); renderAutomations(); renderPrepaid(); renderGeyser(); renderLs(); renderActivity(); }
    D.onChange(render);
    document.addEventListener("elara:refresh", render);
    setInterval(render, 60000);
    renderTemperature();
    render();
    if (D.user) { D.devices.poll(); D.energy.load(); }
})();
