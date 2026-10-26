/* ==========================================================
                ELARA TASKS PAGE
   (theme + logout are handled by elara-common.js)
========================================================== */
(function () {
    "use strict";

    var STORAGE_KEY = "elaraTasks";
    var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    function $(sel, root) { return (root || document).querySelector(sel); }
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function toKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    var now = new Date();
    var todayKey = toKey(now);
    var tomorrowKey = toKey(addDays(now, 1));

    /* ---------- data ---------- */
    var seq = 0;
    function mk(title, description, priority, assignee, date, time, status, progress) {
        return { id: Date.now() + (seq++), title: title, description: description, priority: priority,
                 assignee: assignee, date: date, time: time, status: status, progress: progress };
    }
    function load() {
        try {
            var s = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (Array.isArray(s)) return s;
        } catch (e) { /* ignore */ }
        return [
            mk("Clean Kitchen", "Deep clean the kitchen and sanitize all surfaces.", "High", "Justin", todayKey, "17:00", "In Progress", 65),
            mk("Buy Groceries", "Purchase milk, bread, eggs and vegetables.", "Medium", "Sarah", tomorrowKey, "10:00", "Pending", 25),
            mk("Laundry", "Wash, dry and fold all clothes.", "Low", "James", todayKey, "09:00", "Completed", 100),
            mk("Wash Car", "Wash and vacuum the car.", "Low", "Justin", toKey(addDays(now, 2)), "14:00", "Pending", 0),
            mk("Pay Electricity Bill", "Pay the municipal account before it is cut off.", "High", "Justin", toKey(addDays(now, -1)), "12:00", "Pending", 0)
        ];
    }
    var D = window.ElaraData;
    var me = (D && D.user && D.user.first) || localStorage.getItem("elaraFirstName") || "Justin";
    var tasks = D ? D.tasks.all() : load();
    function save() { if (D) D.tasks.save(tasks); else { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (e) { /* ignore */ } } }
    function shared(text, icon) { if (D) D.log(text, icon); }

    var tab = "All", priorityFilter = "All Priorities", sortBy = "Sort By", query = "", editingId = null;

    function isOverdue(t) {
        return t.status !== "Completed" && (t.date + " " + t.time) < (todayKey + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()));
    }
    function dueLabel(t) {
        var d = t.date === todayKey ? "Today" : t.date === tomorrowKey ? "Tomorrow"
              : DAYS[new Date(t.date + "T00:00").getDay()] + " " + t.date.slice(8) + " " + MONTHS[+t.date.slice(5, 7) - 1].slice(0, 3);
        return d + " • " + t.time;
    }
    var PRI = { High: ["high", "high-priority", "High Priority"], Medium: ["medium", "medium-priority", "Medium"], Low: ["low", "low-priority", "Low"] };
    var STAT = { "In Progress": "in-progress", "Pending": "pending", "Completed": "completed" };

    /* ---------- toast ---------- */
    function toast(msg, type) {
        var box = document.getElementById("toastContainer");
        if (!box) { box = document.createElement("div"); box.id = "toastContainer"; document.body.appendChild(box); }
        var el = document.createElement("div");
        el.className = "toast " + (type || "success");
        el.innerHTML = '<i class="fa-solid ' + (type === "error" ? "fa-circle-exclamation" : "fa-circle-check") + '"></i><span>' + esc(msg) + "</span>";
        box.appendChild(el);
        requestAnimationFrame(function () { el.classList.add("show"); });
        setTimeout(function () { el.classList.remove("show"); setTimeout(function () { el.remove(); }, 350); }, 3000);
    }

    /* ---------- activity ---------- */
    function logActivity(text, icon) {
        var panel = $(".recent-panel");
        if (!panel) return;
        var item = document.createElement("div");
        item.className = "activity-item";
        item.innerHTML = '<i class="fa-solid ' + icon + '"></i>' + esc(text) + "<span>Just now</span>";
        var header = panel.querySelector(".panel-header");
        header.insertAdjacentElement("afterend", item);
        var items = panel.querySelectorAll(".activity-item");
        for (var i = 6; i < items.length; i++) items[i].remove();
    }

    /* ---------- filtering ---------- */
    function visibleTasks() {
        var list = tasks.filter(function (t) {
            if (priorityFilter !== "All Priorities" && t.priority !== priorityFilter) return false;
            if (query && (t.title + " " + t.description + " " + t.assignee).toLowerCase().indexOf(query) === -1) return false;
            if (tab === "Today") return t.date === todayKey && t.status !== "Completed";
            if (tab === "Upcoming") return t.date > todayKey && t.status !== "Completed";
            if (tab === "Completed") return t.status === "Completed";
            if (tab === "Overdue") return isOverdue(t);
            return true;
        });
        var rank = { High: 0, Medium: 1, Low: 2 };
        if (sortBy === "Due Date") list.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
        else if (sortBy === "Priority") list.sort(function (a, b) { return rank[a.priority] - rank[b.priority]; });
        else if (sortBy === "Newest") list.sort(function (a, b) { return b.id - a.id; });
        return list;
    }

    /* ---------- render ---------- */
    function cardHTML(t) {
        var p = PRI[t.priority] || PRI.Medium;
        var done = t.status === "Completed";
        var overdue = isOverdue(t);
        return '' +
        '<div class="task-card ' + p[0] + '" data-id="' + t.id + '">' +
            '<div class="task-top">' +
                '<span class="priority ' + p[1] + '">' + p[2] + '</span>' +
                '<span class="status ' + (overdue ? "pending" : STAT[t.status]) + '">' + (overdue ? "Overdue" : esc(t.status)) + '</span>' +
            '</div>' +
            '<h3>' + esc(t.title) + '</h3>' +
            '<p>' + esc(t.description) + '</p>' +
            '<div class="task-details">' +
                '<span><i class="fa-solid fa-user"></i> ' + esc(t.assignee) + '</span>' +
                '<span><i class="fa-solid ' + (done ? "fa-circle-check" : "fa-clock") + '"></i> ' + (done ? "Finished" : esc(dueLabel(t))) + '</span>' +
            '</div>' +
            '<div class="task-progress"><div class="progress-bar"><div class="progress-fill" style="width:' + t.progress + '%;"></div></div><span>' + t.progress + '%</span></div>' +
            '<div class="task-buttons">' +
                '<button class="btn-complete" data-action="toggle">' + (done ? "Reopen" : "Complete") + '</button>' +
                '<button class="btn-edit" data-action="edit">Edit</button>' +
                '<button class="btn-edit" data-action="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>' +
            '</div>' +
        '</div>';
    }

    function render() {
        var left = $(".tasks-left");
        var list = visibleTasks();
        left.innerHTML = list.length ? list.map(cardHTML).join("")
            : '<div class="task-empty"><i class="fa-solid fa-clipboard-check"></i><h3>No tasks here</h3><p>Nothing matches this view. Try another tab or add a task.</p></div>';

        // stats
        var total = tasks.length;
        var completed = tasks.filter(function (t) { return t.status === "Completed"; }).length;
        var inProg = tasks.filter(function (t) { return t.status === "In Progress"; }).length;
        var overdue = tasks.filter(isOverdue).length;
        var dueToday = tasks.filter(function (t) { return t.date === todayKey && t.status !== "Completed"; }).length;
        function set(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
        set("taskCount", total); set("shoppingCount", completed); set("deviceCount", inProg); set("energyCount", overdue);
        var sub = $("#taskCount").parentNode.querySelector("p");
        if (sub) sub.textContent = dueToday + " due today";

        // overall progress circle
        var pct = total ? Math.round(completed / total * 100) : 0;
        var circle = $(".circle");
        if (circle) {
            circle.style.background = "conic-gradient(#6C63FF " + pct + "%, rgba(255,255,255,.08) 0)";
            circle.querySelector("span").textContent = pct + "%";
        }

        // upcoming deadlines
        var panels = document.querySelectorAll(".tasks-right .panel");
        var dl = panels[2];
        if (dl) {
            dl.querySelectorAll(".deadline").forEach(function (d) { d.remove(); });
            var next = tasks.filter(function (t) { return t.status !== "Completed"; })
                .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).slice(0, 4);
            dl.insertAdjacentHTML("beforeend", next.length ? next.map(function (t) {
                return '<div class="deadline"><strong>' + esc(t.title) + '</strong><small>' + esc(dueLabel(t)) + '</small></div>';
            }).join("") : '<div class="deadline"><strong>All caught up</strong><small>No open tasks</small></div>');
        }
    }

    function renderCalendar() {
        var box = $(".calendar-box");
        if (!box) return;
        box.querySelector("h3").textContent = MONTHS[now.getMonth()] + " " + now.getFullYear();
        var start = addDays(now, -now.getDay()), html = "";
        for (var i = 0; i < 7; i++) {
            var d = addDays(start, i);
            html += '<span' + (toKey(d) === todayKey ? ' class="active-day"' : "") + ' title="' + DAYS[d.getDay()] + '">' + d.getDate() + "</span>";
        }
        box.querySelector(".calendar-grid").innerHTML = html;
    }

    /* ---------- modal ---------- */
    var modal;
    function buildModal() {
        modal = document.createElement("div");
        modal.id = "taskModal";
        modal.className = "task-modal";
        modal.innerHTML =
        '<div class="task-modal-box">' +
            '<div class="task-modal-head"><h2 id="taskModalTitle">Add Task</h2><button type="button" id="taskModalClose" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<form id="taskForm" novalidate>' +
                '<label>Title<input id="tTitle" type="text" placeholder="e.g. Service the geyser" required></label>' +
                '<label>Description<textarea id="tDesc" rows="3" placeholder="Optional details"></textarea></label>' +
                '<div class="row2">' +
                    '<label>Priority<select id="tPriority"><option>High</option><option selected>Medium</option><option>Low</option></select></label>' +
                    '<label>Assigned to<input id="tAssignee" type="text" value="' + esc(me) + '"></label>' +
                '</div>' +
                '<div class="row2">' +
                    '<label>Due date<input id="tDate" type="date" required></label>' +
                    '<label>Time<input id="tTime" type="time" value="09:00" required></label>' +
                '</div>' +
                '<div class="row2">' +
                    '<label>Status<select id="tStatus"><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>' +
                    '<label>Progress (%)<input id="tProgress" type="number" min="0" max="100" value="0"></label>' +
                '</div>' +
                '<div class="task-modal-actions"><button type="button" id="taskCancel" class="btn-edit">Cancel</button><button type="submit" class="btn-complete">Save Task</button></div>' +
            '</form>' +
        '</div>';
        document.body.appendChild(modal);

        modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
        document.getElementById("taskModalClose").addEventListener("click", closeModal);
        document.getElementById("taskCancel").addEventListener("click", closeModal);
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
        document.getElementById("taskForm").addEventListener("submit", onSubmit);
        document.getElementById("tStatus").addEventListener("change", function () {
            if (this.value === "Completed") document.getElementById("tProgress").value = 100;
        });
    }
    function openModal(t) {
        editingId = t ? t.id : null;
        document.getElementById("taskModalTitle").textContent = t ? "Edit Task" : "Add Task";
        document.getElementById("tTitle").value = t ? t.title : "";
        document.getElementById("tDesc").value = t ? t.description : "";
        document.getElementById("tPriority").value = t ? t.priority : "Medium";
        document.getElementById("tAssignee").value = t ? t.assignee : me;
        document.getElementById("tDate").value = t ? t.date : todayKey;
        document.getElementById("tTime").value = t ? t.time : "09:00";
        document.getElementById("tStatus").value = t ? t.status : "Pending";
        document.getElementById("tProgress").value = t ? t.progress : 0;
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
        setTimeout(function () { document.getElementById("tTitle").focus(); }, 50);
    }
    function closeModal() { modal.classList.remove("active"); document.body.style.overflow = ""; editingId = null; }

    function onSubmit(e) {
        e.preventDefault();
        var title = document.getElementById("tTitle").value.trim();
        var date = document.getElementById("tDate").value;
        var time = document.getElementById("tTime").value;
        if (!title || !date || !time) { toast("Please enter a title, date and time.", "error"); return; }
        var status = document.getElementById("tStatus").value;
        var progress = Math.max(0, Math.min(100, parseInt(document.getElementById("tProgress").value, 10) || 0));
        if (status === "Completed") progress = 100;
        var data = {
            title: title, description: document.getElementById("tDesc").value.trim() || "No description.",
            priority: document.getElementById("tPriority").value, assignee: document.getElementById("tAssignee").value.trim() || "Unassigned",
            date: date, time: time, status: status, progress: progress
        };
        if (editingId !== null) {
            tasks.forEach(function (t) { if (t.id === editingId) for (var k in data) t[k] = data[k]; });
            logActivity(title + " updated", "fa-pen"); shared("updated task \u201c" + title + "\u201d", "fa-pen"); toast("Task updated.");
        } else {
            tasks.unshift(mk(data.title, data.description, data.priority, data.assignee, data.date, data.time, data.status, data.progress));
            logActivity(title + " added", "fa-plus"); shared("added task \u201c" + title + "\u201d", "fa-list-check"); toast("Task added.");
        }
        save(); closeModal(); render();
    }

    /* ---------- events ---------- */
    buildModal();

    $(".add-task").addEventListener("click", function () { openModal(null); });

    $(".tasks-left").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-action]");
        if (!btn) return;
        var id = Number(btn.closest(".task-card").dataset.id);
        var t = tasks.filter(function (x) { return x.id === id; })[0];
        if (!t) return;
        if (btn.dataset.action === "edit") openModal(t);
        else if (btn.dataset.action === "toggle") {
            if (t.status === "Completed") { t.status = "Pending"; t.progress = 0; logActivity(t.title + " reopened", "fa-rotate-left"); shared("reopened task \u201c" + t.title + "\u201d", "fa-rotate-left"); toast("Task reopened."); }
            else { t.status = "Completed"; t.progress = 100; logActivity(t.title + " completed", "fa-circle-check"); shared("completed \u201c" + t.title + "\u201d", "fa-circle-check"); toast("Task completed. Nice work!"); }
            save(); render();
        } else if (btn.dataset.action === "delete") {
            ElaraUI.confirm({
                title: "Delete this task?",
                message: "\u201c" + t.title + "\u201d will be permanently removed from your list.",
                confirmText: "Delete task"
            }).then(function (ok) {
                if (!ok) return;
                tasks = tasks.filter(function (x) { return x.id !== id; });
                logActivity(t.title + " deleted", "fa-trash"); shared("deleted task \u201c" + t.title + "\u201d", "fa-trash");
                save(); render(); toast("Task deleted.");
            });
        }
    });

    document.querySelectorAll(".task-tabs button").forEach(function (b) {
        b.addEventListener("click", function () {
            document.querySelectorAll(".task-tabs button").forEach(function (x) { x.classList.remove("active"); });
            b.classList.add("active"); tab = b.textContent.trim(); render();
        });
    });

    var selects = document.querySelectorAll(".task-controls select");
    selects[0].addEventListener("change", function () { priorityFilter = this.value; render(); });
    selects[1].addEventListener("change", function () { sortBy = this.value; render(); });

    var boxes = [$(".task-search input"), $(".top-actions .search input")];
    boxes.forEach(function (box) {
        if (!box) return;
        box.addEventListener("input", function () {
            query = box.value.toLowerCase().trim();
            boxes.forEach(function (o) { if (o && o !== box) o.value = box.value; });
            render();
        });
    });

    var bell = $(".top-actions button:not(#themeBtn)");
    if (bell) bell.addEventListener("click", function () {
        var o = tasks.filter(isOverdue).length, d = tasks.filter(function (t) { return t.date === todayKey && t.status !== "Completed"; }).length;
        toast(o + " overdue, " + d + " due today.", o ? "error" : "success");
    });

    renderCalendar();
    render();
})();
