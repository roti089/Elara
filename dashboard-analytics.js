/* ==========================================================
            ELARA ANALYTICS
   Only real readings from the power meters in your CBi / Smart Life
   switches. When nothing has been measured, the page says so.
   (theme, bell, logout: elara-common.js)
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, cfg = window.ELARA_CONFIG || {};
    if (!D) return;
    window.ElaraPageLive = true;

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function kwh(v) { return v < 0.1 ? (v * 1000).toFixed(0) + " Wh" : (v < 10 ? v.toFixed(2) : v.toFixed(1)) + " kWh"; }
    function watts(w) { return w == null ? "—" : w >= 1000 ? (w / 1000).toFixed(2) + " kW" : Math.round(w) + " W"; }
    var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var LABEL = { today: "today", week: "in the last 7 days", month: "in the last 30 days" };
    var PREV = { today: "yesterday", week: "the 7 days before", month: "the 30 days before" };
    var query = "";

    function range() { return $("analyticsPeriod").value; }

    function banner(e) {
        var b = $("dataBanner"), msg = "";
        if (D.demo) msg = '<i class="fa-solid fa-flask"></i><span>Demo mode has no real switches, so there is nothing to measure. Log in and connect CBi Home.</span>';
        else if (!cfg.tuyaEndpoint) msg = '<i class="fa-solid fa-link-slash"></i><span>CBi Home isn’t connected, so there are no readings yet. See README, step 8.</span>';
        else if (!e.connected) msg = '<i class="fa-solid fa-plug-circle-plus"></i><span>No switches imported yet. Go to <a href="dashboard-smart-home.html">Smart Home</a> and press <strong>CBi Home</strong>.</span>';
        else if (!e.metered) msg = '<i class="fa-solid fa-circle-info"></i><span>Your switches are connected, but none of them have a power meter, so energy can’t be measured. Switches that report watts (most CBi smart plugs and geyser switches do) show up here automatically.</span>';
        else if (!e.hasData) msg = '<i class="fa-solid fa-hourglass-half"></i><span>Your meters are connected. Readings are recorded every few minutes, so numbers appear here shortly.</span>';
        b.hidden = !msg; b.innerHTML = msg;
    }

    function render() {
        var r = range(), e = D.energy.compute(r);
        banner(e);
        var has = e.hasData;
        $("totalUsage").textContent = has ? kwh(e.total) : "—";
        $("totalNote").textContent = has ? (e.change === null ? "Measured " + LABEL[r] : Math.abs(e.change) + "% " + (e.change <= 0 ? "less" : "more") + " than " + PREV[r]) : "Nothing measured " + LABEL[r];
        $("estimatedCost").textContent = has ? "R" + e.cost.toFixed(2) : "—";
        $("costNote").textContent = "At R" + e.tariff.toFixed(2) + " per kWh (Settings > Home)";
        $("livePower").textContent = e.metered ? watts(e.livePower) : "—";
        $("liveNote").textContent = e.metered ? e.metered + " switch" + (e.metered === 1 ? "" : "es") + " with a meter" + (e.updated ? " • " + D.ago(e.updated) : "") : "No switch reports power";
        $("peakPower").textContent = e.peak ? watts(e.peak) : "—";

        drawChart(r, e);

        var rows = e.devices.filter(function (d) { return !query || (d.name + " " + d.room).toLowerCase().indexOf(query) > -1; });
        $("deviceRows").innerHTML = rows.length ? rows.map(function (d) {
            var pct = e.total ? Math.round(d.kwh / e.total * 100) : 0;
            var right = d.measured ? "<strong>" + kwh(d.kwh) + "</strong><span>" + pct + "% • " + (d.online ? watts(d.watts) + " now" : "offline") + "</span>" : "<strong>—</strong><span>No power meter</span>";
            return '<a class="analytics-device" href="dashboard-smart-home.html"><div class="analytics-device-left"><div class="analytics-icon"><i class="fa-solid ' + esc(d.icon || "fa-plug") + '"></i></div><div><h4>' + esc(d.name) + "</h4><p>" + esc(d.room) + '</p></div></div><div class="analytics-value">' + right + "</div></a>";
        }).join("") : '<p class="muted-row">' + (e.connected ? "No devices match." : "No switches connected.") + "</p>";

        $("roomRows").innerHTML = has && e.rooms.length ? e.rooms.map(function (x) {
            var pct = e.total ? Math.round(x.kwh / e.total * 100) : 0;
            return '<div class="room-stat"><div><h4>' + esc(x.room) + "</h4><p>" + kwh(x.kwh) + "</p></div><strong>" + pct + '%</strong></div><div class="progress"><span style="width:' + pct + '%"></span></div>';
        }).join("") : '<p class="muted-row">Nothing measured ' + LABEL[r] + ".</p>";

        var parts = [["morning", "Morning", "06:00–12:00"], ["afternoon", "Afternoon", "12:00–17:00"], ["evening", "Evening", "17:00–22:00"], ["night", "Night", "22:00–06:00"]];
        $("partRows").innerHTML = has ? parts.map(function (p) {
            var v = e.parts[p[0]], pct = e.total ? Math.round(v / e.total * 100) : 0;
            return '<div class="room-stat"><div><h4>' + p[1] + "</h4><p>" + p[2] + " • " + kwh(v) + "</p></div><strong>" + pct + '%</strong></div><div class="progress"><span style="width:' + pct + '%"></span></div>';
        }).join("") : '<p class="muted-row">Nothing measured ' + LABEL[r] + ".</p>";

        var ins = [];
        if (has) {
            var top = e.devices.filter(function (d) { return d.kwh > 0; })[0];
            if (top) ins.push(["fa-bolt", top.name + " used the most", kwh(top.kwh) + ", " + Math.round(top.kwh / e.total * 100) + "% of everything " + LABEL[r] + "."]);
            if (e.change !== null) ins.push([e.change <= 0 ? "fa-arrow-trend-down" : "fa-arrow-trend-up", e.change <= 0 ? "Using less" : "Using more", Math.abs(e.change) + "% " + (e.change <= 0 ? "less" : "more") + " than " + PREV[r] + "."]);
            var peakPart = Object.keys(e.parts).sort(function (a, b) { return e.parts[b] - e.parts[a]; })[0];
            if (e.parts.evening / e.total > 0.4) ins.push(["fa-clock", "Lots of evening use", Math.round(e.parts.evening / e.total * 100) + "% was used between 17:00 and 22:00, when Eskom demand is highest. Running the geyser earlier can help."]);
            else ins.push(["fa-clock", "Most energy in the " + peakPart, Math.round(e.parts[peakPart] / e.total * 100) + "% of the energy " + LABEL[r] + "."]);
            var per = {};
            D.energy.integrate(r, null, 0, false, null, null, function (k, dev, when, by) { per[by || "auto"] = (per[by || "auto"] || 0) + k; });
            var topWho = Object.keys(per).sort(function (a, b) { return per[b] - per[a]; })[0];
            if (topWho && per[topWho] > 0.01) {
                var p = topWho === "auto" ? null : D.members.find(topWho);
                ins.push(["fa-user", (topWho === "auto" ? "Automations / CBi app" : p ? (p.isMe ? "You" : p.name) : "A former member") + " switched on the most", kwh(per[topWho]) + " " + LABEL[r] + "." + (D.can("reports") ? " See Reports for everyone." : "")]);
            }
        }
        $("insightList").innerHTML = ins.length ? ins.map(function (i) {
            return '<div class="activity-item"><div class="activity-left"><div class="activity-icon"><i class="fa-solid ' + i[0] + '"></i></div><div class="activity-info"><h4>' + esc(i[1]) + "</h4><p>" + esc(i[2]) + "</p></div></div></div>";
        }).join("") : '<p class="muted-row">Insights appear once your switches have measured some energy.</p>';
    }

    var chart = null;
    function drawChart(r, e) {
        var canvas = $("energyChart"), empty = !e.hasData || e.total <= 0;
        $("chartEmpty").hidden = !empty; canvas.style.display = empty ? "none" : "";
        $("chartNote").textContent = r === "today" ? "kWh per hour today" : "kWh per day";
        if (empty || typeof Chart === "undefined") return;
        var labels = [];
        if (r === "today") for (var h = 0; h < 24; h++) labels.push((h < 10 ? "0" : "") + h + ":00");
        else for (var i = e.series.length - 1; i >= 0; i--) { var d = D.util.addDays(new Date(), -i); labels.push(r === "week" ? DAYS[d.getDay()] : d.getDate() + "/" + (d.getMonth() + 1)); }
        var data = e.series.map(function (v) { return +v.toFixed(3); });
        var light = document.body.classList.contains("light-theme"), tick = light ? "#4b5375" : "#b8bfd9", grid = light ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.05)";
        if (chart) chart.destroy();
        chart = new Chart(canvas, {
            type: "bar",
            data: { labels: labels, datasets: [{ label: "kWh", data: data, backgroundColor: "#6C63FF", borderRadius: 6, maxBarThickness: 40 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return kwh(c.parsed.y); } } } },
                scales: { x: { ticks: { color: tick, maxRotation: 0, autoSkip: true }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tick }, grid: { color: grid } } } }
        });
    }

    $("analyticsPeriod").addEventListener("change", render);
    var s = $("analyticsSearch");
    if (s) s.addEventListener("input", function () { query = this.value.toLowerCase().trim().slice(0, 60); render(); });
    D.onChange(render);
    document.addEventListener("elara:refresh", render);
    setInterval(render, 60000);
    render();
    if (D.user) D.energy.load();
})();
