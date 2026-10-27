/* ==========================================================
              ELARA SMART HOME
   Your real CBi Home / Smart Life switches: switch them, see their live
   power, the energy their meters measured, and set up automations.
   Nothing here is made up: a switch without a power meter shows no energy.
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI, C = window.ElaraCommon || {}, cfg = window.ELARA_CONFIG || {};
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
        return '<div class="device' + (offline ? " is-offline" : "") + '" data-id="' + esc(d.id) + '"><div class="device-left"><i class="fa-solid ' + esc(d.icon || "fa-plug") + '"></i><div class="device-info"><h4>' + esc(d.name) + "</h4><p>" +
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
            D.devices.update(d.id, { name: v.name, room: room, type: v.type, hidden: v.hidden === "yes" });
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

    function render() { renderBanner(); renderRooms(); renderStats(); renderEnergy(); renderByPerson(); renderAutomations(); renderActivity(); }
    D.onChange(render);
    document.addEventListener("elara:refresh", render);
    setInterval(render, 60000);
    renderTemperature();
    render();
    if (D.user) { D.devices.poll(); D.energy.load(); }
})();
