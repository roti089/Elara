/* ==========================================================
                ELARA TASKS PAGE
   - tasks can only be assigned to people who are in the home
   - the assignee is notified, and the creator when it is completed
   - every task remembers who created / completed it (for Reports)
   (theme, logout, dialogs: elara-common.js)
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI, F = window.ElaraFeatures;
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
            if (tab === "Chores") return !!t.choreId && (t.status !== "Completed" || t.date >= toKey(addDays(now(), -14)));
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
            "<h3>" + esc(t.title) + (t.choreId ? ' <span class="chore-badge" title="Chore rotation"><i class="fa-solid fa-rotate"></i> ' + (Number(t.points) || 1) + " pt" + ((Number(t.points) || 1) === 1 ? "" : "s") + "</span>" : "") + "</h3><p>" + esc(t.description) + "</p>" +
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
        renderChores();
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
                { name: "date", label: "Due date", type: "date", value: t ? t.date : todayKey(), required: true, min: t && t.date < todayKey() ? t.date : todayKey(), max: toKey(addDays(now(), 5 * 365)) },
                { name: "time", label: "Due time", type: "time", value: t ? t.time : defaultTime(), required: true },
                { name: "status", label: "Status", type: "select", value: t ? t.status : "Pending", options: ["Pending", "In Progress", "Completed"] },
                { name: "progress", label: "Progress (%)", type: "number", value: t ? t.progress : 0, min: 0, max: 100, step: 5 }
            ],
            validate: function (v) {
                var nowKey = todayKey() + " " + nowHM(), moved = !t || t.date !== v.date || t.time !== v.time;
                if (v.title.length < 2 || v.title.length > 80) return { field: "title", msg: "The title must be 2 to 80 characters." };
                if (!/[a-z0-9]/i.test(v.title) || /[<>]/.test(v.title)) return { field: "title", msg: "The title needs letters or numbers, and no < or >." };
                if (v.description.length > 500) return { field: "description", msg: "Details can be at most 500 characters." };
                var who = D.members.find(v.assigneeId);
                if (!who || who.status !== "active") return { field: "assigneeId", msg: "Choose someone who is in your home." };
                if (["High", "Medium", "Low"].indexOf(v.priority) < 0) return { field: "priority", msg: "Choose a priority." };
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || isNaN(new Date(v.date + "T00:00").getTime())) return { field: "date", msg: "Choose the due date." };
                if (moved && v.date < todayKey()) return { field: "date", msg: "That day has already passed. Choose today or a later day." };
                if (v.date > toKey(addDays(now(), 5 * 365))) return { field: "date", msg: "Choose a due date within the next 5 years." };
                if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) return { field: "time", msg: "Choose the due time." };
                if (moved && (v.date + " " + v.time) <= nowKey) return { field: "time", msg: "That time has already passed today. Choose a later time." };
                if (["Pending", "In Progress", "Completed"].indexOf(v.status) < 0) return { field: "status", msg: "Choose a status." };
                if (!t && v.status === "Completed") return { field: "status", msg: "A new task can't start as completed." };
                if (String(v.progress).trim() === "") return { field: "progress", msg: "Enter the progress (0 to 100)." };
                var pr = Number(v.progress);
                if (!isFinite(pr) || pr < 0 || pr > 100 || Math.round(pr) !== pr) return { field: "progress", msg: "Progress must be a whole number from 0 to 100." };
                if (v.status === "Pending" && pr > 0) return { field: "progress", msg: "A pending task has 0% progress. Set the status to In Progress, or progress to 0." };
                var dup = tasks().some(function (x) { return x.id !== editingId && x.status !== "Completed" && x.title.toLowerCase() === v.title.toLowerCase() && x.date === v.date; });
                if (dup) return { field: "title", msg: "There's already an open task with that title on that day." };
                return null;
            }
        }).then(function (v) { if (v) save(v, t); });
    }

    /* new tasks default to 17:00, or the next full hour if 17:00 has passed */
    function defaultTime() { var h = now().getHours(); return h < 17 ? "17:00" : (h >= 23 ? "23:59" : (h + 1 < 10 ? "0" : "") + (h + 1) + ":00"); }
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

    /* ---------- chore rotation ---------- */
    function renderChores() {
        if (!F || !$("#choreList")) return;
        var list = F.chores.all(), edit = canEdit();
        $("#choreList").innerHTML = list.length ? list.map(function (c) {
            var d = F.chores.describe(c), off = c.on === false;
            var order = (c.people || []).map(function (id) { var p = D.members.find(id); return p ? (p.isMe ? "You" : p.name) : null; }).filter(Boolean);
            return '<div class="chore-row' + (off ? " off" : "") + '" data-id="' + esc(c.id) + '"><div class="chore-ic"><i class="fa-solid fa-broom"></i></div><div class="chore-main"><strong>' + esc(c.title) + "</strong>" +
                "<small>" + esc(d.when) + " • " + (Number(c.points) || 1) + " pt" + ((Number(c.points) || 1) === 1 ? "" : "s") + "</small>" +
                '<small class="chore-turn">' + (off ? "Paused" : "This week: <b>" + esc(d.now) + "</b> • Next week: " + esc(d.next)) + "</small>" +
                '<small class="chore-order">Rotation: ' + esc(order.join(" → ") || "nobody") + "</small></div>" +
                (edit ? '<div class="chore-acts"><button type="button" class="icon-act" data-chore="edit" aria-label="Edit ' + esc(c.title) + '"><i class="fa-solid fa-pen"></i></button></div>' : "") + "</div>";
        }).join("") : '<div class="feature-empty"><i class="fa-solid fa-broom"></i><p>No chores yet. Add one (e.g. “Take out the bins”, Tuesdays) and Elara gives it to a different person each week.</p></div>';
        var board = F.chores.board();
        $("#choreBoard").innerHTML = board.length && list.length ? '<div class="board-head"><span>Person</span><span>This week</span><span>4 weeks</span><span>Streak</span></div>' + board.map(function (r, i) {
            return '<div class="board-row' + (i === 0 && r.week > 0 ? " lead" : "") + '"><span class="board-name">' + (i === 0 && r.week > 0 ? '<i class="fa-solid fa-crown"></i> ' : "") + esc(r.name) +
                (r.open ? "<small>" + r.open + " chore" + (r.open === 1 ? "" : "s") + " left this week</small>" : "") + "</span><span><b>" + r.week + "</b> pts</span><span>" + r.month + " pts</span>" +
                '<span class="board-streak' + (r.streak ? " hot" : "") + '">' + (r.streak ? '<i class="fa-solid fa-fire"></i> ' + r.streak + " wk" + (r.streak === 1 ? "" : "s") : "—") + "</span></div>";
        }).join("") : '<div class="feature-empty"><i class="fa-solid fa-trophy"></i><p>Points appear here once chores are being done.</p></div>';
    }
    function openChore(c) {
        if (!canEdit()) return UI.toast("You can view tasks but not change them.", "error");
        var ppl = people(), isNew = !c;
        if (!ppl.length) return UI.toast("Nobody is in the home yet.", "error");
        c = c || { id: "ch" + Date.now().toString(36), title: "", people: ppl.map(function (p) { return p.userId; }), days: [6], time: "09:00", points: 2, on: true };
        var order = (c.people || []).filter(function (id) { return D.members.find(id); });
        ppl.forEach(function (p) { if (order.indexOf(p.userId) < 0) order.push(p.userId); });
        var nowWho = F.chores.assignee(c, todayKey());
        var ov = document.createElement("div");
        ov.className = "eui-overlay";
        ov.innerHTML = '<form class="eui-box eui-form auto-form" novalidate><div class="eui-icon info"><i class="fa-solid fa-rotate"></i></div><h3>' + (isNew ? "New chore" : "Edit chore") + "</h3>" +
            '<label>Chore<input name="title" maxlength="60" value="' + esc(c.title) + '" placeholder="e.g. Take out the bins"></label>' +
            '<fieldset><legend>Which days</legend><div class="day-picks">' + DAYS.map(function (d, i) {
                return '<label><input type="checkbox" name="day" value="' + i + '"' + ((c.days || []).indexOf(i) > -1 ? " checked" : "") + "> " + d + "</label>";
            }).join("") + "</div></fieldset>" +
            '<label>Time<input type="time" name="time" value="' + esc(c.time || "09:00") + '"></label>' +
            '<label>Points (1 to 10)<input type="number" name="points" min="1" max="10" step="1" value="' + esc(c.points || 2) + '"></label>' +
            '<fieldset><legend>Who takes turns (use the arrows to set the order)</legend><div class="dev-picks rot-picks">' + order.map(function (id) {
                var p = D.members.find(id);
                return '<div class="rot-row" data-id="' + esc(id) + '"><label><input type="checkbox" name="who" value="' + esc(id) + '"' + ((c.people || []).indexOf(id) > -1 ? " checked" : "") + "> " + esc(p.isMe ? p.name + " (you)" : p.name) + "</label>" +
                    '<span><button type="button" class="icon-act" data-move="-1" aria-label="Move up"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="icon-act" data-move="1" aria-label="Move down"><i class="fa-solid fa-arrow-down"></i></button></span></div>';
            }).join("") + "</div></fieldset>" +
            '<label>Whose turn is it this week?<select name="startWho"></select></label>' +
            (isNew ? "" : '<label>Status<select name="on"><option value="on">Active</option><option value="off">Paused</option></select></label>') +
            '<p class="eui-err" aria-live="assertive"></p><div class="eui-actions">' + (isNew ? "" : '<button type="button" class="eui-btn danger" data-del>Delete</button>') +
            '<button type="button" class="eui-btn ghost" data-close>Cancel</button><button type="submit" class="eui-btn primary">Save</button></div></form>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        var f = ov.querySelector("form"), box = f.querySelector(".rot-picks");
        if (!isNew) f.on.value = c.on === false ? "off" : "on";
        function picked() { return Array.prototype.map.call(box.querySelectorAll(".rot-row"), function (r) { return r.querySelector("input").checked ? r.dataset.id : null; }).filter(Boolean); }
        function fillWho() {
            var cur = f.startWho.value || nowWho, list = picked();
            f.startWho.innerHTML = list.map(function (id) { var p = D.members.find(id); return '<option value="' + esc(id) + '">' + esc(p.isMe ? p.name + " (you)" : p.name) + "</option>"; }).join("");
            if (list.indexOf(cur) > -1) f.startWho.value = cur;
        }
        fillWho();
        box.addEventListener("change", fillWho);
        box.addEventListener("click", function (e) {
            var b = e.target.closest("[data-move]"); if (!b) return;
            var row = b.closest(".rot-row"), dir = Number(b.dataset.move);
            if (dir < 0 && row.previousElementSibling) box.insertBefore(row, row.previousElementSibling);
            if (dir > 0 && row.nextElementSibling) box.insertBefore(row.nextElementSibling, row);
            fillWho();
        });
        f.title.focus();
        function close() { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); }
        ov.addEventListener("click", function (e) {
            if (e.target === ov || e.target.closest("[data-close]")) close();
            if (e.target.closest("[data-del]")) UI.confirm({ title: "Delete “" + c.title + "”?", message: "It stops rotating. Chore tasks already done stay (with their points); upcoming ones nobody started are removed.", confirmText: "Delete chore" }).then(function (ok) {
                if (!ok) return;
                F.chores.save(F.chores.all().filter(function (x) { return x.id !== c.id; }));
                F.chores.resetFuture(c.id);
                D.log("deleted chore “" + c.title + "”", "fa-trash"); close(); render(); renderChores(); renderCalendar();
            });
        });
        ov.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            var title = f.title.value.trim().replace(/\s+/g, " "), days = Array.prototype.map.call(f.querySelectorAll('[name="day"]:checked'), function (x) { return Number(x.value); });
            var time = f.time.value, pts = Number(f.points.value), who = picked(), start = f.startWho.value;
            var err = title.length < 2 || title.length > 60 || /[<>]/.test(title) || !/[a-z]/i.test(title) ? ["title", "Name the chore (2 to 60 characters)."]
                : !days.length ? [null, "Tick at least one day."]
                : !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? ["time", "Choose a time."]
                : !Number.isInteger(pts) || pts < 1 || pts > 10 ? ["points", "Points must be a whole number from 1 to 10."]
                : !who.length ? [null, "Tick at least one person."]
                : F.chores.all().some(function (x) { return x.id !== c.id && x.title.toLowerCase() === title.toLowerCase(); }) ? ["title", "There's already a chore with that name."] : null;
            f.querySelectorAll(".invalid").forEach(function (x) { x.classList.remove("invalid"); });
            if (err) { f.querySelector(".eui-err").textContent = err[1]; if (err[0]) { f[err[0]].classList.add("invalid"); f[err[0]].focus(); } return; }
            // rotate the list so the chosen person has this week; everyone after them follows in order
            var idx = Math.max(0, who.indexOf(start));
            var startKey = F.util.mondayOf(todayKey());
            var rotated = who.slice(idx).concat(who.slice(0, idx));
            var list = F.chores.all(), m = me(), item = Object.assign({}, c, { title: title, days: days.sort(), time: time, points: pts, people: rotated, start: startKey,
                on: isNew ? true : f.on.value === "on", updatedAt: Date.now() });
            if (isNew) { item.createdBy = m.id; item.createdAt = Date.now(); list.push(item); }
            else list = list.map(function (x) { return x.id === c.id ? item : x; });
            F.chores.save(list.slice(0, 40));
            if (!isNew) F.chores.resetFuture(c.id);
            var made = F.chores.ensure();
            D.log((isNew ? "added chore “" : "changed chore “") + title + "”", "fa-rotate");
            var first = D.members.find(rotated[0]);
            if (isNew && first && first.userId !== m.id) D.notify({ to: [first.userId], kind: "tasks", title: "New chore for you", body: m.first + " added “" + title + "”. It's your turn this week.", href: "dashboard-tasks.html" });
            UI.toast(title + " saved" + (made ? ": " + made + " task" + (made === 1 ? "" : "s") + " added for the coming days." : "."));
            close(); render(); renderChores(); renderCalendar();
        });
    }
    if ($("#addChoreBtn")) $("#addChoreBtn").addEventListener("click", function () { openChore(null); });
    if ($("#choreList")) $("#choreList").addEventListener("click", function (e) {
        var b = e.target.closest("[data-chore]"); if (!b || !canEdit()) return;
        var c = F.chores.all().filter(function (x) { return x.id === b.closest("[data-id]").dataset.id; })[0];
        if (c) openChore(c);
    });

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
            UI.confirm({ title: "Delete this task?", message: "“" + t.title + "” will be permanently removed for everyone." + (t.choreId ? " The chore carries on next time; only this day is skipped." : ""), confirmText: "Delete task" })
                .then(function (ok) {
                    if (!ok) return;
                    D.tasks.save(tasks().filter(function (x) { return String(x.id) !== id; }));
                    if (t.choreId && F) F.chores.skip(t.choreId, t.date);           // don't make it again
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
