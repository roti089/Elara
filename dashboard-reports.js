/* ==========================================================
            ELARA REPORTS  (usage per person)
   - energy: kWh/cost for whoever switched each device on, and switch counts
   - groceries: spending by whoever marked items as bought
   - tasks: created, assigned, completed, overdue
   - events: added to the schedule
   Each section only appears if you're allowed to see that area.
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI;
    if (!D) return;
    window.ElaraPageLive = true;

    var DAY = 86400000;
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function toKey(d) { d = new Date(d); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function fromKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function money(v) { return "R" + (v || 0).toFixed(2); }
    function kwh(v) { return (v < 1 ? v.toFixed(2) : v.toFixed(1)) + " kWh"; }
    function sod(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }

    var can = { energy: D.can("smartHome"), shopping: D.can("shopping"), tasks: D.can("tasks"), schedule: D.can("schedule") };
    document.querySelectorAll("[data-area]").forEach(function (el) { if (!D.can(el.dataset.area)) el.style.display = "none"; });

    /* ---------------- period ---------------- */
    $("reportTo").value = toKey(new Date()); $("reportTo").max = toKey(new Date());
    $("reportFrom").value = toKey(Date.now() - 29 * DAY); $("reportFrom").max = toKey(new Date());
    function period() {
        var v = $("reportPeriod").value, now = new Date(), today = sod(now);
        if (v === "week") return { from: today.getTime() - 6 * DAY, to: now.getTime(), label: "the last 7 days" };
        if (v === "month") return { from: today.getTime() - 29 * DAY, to: now.getTime(), label: "the last 30 days" };
        if (v === "thisMonth") return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: now.getTime(), label: now.toLocaleString(undefined, { month: "long", year: "numeric" }) };
        if (v === "lastMonth") {
            var a = new Date(now.getFullYear(), now.getMonth() - 1, 1), b = new Date(now.getFullYear(), now.getMonth(), 1);
            return { from: a.getTime(), to: b.getTime() - 1, label: a.toLocaleString(undefined, { month: "long", year: "numeric" }) };
        }
        var f = $("reportFrom").value, t = $("reportTo").value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return { error: "Choose both a start and an end date." };
        var from = fromKey(f).getTime(), to = fromKey(t).getTime() + DAY - 1;
        if (from > to) return { error: "The start date must be before the end date." };
        if (from > now.getTime()) return { error: "The start date can't be in the future." };
        if (to - from > 366 * DAY) return { error: "A report can cover at most one year." };
        return { from: from, to: Math.min(to, now.getTime()), label: f + " to " + t };
    }

    /* ---------------- people ---------------- */
    function roster() {
        var list = D.members.all().filter(function (p) { return p.userId; }).map(function (p) { return { id: p.userId, name: p.isMe ? p.name + " (you)" : p.name, status: p.status }; });
        return list;
    }
    function personSelect() {
        var sel = $("reportPerson"), cur = sel.value;
        sel.innerHTML = '<option value="">Everyone</option>' + roster().map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>"; }).join("");
        sel.value = cur;
    }

    /* ---------------- build the numbers ---------------- */
    function compute(p) {
        var rows = {}, order = [];
        function row(id, name) {
            id = id || "unknown";
            if (!rows[id]) {
                var m = D.members.find(id);
                rows[id] = { id: id, name: m ? (m.isMe ? m.name + " (you)" : m.name) : name || (id === "auto" ? "Automations / CBi app" : "Former member"),
                             switches: 0, kwh: 0, cost: 0, devices: {}, groceries: 0, items: 0, topItems: {},
                             created: 0, assigned: 0, completed: 0, overdue: 0, events: 0 };
                order.push(id);
            }
            return rows[id];
        }
        roster().forEach(function (r) { row(r.id, r.name); });
        var tf = D.energy.tariff();

        if (can.energy) {
            var days = Math.max(1, Math.round((p.to - p.from) / DAY));
            D.energy.integrate(days <= 1 ? "today" : "week", p.to, 0, false, p.from, p.to, function (k, dev, when, by) {
                var r = row(by || "auto"); r.kwh += k; r.cost += k * tf; r.devices[dev.name] = (r.devices[dev.name] || 0) + k;
            });
            D.util.load("elaraEnergyLog", []).forEach(function (e) {
                if (e.t < p.from || e.t > p.to || !e.on || e.auto) return;
                row(e.by, e.who).switches++;
            });
        }
        if (can.shopping) {
            D.util.load("elaraCartItems", []).forEach(function (c) {
                if (!c.addedAt || c.addedAt < p.from || c.addedAt > p.to) return;
                var r = row(c.by, c.byName), amt = (Number(c.price) || 0) * (Number(c.qty) || 1);
                r.groceries += amt; r.items += Number(c.qty) || 1; r.topItems[c.name] = (r.topItems[c.name] || 0) + amt;
            });
        }
        if (can.tasks) {
            var nowKey = toKey(new Date()) + " " + pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
            D.tasks.all().forEach(function (t) {
                var created = t.createdAt || (t.id > 1e12 ? t.id : null);
                if (created && created >= p.from && created <= p.to) row(t.createdBy, t.createdByName).created++;
                if (t.assigneeId && created && created >= p.from && created <= p.to) row(t.assigneeId, t.assignee).assigned++;
                if (t.status === "Completed" && t.completedAt && t.completedAt >= p.from && t.completedAt <= p.to) row(t.completedBy || t.assigneeId, t.completedByName).completed++;
                if (t.status !== "Completed" && t.assigneeId && (t.date + " " + (t.time || "23:59")) < nowKey) row(t.assigneeId, t.assignee).overdue++;
            });
        }
        if (can.schedule) {
            D.util.load("elaraSchedules", []).forEach(function (e) {
                var c = e.createdAt || (e.id > 1e12 && e.id < 1e13 ? e.id : null);
                if (c && c >= p.from && c <= p.to && e.source !== "ics") row(e.createdBy, e.createdByName).events++;
            });
        }
        var list = order.map(function (id) { return rows[id]; }).filter(function (r) {
            var active = roster().some(function (x) { return x.id === r.id; });
            return active || r.kwh >= 0.005 || r.switches || r.groceries || r.created || r.completed || r.events || r.overdue;
        });
        var who = $("reportPerson").value;
        if (who) list = list.filter(function (r) { return r.id === who; });
        return list;
    }

    /* ---------------- render ---------------- */
    var charts = {}, last = [];
    function render() {
        var p = period();
        $("reportError").textContent = p.error || "";
        document.querySelectorAll(".custom-only").forEach(function (el) { el.style.display = $("reportPeriod").value === "custom" ? "" : "none"; });
        if (p.error) return;
        personSelect();
        var rows = last = compute(p);
        $("reportRange").textContent = "Report for " + p.label + " • made " + new Date().toLocaleString();
        var sum = function (k) { return rows.reduce(function (s, r) { return s + r[k]; }, 0); };
        $("sumEnergy").textContent = kwh(sum("kwh")); $("sumEnergyNote").textContent = money(sum("cost")) + " • " + sum("switches") + " switch-ons";
        $("sumGroceries").textContent = money(sum("groceries")); $("sumGroceriesNote").textContent = sum("items") + " item(s) bought";
        $("sumTasks").textContent = sum("completed"); $("sumTasksNote").textContent = sum("created") + " created • " + sum("overdue") + " overdue now";
        $("sumEvents").textContent = sum("events"); $("sumEventsNote").textContent = "Added by people (imports not counted)";

        var cols = [["Person", function (r) { return esc(r.name); }]];
        if (can.energy) cols.push(["Switch-ons", function (r) { return r.switches; }], ["Energy", function (r) { return kwh(r.kwh); }], ["Energy cost", function (r) { return money(r.cost); }]);
        if (can.shopping) cols.push(["Groceries", function (r) { return money(r.groceries); }], ["Items", function (r) { return r.items; }]);
        if (can.tasks) cols.push(["Tasks created", function (r) { return r.created; }], ["Assigned", function (r) { return r.assigned; }], ["Completed", function (r) { return r.completed; }], ["Overdue now", function (r) { return r.overdue ? '<span class="late">' + r.overdue + "</span>" : 0; }]);
        if (can.schedule) cols.push(["Events added", function (r) { return r.events; }]);
        $("reportTable").innerHTML = "<thead><tr>" + cols.map(function (c) { return "<th>" + c[0] + "</th>"; }).join("") + "</tr></thead><tbody>" +
            (rows.length ? rows.map(function (r) { return "<tr>" + cols.map(function (c, i) { return (i ? "<td>" : '<th scope="row">') + c[1](r) + (i ? "</td>" : "</th>"); }).join("") + "</tr>"; }).join("")
                         : '<tr><td colspan="' + cols.length + '" class="muted">No activity in this period.</td></tr>') + "</tbody>";

        $("personCards").innerHTML = rows.length ? rows.map(function (r) {
            var topDev = Object.keys(r.devices).sort(function (a, b) { return r.devices[b] - r.devices[a]; }).slice(0, 3);
            var topItem = Object.keys(r.topItems).sort(function (a, b) { return r.topItems[b] - r.topItems[a]; }).slice(0, 3);
            var lines = [];
            if (can.energy) lines.push(topDev.length ? "Used most: " + topDev.map(function (n) { return n + " (" + kwh(r.devices[n]) + ")"; }).join(", ") : "No energy use recorded");
            if (can.shopping) lines.push(topItem.length ? "Spent most on: " + topItem.map(function (n) { return n + " (" + money(r.topItems[n]) + ")"; }).join(", ") : "No groceries bought");
            if (can.tasks) lines.push(r.completed + " task(s) completed" + (r.overdue ? ", " + r.overdue + " overdue" : ""));
            return '<div class="person-card"><h4>' + esc(r.name) + "</h4>" + lines.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("") + "</div>";
        }).join("") : '<p class="muted">Nothing to show.</p>';

        drawBar("energyPersonChart", rows, "kwh", "kWh", "#6C63FF");
        drawBar("spendPersonChart", rows, "groceries", "Rand", "#22C55E");
    }
    function drawBar(id, rows, key, label, color) {
        var canvas = $(id); if (!canvas || typeof Chart === "undefined" || canvas.closest("[data-area]").style.display === "none") return;
        var light = document.body.classList.contains("light-theme"), tick = light ? "#4b5375" : "#b8bfd9", grid = light ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.05)";
        var labels = rows.map(function (r) { return r.name; }), data = rows.map(function (r) { return +r[key].toFixed(2); });
        if (charts[id]) { charts[id].data.labels = labels; charts[id].data.datasets[0].data = data; charts[id].update(); return; }
        charts[id] = new Chart(canvas, {
            type: "bar",
            data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: color, borderRadius: 8, maxBarThickness: 48 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tick }, grid: { color: grid } } } }
        });
    }

    /* ---------------- export ---------------- */
    $("exportCsv").addEventListener("click", function () {
        var p = period(); if (p.error) return UI.toast(p.error, "error");
        var head = ["Person"], line = function (r) { var out = [r.name]; if (can.energy) out.push(r.switches, r.kwh.toFixed(3), r.cost.toFixed(2)); if (can.shopping) out.push(r.groceries.toFixed(2), r.items); if (can.tasks) out.push(r.created, r.assigned, r.completed, r.overdue); if (can.schedule) out.push(r.events); return out; };
        if (can.energy) head.push("Switch-ons", "Energy kWh", "Energy cost R");
        if (can.shopping) head.push("Groceries R", "Items");
        if (can.tasks) head.push("Tasks created", "Assigned", "Completed", "Overdue now");
        if (can.schedule) head.push("Events added");
        var csv = [["Elara report", p.label]].concat([head], last.map(line)).map(function (r) {
            return r.map(function (v) { v = String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
        }).join("\r\n");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        a.download = "elara-report-" + toKey(new Date()) + ".csv";
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        UI.toast("Report downloaded.");
    });
    $("printReport").addEventListener("click", function () { window.print(); });

    ["reportPeriod", "reportFrom", "reportTo", "reportPerson"].forEach(function (id) { $(id).addEventListener("change", render); });
    D.onChange(render);
    document.addEventListener("elara:refresh", render);
    render();
})();
