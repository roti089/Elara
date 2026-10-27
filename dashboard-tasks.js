/* ==========================================================
                ELARA TASKS PAGE
   - tasks can only be assigned to people who are in the home
   - the assignee is notified, and the creator when it is completed
   - every task remembers who created / completed it (for Reports)
   (theme, logout, dialogs: elara-common.js)
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI;
    if (!D) return;
    window.ElaraPageLive = true;

    var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    function $(sel, root) { return (root || document).querySelector(sel); }
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function toKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function now() { return new Date(); }
    function todayKey() { return toKey(now()); }
    function nowHM() { var n = now(); return pad(n.getHours()) + ":" + pad(n.getMinutes()); }
    function canEdit() { return D.can("tasks", "edit"); }
    function me() { return D.me(); }
    function people() { return D.members.active(); }
    function personName(id, fallback) { var p = D.members.find(id); return p ? (p.isMe ? p.name + " (you)" : p.name) : (fallback || "Unassigned"); }

    var tab = "All", priorityFilter = "", personFilter = "", sortBy = "due", query = "", editingId = null;

    function tasks() { return D.tasks.all(); }
    function isOverdue(t) { return t.status !== "Completed" && (t.date + " " + t.time) < (todayKey() + " " + nowHM()); }
    function dueLabel(t) {
        var tk = todayKey(), tm = toKey(addDays(now(), 1));
        var d = t.date === tk ? "Today" : t.date === tm ? "Tomorrow"
              : DAYS[new Date(t.date + "T00:00").getDay()] + " " + +t.date.slice(8) + " " + MONTHS[+t.date.slice(5, 7) - 1].slice(0, 3);
        return d + " • " + t.time;
    }
    var PRI = { High: ["high", "high-priority", "High Priority"], Medium: ["medium", "medium-priority", "Medium"], Low: ["low", "low-priority", "Low"] };
    var STAT = { "In Progress": "in-progress", "Pending": "pending", "Completed": "completed" };

    /* older tasks only had a name: link them to the matching member */
    (function migrate() {
        if (!canEdit()) return;
        var list = tasks(), changed = false;
        list.forEach(function (t) {
            if (!t.assigneeId && t.assignee) {
                var p = people().filter(function (m) { return m.name.toLowerCase() === String(t.assignee).toLowerCase(); })[0];
                if (p) { t.assigneeId = p.userId; changed = true; }
            }
        });
        if (changed) D.tasks.save(list);
    })();

    /* ---------- filtering ---------- */
    function visibleTasks() {
        var tk = todayKey(), myId = me().id;
        var list = tasks().filter(function (t) {
            if (priorityFilter && t.priority !== priorityFilter) return false;
            if (personFilter && t.assigneeId !== personFilter) return false;
            if (query && (t.title + " " + t.description + " " + (t.assignee || "")).toLowerCase().indexOf(query) === -1) return false;
            if (tab === "Mine") return t.assigneeId === myId && t.status !== "Completed";
            if (tab === "Today") return t.date === tk && t.status !== "Completed";
            if (tab === "Upcoming") return t.date > tk && t.status !== "Completed";
            if (tab === "Completed") return t.status === "Completed";
            if (tab === "Overdue") return isOverdue(t);
            return true;
        });
        var rank = { High: 0, Medium: 1, Low: 2 };
        if (sortBy === "priority") list.sort(function (a, b) { return rank[a.priority] - rank[b.priority] || (a.date + a.time).localeCompare(b.date + b.time); });
        else if (sortBy === "newest") list.sort(function (a, b) { return (b.createdAt || b.id) - (a.createdAt || a.id); });
        else list.sort(function (a, b) { return (a.status === "Completed") - (b.status === "Completed") || (a.date + a.time).localeCompare(b.date + b.time); });
        return list;
    }

    /* ---------- render ---------- */
    function cardHTML(t) {
        var p = PRI[t.priority] || PRI.Medium, done = t.status === "Completed", overdue = isOverdue(t);
        var mineToEdit = canEdit();
        return '<div class="task-card ' + p[0] + '" data-id="' + esc(t.id) + '">' +
            '<div class="task-top"><span class="priority ' + p[1] + '">' + p[2] + '</span>' +
            '<span class="status ' + (overdue ? "pending overdue" : STAT[t.status] || "pending") + '">' + (overdue ? "Overdue" : esc(t.status)) + "</span></div>" +
            "<h3>" + esc(t.title) + "</h3><p>" + esc(t.description) + "</p>" +
            '<div class="task-details"><span><i class="fa-solid fa-user"></i> ' + esc(personName(t.assigneeId, t.assignee)) + "</span>" +
            '<span><i class="fa-solid ' + (done ? "fa-circle-check" : "fa-clock") + '"></i> ' + (done ? "Done" + (t.completedByName ? " by " + esc(t.completedByName) : "") : esc(dueLabel(t))) + "</span></div>" +
            (t.createdByName ? '<div class="task-meta">Added by ' + esc(t.createdByName) + "</div>" : "") +
            '<div class="task-progress"><div class="progress-bar"><div class="progress-fill" style="width:' + Math.max(0, Math.min(100, +t.progress || 0)) + '%"></div></div><span>' + (+t.progress || 0) + "%</span></div>" +
            (mineToEdit ? '<div class="task-buttons"><button type="button" class="btn-complete" data-action="toggle">' + (done ? "Reopen" : "Complete") + "</button>" +
                '<button type="button" class="btn-edit" data-action="edit">Edit</button>' +
                '<button type="button" class="btn-edit" data-action="delete" aria-label="Delete task"><i class="fa-solid fa-trash"></i></button></div>' : "") +
            "</div>";
    }

    function render() {
        var list = visibleTasks(), all = tasks(), tk = todayKey(), myId = me().id;
        $("#taskList").innerHTML = list.length ? list.map(cardHTML).join("")
            : '<div class="task-empty"><i class="fa-solid fa-clipboard-check"></i><h3>No tasks here</h3><p>' + (canEdit() ? "Nothing matches this view. Try another tab or add a task." : "Nothing matches this view.") + "</p></div>";

        var open = all.filter(function (t) { return t.status !== "Completed"; });
        var weekAgo = Date.now() - 7 * 86400000;
        function set(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
        set("openTasks", open.length);
        set("dueTodayNote", open.filter(function (t) { return t.date === tk; }).length + " due today");
        set("completedTasks", all.filter(function (t) { return t.status === "Completed" && (t.completedAt || 0) >= weekAgo; }).length);
        set("myTasks", open.filter(function (t) { return t.assigneeId === myId; }).length);
        set("overdueTasks", all.filter(isOverdue).length);

        var pct = all.length ? Math.round((all.length - open.length) / all.length * 100) : 0;
        var circle = $(".circle");
        if (circle) {
            var light = document.body.classList.contains("light-theme");
            circle.style.background = "conic-gradient(#6C63FF " + pct + "%, " + (light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.08)") + " 0)";
            circle.querySelector("span").textContent = pct + "%";
        }

        var next = open.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).slice(0, 5);
        $("#deadlines").innerHTML = next.length ? next.map(function (t) {
            return '<div class="deadline' + (isOverdue(t) ? " late" : "") + '"><strong>' + esc(t.title) + "</strong><small>" + esc(dueLabel(t)) + " • " + esc(personName(t.assigneeId, t.assignee)) + "</small></div>";
        }).join("") : '<div class="deadline"><strong>All caught up</strong><small>No open tasks</small></div>';

        var load = people().map(function (p) {
            var mine = open.filter(function (t) { return t.assigneeId === p.userId; });
            return { p: p, n: mine.length, late: mine.filter(isOverdue).length };
        });
        $("#workload").innerHTML = load.length ? load.map(function (w) {
            return '<button type="button" class="workload-row" data-person="' + esc(w.p.userId) + '"><span>' + esc(w.p.isMe ? w.p.name + " (you)" : w.p.name) +
                '</span><strong>' + w.n + " open" + (w.late ? ' <em>' + w.late + " late</em>" : "") + "</strong></button>";
        }).join("") : "<p>No members yet.</p>";

        renderActivity();
        renderPeopleFilter();
    }

    function renderPeopleFilter() {
        var sel = $("#personFilter"), cur = sel.value;
        sel.innerHTML = '<option value="">Everyone</option>' + people().map(function (p) {
            return '<option value="' + esc(p.userId) + '">' + esc(p.isMe ? p.name + " (you)" : p.name) + "</option>";
        }).join("");
        sel.value = cur;
    }

    function renderActivity() {
        var items = D.activity(40).filter(function (a) { return /task/i.test(a.text); }).slice(0, 6);
        $("#taskActivity").innerHTML = items.length ? items.map(function (a) {
            return '<div class="activity-item"><i class="fa-solid ' + esc(a.icon) + '"></i> ' + esc(a.who + " " + a.text) + "<span>" + esc(D.ago(a.t)) + "</span></div>";
        }).join("") : '<p class="task-muted">Task changes by anyone in the home show up here.</p>';
    }

    function renderCalendar() {
        var box = $(".calendar-box"); if (!box) return;
        var n = now(), start = addDays(n, -n.getDay()), all = tasks(), html = "";
        box.querySelector("h3").textContent = MONTHS[n.getMonth()] + " " + n.getFullYear();
        for (var i = 0; i < 7; i++) {
            var d = addDays(start, i), k = toKey(d);
            var count = all.filter(function (t) { return t.date === k && t.status !== "Completed"; }).length;
            html += '<span' + (k === todayKey() ? ' class="active-day"' : "") + ' title="' + DAYS[d.getDay()] + ": " + count + ' open task(s)">' + d.getDate() + (count ? "<i>" + count + "</i>" : "") + "</span>";
        }
        box.querySelector(".calendar-grid").innerHTML = html;
    }

    /* ---------- add / edit (validated) ---------- */
    function openForm(t) {
        if (!canEdit()) return UI.toast("You can view tasks but not change them.", "error");
        var ppl = people();
        if (!ppl.length) return UI.toast("Nobody is in the home yet.", "error");
        editingId = t ? t.id : null;
        var defaultAssignee = t && D.members.find(t.assigneeId) ? t.assigneeId : me().id;
        UI.form({
            title: t ? "Edit task" : "Add a task", icon: "fa-list-check", submitText: t ? "Save changes" : "Add task",
            fields: [
                { name: "title", label: "Title", value: t ? t.title : "", required: true, maxlength: 80, placeholder: "e.g. Service the geyser" },
                { name: "description", label: "Details (optional)", type: "textarea", value: t && t.description !== "No description." ? t.description : "", maxlength: 500 },
                { name: "assigneeId", label: "Assigned to (people in your home)", type: "select", value: defaultAssignee,
                  options: ppl.map(function (p) { return [p.userId, p.isMe ? p.name + " (you)" : p.name]; }) },
                { name: "priority", label: "Priority", type: "select", value: t ? t.priority : "Medium", options: ["High", "Medium", "Low"] },
                { name: "date", label: "Due date", type: "date", value: t ? t.date : todayKey(), required: true, min: t ? undefined : todayKey() },
                { name: "time", label: "Due time", type: "time", value: t ? t.time : "17:00", required: true },
                { name: "status", label: "Status", type: "select", value: t ? t.status : "Pending", options: ["Pending", "In Progress", "Completed"] },
                { name: "progress", label: "Progress (%)", type: "number", value: t ? t.progress : 0, min: 0, max: 100, step: 5 }
            ],
            validate: function (v) {
                if (v.title.length < 2 || v.title.length > 80) return "The title must be 2 to 80 characters.";
                if (v.description.length > 500) return "Details can be at most 500 characters.";
                if (!D.members.find(v.assigneeId) || D.members.find(v.assigneeId).status !== "active") return "Choose someone who is in your home.";
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || isNaN(new Date(v.date + "T00:00"))) return "Choose a valid due date.";
                if (!/^\d{2}:\d{2}$/.test(v.time)) return "Choose a valid time.";
                if (!t && (v.date + " " + v.time) < (todayKey() + " " + nowHM())) return "A new task can't be due in the past.";
                if (v.date > toKey(addDays(now(), 5 * 365))) return "That due date is too far away.";
                var pr = Number(v.progress);
                if (!isFinite(pr) || pr < 0 || pr > 100 || Math.round(pr) !== pr) return "Progress must be a whole number from 0 to 100.";
                var dup = tasks().some(function (x) { return x.id !== editingId && x.status !== "Completed" && x.title.toLowerCase() === v.title.toLowerCase() && x.date === v.date; });
                if (dup) return "There's already an open task with that title on that day.";
                return null;
            }
        }).then(function (v) { if (v) save(v, t); });
    }

    function save(v, t) {
        var list = tasks(), m = me(), assignee = D.members.find(v.assigneeId);
        var status = v.status, progress = status === "Completed" ? 100 : Math.max(0, Math.min(100, parseInt(v.progress, 10) || 0));
        if (progress === 100 && status !== "Completed") status = "Completed";
        var data = { title: v.title, description: v.description || "No description.", priority: v.priority, assigneeId: assignee.userId, assignee: assignee.name,
                     date: v.date, time: v.time, status: status, progress: progress, updatedAt: Date.now(), updatedBy: m.id };
        if (t) {
            var before = list.filter(function (x) { return x.id === t.id; })[0];
            if (!before) return UI.toast("That task was deleted by someone else.", "error");
            var reassigned = before.assigneeId !== data.assigneeId, finished = before.status !== "Completed" && status === "Completed";
            Object.assign(before, data);
            if (finished) { before.completedBy = m.id; before.completedByName = m.first; before.completedAt = Date.now(); }
            if (status !== "Completed") { delete before.completedBy; delete before.completedByName; delete before.completedAt; }
            D.tasks.save(list);
            D.log("updated task “" + data.title + "”", "fa-pen");
            if (reassigned && data.assigneeId !== m.id) D.notify({ to: [data.assigneeId], kind: "tasks", title: "Task assigned to you", body: m.first + " gave you “" + data.title + "” (due " + dueLabel(before) + ").", href: "dashboard-tasks.html" });
            if (finished) notifyDone(before);
            UI.toast("Task updated.");
        } else {
            var task = Object.assign({ id: Date.now(), createdBy: m.id, createdByName: m.first, createdAt: Date.now() }, data);
            if (status === "Completed") { task.completedBy = m.id; task.completedByName = m.first; task.completedAt = Date.now(); }
            list.unshift(task);
            D.tasks.save(list);
            D.log("added task “" + data.title + "”" + (data.assigneeId !== m.id ? " for " + data.assignee : ""), "fa-list-check");
            if (data.assigneeId !== m.id) D.notify({ to: [data.assigneeId], kind: "tasks", title: "New task for you", body: m.first + " assigned “" + data.title + "” (due " + dueLabel(task) + ").", href: "dashboard-tasks.html" });
            UI.toast("Task added" + (data.assigneeId !== m.id ? " and " + data.assignee + " was notified." : "."));
        }
        render(); renderCalendar();
    }
    function notifyDone(t) {
        var m = me(), to = [t.createdBy, t.assigneeId].filter(function (id, i, a) { return id && id !== m.id && a.indexOf(id) === i; });
        if (to.length) D.notify({ to: to, kind: "tasks", title: "Task completed", body: m.first + " completed “" + t.title + "”.", href: "dashboard-tasks.html" });
    }

    /* ---------- events ---------- */
    $(".add-task").addEventListener("click", function () { openForm(null); });

    $("#taskList").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-action]");
        if (!btn || !canEdit()) return;
        var id = btn.closest(".task-card").dataset.id;
        var list = tasks(), t = list.filter(function (x) { return String(x.id) === id; })[0];
        if (!t) return;
        var m = me();
        if (btn.dataset.action === "edit") openForm(t);
        else if (btn.dataset.action === "toggle") {
            if (t.status === "Completed") {
                t.status = "Pending"; t.progress = 0; delete t.completedBy; delete t.completedByName; delete t.completedAt;
                D.log("reopened task “" + t.title + "”", "fa-rotate-left"); UI.toast("Task reopened.", "info");
            } else {
                t.status = "Completed"; t.progress = 100; t.completedBy = m.id; t.completedByName = m.first; t.completedAt = Date.now();
                D.log("completed task “" + t.title + "”", "fa-circle-check"); UI.toast("Task completed. Nice work!");
                notifyDone(t);
            }
            t.updatedAt = Date.now(); t.updatedBy = m.id;
            D.tasks.save(list); render(); renderCalendar();
        } else if (btn.dataset.action === "delete") {
            UI.confirm({ title: "Delete this task?", message: "“" + t.title + "” will be permanently removed for everyone.", confirmText: "Delete task" })
                .then(function (ok) {
                    if (!ok) return;
                    D.tasks.save(tasks().filter(function (x) { return String(x.id) !== id; }));
                    D.log("deleted task “" + t.title + "”", "fa-trash");
                    render(); renderCalendar(); UI.toast("Task deleted.");
                });
        }
    });

    document.querySelectorAll(".task-tabs button").forEach(function (b) {
        b.addEventListener("click", function () {
            document.querySelectorAll(".task-tabs button").forEach(function (x) { x.classList.remove("active"); x.setAttribute("aria-selected", "false"); });
            b.classList.add("active"); b.setAttribute("aria-selected", "true"); tab = b.dataset.tab; render();
        });
    });
    $("#priorityFilter").addEventListener("change", function () { priorityFilter = this.value; render(); });
    $("#personFilter").addEventListener("change", function () { personFilter = this.value; render(); });
    $("#sortBy").addEventListener("change", function () { sortBy = this.value; render(); });
    $("#taskSearch").addEventListener("input", function () { query = this.value.toLowerCase().trim().slice(0, 80); render(); });
    $("#workload").addEventListener("click", function (e) {
        var r = e.target.closest("[data-person]"); if (!r) return;
        personFilter = r.dataset.person; $("#personFilter").value = personFilter; render();
    });

    D.onChange(function () { render(); renderCalendar(); });
    document.addEventListener("elara:refresh", function () { render(); renderCalendar(); });
    setInterval(render, 60000);           // overdue labels change with the clock

    if (/[?&]new=1/.test(location.search)) setTimeout(function () { openForm(null); }, 300);
    renderCalendar();
    render();
})();
