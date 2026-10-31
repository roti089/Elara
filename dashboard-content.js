/* ==========================================================
            ELARA DASHBOARD
   One layout for everyone in the home. Every number comes from the
   shared household data; panels for areas a member may not see are hidden.
   The chat uses ElaraAssistant (commands + meal ideas + Elara AI).
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI, C = window.ElaraCommon || {}, cfg = window.ELARA_CONFIG || {};
    if (!D) return;
    window.ElaraPageLive = true;

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function todayKey() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function nowHM() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
    var ROLES = { owner: "Home Owner", adult: "Adult", member: "Member", guest: "Guest" };

    /* ---------------- loading screen (first visit after login only) ---------------- */
    window.addEventListener("load", function () {
        var ls = $("loadingScreen"); if (!ls) return;
        setTimeout(function () { ls.classList.add("hide"); try { sessionStorage.setItem("elaraLoaded", "1"); } catch (e) { /* ignore */ } setTimeout(function () { ls.remove(); }, 800); }, 1200);
    });

    /* ---------------- greeting ---------------- */
    function greet() {
        var h = C.homeParts ? C.homeParts().hour : new Date().getHours();
        var g = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
        $("greetingText").textContent = g + ", " + (D.me().first || "there") + " 👋";
    }

    /* ---------------- access ---------------- */
    function applyAccess() {
        document.querySelectorAll("[data-area]").forEach(function (el) { el.style.display = D.can(el.dataset.area) ? "" : "none"; });
        document.querySelectorAll("[data-need]").forEach(function (b) {
            var n = b.dataset.need, ok = n === "owner" ? D.household.isOwner : D.can(n, n === "smartHome" ? "view" : "edit");
            b.style.display = ok ? "" : "none";
        });
    }
    document.querySelector(".action-panel").addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (b) location.href = b.dataset.go; });

    /* ---------------- stats ---------------- */
    function renderStats() {
        if (D.can("tasks")) {
            var open = D.tasks.all().filter(function (t) { return t.status !== "Completed"; });
            var due = open.filter(function (t) { return t.date === todayKey(); }).length;
            $("taskCount").textContent = open.length;
            $("taskNote").textContent = due ? due + " due today" : "Open tasks";
        }
        if (D.can("shopping")) {
            var items = D.util.load("elaraShoppingItems", []);
            $("shoppingCount").textContent = items.length;
            $("shoppingNote").textContent = items.length === 1 ? "Item on the list" : "Items on the list";
        }
        if (D.can("smartHome")) {
            var devs = D.devices.all(), on = devs.filter(function (d) { return d.on; }).length;
            $("deviceCount").textContent = on;
            $("deviceNote").textContent = "of " + devs.length + " devices on";
            var e = D.energy.compute("today");
            $("energyCount").textContent = e.total < 1 ? e.total.toFixed(2) : e.total.toFixed(1);
            $("energyNote").textContent = "kWh today • about R" + e.cost.toFixed(2);
            var pp = window.ElaraFeatures ? ElaraFeatures.prepaid.status() : null;
            if (pp && pp.daysLeft != null) {
                var dl = Math.floor(pp.daysLeft);
                $("energyNote").textContent = "kWh today • prepaid lasts " + (dl < 1 ? "under a day" : "~" + dl + " day" + (dl === 1 ? "" : "s"));
                $("energyNote").classList.toggle("warn-text", pp.daysLeft <= pp.warnDays);
            }
        }
    }

    /* ---------------- devices (first few, switchable if allowed) ---------------- */
    function renderDevices() {
        if (!D.can("smartHome")) return;
        var edit = D.can("smartHome", "edit"), list = D.devices.all().slice().sort(function (a, b) { return (b.on - a.on) || (b.changedAt || 0) - (a.changedAt || 0); }).slice(0, 4);
        $("dashDevices").innerHTML = list.length ? list.map(function (d) {
            return '<div class="device" data-id="' + esc(d.id) + '"><div><i class="fa-solid ' + esc(d.icon || "fa-plug") + '"></i><div><h4>' + esc(d.name) + "</h4><span>" + esc(d.room + " • " + (d.on ? "On" : "Off")) + "</span></div></div>" +
                '<label class="switch"><input type="checkbox"' + (d.on ? " checked" : "") + (edit ? "" : " disabled") + ' aria-label="' + esc(d.name) + '"><span class="slider"></span></label></div>';
        }).join("") : '<p class="dash-empty">No switches yet. <a href="dashboard-smart-home.html">Connect CBi Home</a>.</p>';
    }
    $("dashDevices").addEventListener("change", function (e) {
        var input = e.target.closest("input"); if (!input) return;
        var id = input.closest(".device").dataset.id, d = D.devices.find(id);
        D.devices.switch(id, input.checked).then(function () { UI.toast(d.name + " turned " + (input.checked ? "ON" : "OFF"), input.checked ? "success" : "info"); })
            .catch(function (err) { UI.toast(err.message, "error"); }).then(render);
    });

    /* ---------------- energy chart ---------------- */
    var chart = null;
    function renderChart() {
        if (!D.can("smartHome") || typeof Chart === "undefined") return;
        var w = D.energy.compute("week"), names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], labels = [];
        for (var i = 6; i >= 0; i--) labels.push(names[D.util.addDays(new Date(), -i).getDay()]);
        var data = w.series.map(function (v) { return +v.toFixed(2); });
        var light = document.body.classList.contains("light-theme"), tick = light ? "#4b5375" : "#b8bfd9";
        if (chart) { chart.data.labels = labels; chart.data.datasets[0].data = data; chart.options.scales.x.ticks.color = chart.options.scales.y.ticks.color = tick; chart.update(); return; }
        chart = new Chart($("energyChart"), {
            type: "line",
            data: { labels: labels, datasets: [{ label: "kWh", data: data, borderColor: "#6C63FF", backgroundColor: "rgba(108,99,255,.15)", fill: true, tension: .4, borderWidth: 3, pointRadius: 3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tick }, grid: { color: light ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.05)" } } } }
        });
    }

    /* ---------------- tasks / schedule / activity ---------------- */
    function renderTasks() {
        if (!D.can("tasks")) return;
        var edit = D.can("tasks", "edit"), me = D.me().id, k = todayKey();
        var list = D.tasks.all().filter(function (t) { return t.date === k || (t.status !== "Completed" && t.date < k); })
            .sort(function (a, b) { return (a.status === "Completed") - (b.status === "Completed") || (a.date + a.time).localeCompare(b.date + b.time); }).slice(0, 6);
        $("dashTasks").innerHTML = list.length ? list.map(function (t) {
            var who = t.assigneeId === me ? "You" : (D.members.find(t.assigneeId) || {}).name || t.assignee || "Unassigned";
            var late = t.status !== "Completed" && (t.date + " " + t.time) < (k + " " + nowHM());
            var mayTick = edit && (t.assigneeId === me || D.household.isOwner || D.access.role === "adult");
            return '<li data-id="' + esc(t.id) + '"><label><input type="checkbox"' + (t.status === "Completed" ? " checked" : "") + (mayTick ? "" : " disabled") + "> " +
                esc(t.title) + '</label><small class="' + (late ? "late" : "") + '">' + esc(who + " • " + (late ? "overdue" : t.time)) + "</small></li>";
        }).join("") : '<li class="dash-empty">Nothing due today.</li>';
    }
    $("dashTasks").addEventListener("change", function (e) {
        var input = e.target.closest("input"); if (!input) return;
        var id = input.closest("li").dataset.id, all = D.tasks.all(), t = all.filter(function (x) { return String(x.id) === id; })[0], m = D.me();
        if (!t) return;
        if (input.checked) { t.status = "Completed"; t.progress = 100; t.completedBy = m.id; t.completedByName = m.first; t.completedAt = Date.now(); }
        else { t.status = "In Progress"; t.progress = Math.min(t.progress || 0, 90); delete t.completedAt; delete t.completedBy; delete t.completedByName; }
        t.updatedAt = Date.now(); t.updatedBy = m.id;
        D.tasks.save(all);
        D.log((input.checked ? "completed task “" : "reopened task “") + t.title + "”", input.checked ? "fa-circle-check" : "fa-rotate-left");
        if (input.checked && t.createdBy && t.createdBy !== m.id) D.notify({ to: [t.createdBy], kind: "tasks", title: "Task completed", body: m.first + " completed “" + t.title + "”.", href: "dashboard-tasks.html" });
        render();
    });
    function renderSchedule() {
        if (!D.can("schedule")) return;
        var k = todayKey(), hm = nowHM();
        var list = D.util.load("elaraSchedules", []).filter(function (e) { return e.date > k || (e.date === k && e.time >= hm); })
            .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).slice(0, 4);
        var busy = D.members.active().filter(function (p) { return D.availability.on(k, p.userId) !== "available"; });
        $("dashSchedule").innerHTML = (list.length ? list.map(function (e) {
            var d = e.date === k ? e.time : e.date.slice(5).replace("-", "/") + " " + e.time;
            return '<a class="schedule-item" href="dashboard-schedule.html?date=' + esc(e.date) + '"><strong>' + esc(d) + "</strong><span>" + esc(e.title) + "</span></a>";
        }).join("") : '<p class="dash-empty">No upcoming events.</p>') +
            (busy.length ? '<p class="dash-busy"><i class="fa-solid fa-user-clock"></i> ' + esc(busy.map(function (p) { return (p.isMe ? "You are" : p.name + " is") + " " + D.availability.on(k, p.userId); }).join(", ")) + " today</p>" : "");
    }
    function renderActivity() {
        var items = D.activity(20);
        $("dashActivity").innerHTML = items.slice(0, 4).map(function (a) { return '<div class="activity"><i class="fa-solid ' + esc(a.icon) + '"></i> ' + esc(a.who + " " + a.text) + "</div>"; }).join("") || '<p class="dash-empty">Nothing yet.</p>';
        $("dashFeed").innerHTML = items.slice(0, 8).map(function (a) { return '<div class="feed-item"><i class="fa-solid ' + esc(a.icon) + '"></i><span>' + esc(a.who + " " + a.text) + "</span><small>" + esc(D.ago(a.t)) + "</small></div>"; }).join("") || '<p class="dash-empty">Activity from everyone in the home appears here.</p>';
        $("feedUpdated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    /* ---------------- family ---------------- */
    function renderFamily() {
        var pres = D.presence.all(), k = todayKey();
        $("dashFamily").innerHTML = D.members.all().filter(function (m) { return m.status === "active"; }).map(function (m) {
            var away = pres[m.userId] && pres[m.userId].state === "away", avail = D.availability.on(k, m.userId);
            var avatar = m.avatar ? '<img src="' + esc(m.avatar) + '" alt="">' : '<div class="avatar-letter">' + esc((m.name || "?").charAt(0).toUpperCase()) + "</div>";
            return '<div class="member">' + avatar + "<div><h4>" + esc(m.name + (m.isMe ? " (you)" : "")) + "</h4><span>" + esc(ROLES[m.role] || m.role) + (avail !== "available" ? " • " + avail + " today" : "") + "</span></div>" +
                '<div class="' + (away ? "offline" : "online") + '" title="' + (away ? "Away" : "Home") + '"></div></div>';
        }).join("") || '<p class="dash-empty">Invite people on the Members page.</p>';
    }

    /* ---------------- weather (home location, or your location if you allowed it) ---------------- */
    var WMO = { 0: ["Clear sky", "fa-sun"], 1: ["Mainly clear", "fa-sun"], 2: ["Partly cloudy", "fa-cloud-sun"], 3: ["Overcast", "fa-cloud"], 45: ["Foggy", "fa-smog"], 48: ["Foggy", "fa-smog"],
        51: ["Light drizzle", "fa-cloud-rain"], 53: ["Drizzle", "fa-cloud-rain"], 55: ["Heavy drizzle", "fa-cloud-rain"], 61: ["Light rain", "fa-cloud-rain"], 63: ["Rain", "fa-cloud-rain"], 65: ["Heavy rain", "fa-cloud-showers-heavy"],
        71: ["Light snow", "fa-snowflake"], 73: ["Snow", "fa-snowflake"], 75: ["Heavy snow", "fa-snowflake"], 80: ["Rain showers", "fa-cloud-showers-heavy"], 81: ["Rain showers", "fa-cloud-showers-heavy"], 82: ["Violent showers", "fa-cloud-showers-heavy"],
        95: ["Thunderstorm", "fa-cloud-bolt"], 96: ["Thunderstorm", "fa-cloud-bolt"], 99: ["Thunderstorm", "fa-cloud-bolt"] };
    function paintWeather(w) {
        var info = WMO[w.code] || ["", "fa-cloud"];
        $("wTemp").textContent = C.fmtTemp ? C.fmtTemp(w.temp) : Math.round(w.temp) + "°C";
        $("wCity").textContent = w.city; $("wDesc").textContent = info[0];
        $("wHum").textContent = Math.round(w.humidity) + "%"; $("wWind").textContent = Math.round(w.wind) + " km/h"; $("wRain").textContent = Math.round(w.rain) + "%";
        var ic = document.querySelector(".weather-panel .panel-header i"); if (ic) ic.className = "fa-solid " + info[1];
        window.__elaraWeather = w;
    }
    function loadWeather() {
        var home = D.util.load("elaraHomeCoords", null), mine = localStorage.getItem("elaraLocationConsent") === "granted" ? D.util.load("elaraMyLocation", null) : null;
        var p = home || mine, lat = p ? p.lat : (cfg.defaultLat || -26.2041), lon = p ? p.lon : (cfg.defaultLon || 28.0473);
        var city = p ? (p.city || String(p.label || "").split(",")[0]) : (cfg.defaultCity || "Johannesburg") + " (default)";
        var key = lat + "," + lon;
        try { var c = JSON.parse(sessionStorage.getItem("elaraWeather") || "null"); if (c && c.key === key && Date.now() - c.t < 15 * 60000) return paintWeather(c); } catch (e) { /* ignore */ }
        fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_days=1&timezone=" + encodeURIComponent(C.tz ? C.tz() : "auto"))
            .then(function (r) { if (!r.ok) throw new Error("weather"); return r.json(); })
            .then(function (j) {
                var hour = C.homeParts ? C.homeParts().hour : new Date().getHours();
                var w = { key: key, temp: j.current.temperature_2m, humidity: j.current.relative_humidity_2m, wind: j.current.wind_speed_10m, code: j.current.weather_code, rain: (j.hourly.precipitation_probability || [])[hour] || 0, city: city, t: Date.now() };
                try { sessionStorage.setItem("elaraWeather", JSON.stringify(w)); } catch (e) { /* ignore */ }
                paintWeather(w);
            }).catch(function () { $("wCity").textContent = "Weather unavailable"; });
    }
    document.addEventListener("elara:location", function () { try { sessionStorage.removeItem("elaraWeather"); } catch (e) { /* ignore */ } loadWeather(); });

    /* ---------------- Elara chat ---------------- */
    var chatBox = $("chatWindow");
    function addMsg(who, text) {
        var el = document.createElement("div");
        el.className = "message " + (who === "user" ? "user" : "ai");
        el.innerHTML = (who === "user" ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>') + "<div><strong>" + (who === "user" ? "You" : "Elara") + "</strong><p></p></div>";
        el.querySelector("p").textContent = text;
        chatBox.appendChild(el); chatBox.scrollTop = chatBox.scrollHeight;
        return el;
    }
    var hist = [];
    try { hist = JSON.parse(sessionStorage.getItem("elaraChat") || "[]").slice(-10); } catch (e) { hist = []; }
    if (hist.length) hist.forEach(function (m) { addMsg(m.w, m.t); });
    else addMsg("ai", "Hi " + (D.me().first || "there") + "! I can add tasks and groceries, switch devices, mark who's busy, check the weather and suggest meals from what's in the house. Try “what can I cook tonight?”");
    function remember(w, t) { hist.push({ w: w, t: t }); try { sessionStorage.setItem("elaraChat", JSON.stringify(hist.slice(-10))); } catch (e) { /* ignore */ } }
    $("chatForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var input = $("chatInput"), text = input.value.trim();
        if (!text) return;
        if (text.length > 500) return UI.toast("Please keep messages under 500 characters.", "error");
        input.value = ""; addMsg("user", text); remember("user", text);
        var wait = addMsg("ai", "…"); $("aiStatus").textContent = "Thinking";
        (window.ElaraAssistant ? ElaraAssistant.handle(text) : Promise.resolve("I'm not available right now."))
            .then(function (reply) { wait.querySelector("p").textContent = reply; remember("ai", reply); if (C.voicePrefs && C.voicePrefs().speak && document.activeElement === $("chatMic")) C.speak(reply); })
            .catch(function (err) { wait.querySelector("p").textContent = "Sorry, something went wrong: " + err.message; })
            .then(function () { $("aiStatus").textContent = "Online"; chatBox.scrollTop = chatBox.scrollHeight; render(); });
    });
    $("chatMic").addEventListener("click", function () { if (C.startVoice) C.startVoice(); });

    function render() { applyAccess(); greet(); renderStats(); renderDevices(); renderChart(); renderTasks(); renderSchedule(); renderActivity(); renderFamily(); }
    D.onChange(render);
    document.addEventListener("elara:refresh", render);
    setInterval(function () { greet(); renderStats(); renderActivity(); renderSchedule(); }, 60000);
    loadWeather();
    render();
})();
