/* ==========================================================
            ELARA SCHEDULE
   - events with validation; who is involved gets notified
   - busy / away / available for every member on every day (changeable)
   - adding an event on a day someone is busy or away notifies them
   - Sync Calendar imports from a calendar file or private iCal link,
     only ADDING events (never removing existing ones)
   (theme, logout, dialogs: elara-common.js)
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI, cfg = window.ELARA_CONFIG || {};
    if (!D) return;
    window.ElaraPageLive = true;

    var STORAGE_KEY = "elaraSchedules";
    var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    var ICONS = { Personal: "fa-user", Household: "fa-house", Shopping: "fa-cart-shopping", Maintenance: "fa-wrench", "Smart Home": "fa-lightbulb", Imported: "fa-calendar-plus" };
    var STATES = ["available", "busy", "away"];

    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function toKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function fromKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function startOfWeek(d) { return addDays(d, -d.getDay()); }
    function prettyDate(key) { var d = fromKey(key); return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function $(id) { return document.getElementById(id); }
    function todayKey() { return toKey(new Date()); }
    function nowHM() { var n = new Date(); return pad(n.getHours()) + ":" + pad(n.getMinutes()); }
    function canEdit() { return D.can("schedule", "edit"); }
    function me() { return D.me(); }
    function people() { return D.members.active(); }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    /* ---------- state ---------- */
    var urlDate = (location.search.match(/[?&]date=(\d{4}-\d{2}-\d{2})/) || [])[1];
    var selectedKey = urlDate || todayKey();
    var viewYear = fromKey(selectedKey).getFullYear(), viewMonth = fromKey(selectedKey).getMonth();
    var weekStart = startOfWeek(fromKey(selectedKey));
    var viewMode = "Day", categoryFilter = "", searchTerm = "", showAll = false, editingId = null;

    function events() {
        var list = D.util.load(STORAGE_KEY, null);
        if (list) return list;
        if (!D.demo) return [];
        var t = new Date(), mk = function (title, cat, date, time, desc) { return { id: Date.now() + Math.floor(Math.random() * 1e5), title: title, category: cat, date: date, time: time, description: desc, createdBy: "demo-1", createdByName: "Justin" }; };
        list = [mk("Morning Routine", "Household", toKey(t), "07:00", "Kitchen • Coffee • Breakfast"), mk("Pick Up Groceries", "Shopping", toKey(t), "13:00", "Checkers Hyper"),
                mk("Water Plants", "Household", toKey(addDays(t, 1)), "08:00", "Garden"), mk("Vehicle Service", "Maintenance", toKey(addDays(t, 3)), "09:30", "Book maintenance appointment")];
        D.util.save(STORAGE_KEY, list);
        return list;
    }
    function saveEvents(list) { D.util.save(STORAGE_KEY, list); }
    function matchesCategory(ev) { return !categoryFilter || ev.category === categoryFilter; }
    function eventsOn(key) { return events().filter(function (e) { return e.date === key && matchesCategory(e); }).sort(function (a, b) { return a.time.localeCompare(b.time); }); }
    function shared(text, icon) { D.log(text, icon); }

    /* ---------- who may change whose status ---------- */
    /* everyone sets only their OWN status, and only for today or later */
    function canSetStatus(uid, date) { return uid === me().id && (!date || date >= todayKey()); }
    function stateOf(date, uid) {
        var pres = D.presence.all()[uid];
        if (date === todayKey() && pres && pres.state === "away" && D.availability.on(date, uid) === "available") return "away";
        return D.availability.on(date, uid);
    }
    function setStatus(date, person, state) {
        if (person.userId !== me().id) return UI.toast("Only " + person.name + " can change their own status.", "error");
        if (date < todayKey()) return UI.toast("That day has already passed.", "error");
        D.availability.set(date, person.userId, state);
        shared((person.isMe ? "is now " : "marked " + person.name + " as ") + state + " on " + prettyDate(date), "fa-user-clock");
        if (!person.isMe) D.notify({ to: [person.userId], kind: "schedule", title: "Your status was changed", body: me().first + " marked you as " + state + " on " + prettyDate(date) + ".", href: "dashboard-schedule.html?date=" + date });
        // tell the person if there are already events that day while they're busy/away
        refresh();
    }

    /* ---------- calendar ---------- */
    function renderCalendar() {
        var grid = $("calendarDates"); if (!grid) return;
        $("calendarMonth").textContent = MONTHS[viewMonth] + " " + viewYear;
        var first = new Date(viewYear, viewMonth, 1), gridStart = addDays(first, -first.getDay()), html = "", ppl = people();
        for (var i = 0; i < 42; i++) {
            var d = addDays(gridStart, i), key = toKey(d), cls = [];
            if (d.getMonth() !== viewMonth) cls.push("inactive");
            if (key === todayKey()) cls.push("today");
            if (key === selectedKey) cls.push("selected");
            var n = eventsOn(key).length; if (n) cls.push("event-day");
            var dots = ppl.filter(function (p) { return stateOf(key, p.userId) !== "available"; }).slice(0, 4).map(function (p) {
                return '<b class="sdot ' + stateOf(key, p.userId) + '" title="' + esc(p.name + ": " + stateOf(key, p.userId)) + '"></b>';
            }).join("");
            html += '<span class="' + cls.join(" ") + '" data-date="' + key + '" role="button" tabindex="0" aria-label="' + esc(prettyDate(key) + (n ? ", " + n + " event(s)" : "")) + '">' + d.getDate() + (dots ? '<em class="sdots">' + dots + "</em>" : "") + "</span>";
        }
        grid.innerHTML = html;
    }

    /* ---------- agenda ---------- */
    function agendaItemHTML(ev, showDate) {
        var icon = ICONS[ev.category] || "fa-calendar", who = (ev.involves || []).map(function (id) { var p = D.members.find(id); return p ? p.name : null; }).filter(Boolean);
        return '<div class="agenda-item" data-id="' + esc(ev.id) + '"><div class="agenda-left"><div class="agenda-icon"><i class="fa-solid ' + icon + '"></i></div>' +
            '<div class="agenda-text"><h4>' + esc(ev.title) + "</h4><p>" + (showDate ? esc(prettyDate(ev.date)) + " • " : "") + esc(ev.description || ev.category) + "</p>" +
            (who.length ? '<p class="agenda-who"><i class="fa-solid fa-user-group"></i> ' + esc(who.join(", ")) + "</p>" : "") +
            (ev.createdByName ? '<p class="agenda-who">Added by ' + esc(ev.createdByName) + (ev.source === "ics" ? " (imported)" : "") + "</p>" : "") + "</div></div>" +
            '<div class="agenda-right"><span class="agenda-time">' + esc(ev.allDay ? "All day" : ev.time) + "</span>" +
            (canEdit() ? '<button type="button" class="agenda-btn" data-action="edit" title="Edit" aria-label="Edit ' + esc(ev.title) + '"><i class="fa-solid fa-pen"></i></button>' +
             '<button type="button" class="agenda-btn" data-action="delete" title="Delete" aria-label="Delete ' + esc(ev.title) + '"><i class="fa-solid fa-trash"></i></button>' : "") + "</div></div>";
    }
    function renderAgenda() {
        var list = $("agendaList"), panel = list.closest(".panel"), h2 = panel.querySelector(".panel-header h2"), sub = panel.querySelector(".panel-subtitle");
        var items, showDate = false, heading, subtitle, all = events();
        if (searchTerm) {
            items = all.filter(function (e) { return matchesCategory(e) && (e.title + " " + (e.description || "") + " " + e.category).toLowerCase().indexOf(searchTerm) > -1; });
            showDate = true; heading = "Search Results"; subtitle = items.length + " event(s) found";
        } else if (showAll || viewMode === "Upcoming") {
            items = all.filter(function (e) { return matchesCategory(e) && e.date >= todayKey(); }).slice(0, 60);
            showDate = true; heading = "Upcoming Events"; subtitle = "Everything coming up";
        } else if (viewMode === "Week") {
            var ws = startOfWeek(fromKey(selectedKey)), we = addDays(ws, 6);
            items = all.filter(function (e) { return matchesCategory(e) && e.date >= toKey(ws) && e.date <= toKey(we); });
            showDate = true; heading = "This Week"; subtitle = prettyDate(toKey(ws)) + " – " + prettyDate(toKey(we));
        } else {
            items = eventsOn(selectedKey);
            heading = selectedKey === todayKey() ? "Today's Agenda" : "Agenda";
            subtitle = selectedKey === todayKey() ? "Your schedule for today" : "Schedule for " + prettyDate(selectedKey);
        }
        items.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
        h2.textContent = heading; sub.textContent = subtitle;
        list.innerHTML = items.length ? items.map(function (e) { return agendaItemHTML(e, showDate); }).join("")
            : '<div class="agenda-empty"><i class="fa-regular fa-calendar"></i><p>No events here yet.' + (canEdit() ? "<br>Click <strong>New Event</strong> to add one." : "") + "</p></div>";
        var viewAll = panel.querySelector(".view-btn"); if (viewAll) viewAll.textContent = showAll ? "Back" : "View All";
    }

    /* ---------- availability: the selected day ---------- */
    function avatarHTML(p) {
        return p.avatar ? '<img src="' + esc(p.avatar) + '" alt="">' : '<div class="avail-avatar">' + esc((p.name || "?").charAt(0).toUpperCase()) + "</div>";
    }
    function renderDayAvailability() {
        var box = $("dayAvailability"), ppl = people(), roles = { owner: "Home Owner", adult: "Adult", member: "Member", guest: "Guest" };
        $("availDayLabel").textContent = (selectedKey === todayKey() ? "Today, " : "") + prettyDate(selectedKey);
        box.innerHTML = ppl.map(function (p) {
            var st = stateOf(selectedKey, p.userId), editable = canSetStatus(p.userId, selectedKey);
            return '<div class="member"><div class="member-info">' + avatarHTML(p) + "<div><h4>" + esc(p.name + (p.isMe ? " (you)" : "")) + "</h4><p>" + esc(roles[p.role] || p.role) + "</p></div></div>" +
                '<div class="status-seg" role="group" aria-label="Status of ' + esc(p.name) + '">' + STATES.map(function (s) {
                    return '<button type="button" class="seg ' + s + (s === st ? " on" : "") + '" data-uid="' + esc(p.userId) + '" data-state="' + s + '" data-date="' + selectedKey + '"' +
                        (editable ? "" : " disabled") + ' aria-pressed="' + (s === st) + '">' + cap(s) + "</button>";
                }).join("") + "</div></div>";
        }).join("") || '<p class="muted">Invite people on the Members page.</p>';
    }

    /* ---------- availability: everyone, every day of the week ---------- */
    function renderWeekGrid() {
        var grid = $("availGrid"), ppl = people(), days = [];
        for (var i = 0; i < 7; i++) days.push(addDays(weekStart, i));
        $("weekLabel").textContent = prettyDate(toKey(days[0])) + " – " + prettyDate(toKey(days[6])) + " • click a status to change it";
        var head = '<div class="ag-row ag-head"><span></span>' + days.map(function (d) {
            var k = toKey(d); return '<button type="button" class="ag-day' + (k === todayKey() ? " today" : "") + (k === selectedKey ? " picked" : "") + '" data-pick="' + k + '">' + DAYS[d.getDay()] + "<small>" + d.getDate() + "</small></button>";
        }).join("") + "</div>";
        grid.innerHTML = head + ppl.map(function (p) {
            return '<div class="ag-row"><span class="ag-name">' + esc(p.isMe ? p.name + " (you)" : p.name) + "</span>" + days.map(function (d) {
                var k = toKey(d), st = stateOf(k, p.userId);
                return '<button type="button" class="ag-cell ' + st + '" data-uid="' + esc(p.userId) + '" data-date="' + k + '" data-cycle="1"' +
                    (canSetStatus(p.userId, k) ? "" : " disabled") + ' title="' + esc(p.name + " • " + prettyDate(k) + ": " + st) + '" aria-label="' + esc(p.name + " " + prettyDate(k) + " " + st) + '">' + st.charAt(0).toUpperCase() + "</button>";
            }).join("") + "</div>";
        }).join("");
    }

    document.addEventListener("click", function (e) {
        var seg = e.target.closest("[data-state][data-uid]");
        if (seg && !seg.disabled) { var p = D.members.find(seg.dataset.uid); if (p) setStatus(seg.dataset.date, p, seg.dataset.state); return; }
        var cell = e.target.closest("[data-cycle]");
        if (cell && !cell.disabled) {
            var person = D.members.find(cell.dataset.uid);
            var cur = stateOf(cell.dataset.date, cell.dataset.uid);
            if (person) setStatus(cell.dataset.date, person, STATES[(STATES.indexOf(cur) + 1) % STATES.length]);
            return;
        }
        var pick = e.target.closest("[data-pick]");
        if (pick) { pickDate(pick.dataset.pick); return; }
        var day = e.target.closest(".week-timeline [data-day]");
        if (day) pickDate(day.dataset.day);
    });
    function pickDate(key) {
        selectedKey = key; var d = fromKey(key);
        viewYear = d.getFullYear(); viewMonth = d.getMonth(); showAll = false; searchTerm = ""; viewMode = viewMode === "Upcoming" ? "Day" : viewMode;
        refresh();
    }

    /* ---------- stats ---------- */
    function renderStats() {
        var all = events(), tk = todayKey();
        $("todayEvents").textContent = all.filter(function (e) { return e.date === tk; }).length;
        var ws = toKey(startOfWeek(new Date())), we = toKey(addDays(startOfWeek(new Date()), 6));
        $("weekEvents").textContent = all.filter(function (e) { return e.date >= ws && e.date <= we; }).length;
        var seen = {};
        function note(title, date) { var k = String(title || "").trim().toLowerCase(); if (k) (seen[k] = seen[k] || {})[date] = 1; }
        all.forEach(function (e) { note(e.title, e.date); });
        if (D.can("tasks")) D.tasks.all().forEach(function (t) { note(t.title, t.date); });
        $("recurringTasks").textContent = Object.keys(seen).filter(function (k) { return Object.keys(seen[k]).length >= 2; }).length;
        var ppl = people(), free = ppl.filter(function (p) { return stateOf(tk, p.userId) === "available"; }).length;
        $("availability").textContent = ppl.length ? free + " of " + ppl.length : "—";
    }

    /* ---------- weekly activity ---------- */
    function renderWeek() {
        var box = document.querySelector(".week-timeline"); if (!box) return;
        var tasks = D.can("tasks") ? D.tasks.all() : [], start = startOfWeek(new Date()), html = "", all = events(), ppl = people();
        for (var i = 0; i < 7; i++) {
            var d = addDays(start, i), key = toKey(d);
            var dayEvents = all.filter(function (e) { return e.date === key; });
            var dayTasks = tasks.filter(function (t) { return t.date === key && t.status !== "Completed"; });
            var busy = ppl.filter(function (p) { return stateOf(key, p.userId) !== "available"; });
            var n = dayEvents.length + dayTasks.length + busy.length;
            var cls = n >= 6 ? "full" : n >= 4 ? "busy" : n >= 2 ? "medium" : "low";
            var names = dayEvents.map(function (e) { return e.time + " " + e.title; }).concat(dayTasks.map(function (t) { return "Task: " + t.title; }), busy.map(function (p) { return p.name + " is " + stateOf(key, p.userId); })).slice(0, 6);
            html += '<div class="day' + (key === todayKey() ? " today" : "") + (key === selectedKey ? " picked" : "") + '" data-day="' + key + '" role="button" tabindex="0">' +
                    "<h4>" + DAYS[d.getDay()] + '</h4><div class="bar ' + cls + '" title="' + esc(n ? names.join("\n") : "Nothing planned") + '"></div><span>' + (n === 0 ? "Free" : n + (n === 1 ? " item" : " items")) + "</span></div>";
        }
        box.innerHTML = html;
    }

    /* ---------- activity + reminders ---------- */
    function loadLog() { return D.util.load("elaraScheduleLog", []); }
    function logActivity(title, subtitle, icon) {
        if (!canEdit()) return;
        var list = loadLog(), m = me();
        list.unshift({ k: D.rid(), t: Date.now(), title: title, sub: subtitle, icon: icon || "fa-calendar-check", who: m.first, by: m.id });
        D.util.save("elaraScheduleLog", list.slice(0, 80));
    }
    function renderRecent() {
        var items = loadLog().slice().sort(function (a, b) { return b.t - a.t; }).slice(0, 5);
        $("activityList").innerHTML = items.length ? items.map(function (a) {
            return '<div class="activity-item"><div class="activity-icon"><i class="fa-solid ' + esc(a.icon) + '"></i></div><div class="activity-info"><h4>' + esc(a.title) + "</h4><p>" + esc((a.who ? a.who + " • " : "") + a.sub) + "</p></div><span>" + esc(D.ago(a.t)) + "</span></div>";
        }).join("") : '<div class="activity-empty"><i class="fa-regular fa-clock"></i><p>No changes yet. When anyone adds, moves or deletes events they’ll be listed here.</p></div>';
    }
    function friendlyDay(key, time) {
        var d = fromKey(key), diff = Math.round((d - fromKey(todayKey())) / 86400000);
        var base = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff > 1 && diff < 7 ? DAYS[d.getDay()] : d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3);
        return time && diff <= 1 ? base + " • " + time : base;
    }
    function renderReminders() {
        var box = $("reminderList"); box.className = "reminder-list";
        var now = new Date(), nowKey = toKey(now), hm = nowHM(), limit = toKey(addDays(now, 14)), items = [];
        events().forEach(function (e) {
            if (e.date < nowKey || e.date > limit) return;
            if (e.date === nowKey && (e.time < hm || e.time > pad(Math.min(23, now.getHours() + 3)) + ":" + pad(now.getMinutes()))) return;
            var bill = /bill|pay|invoice|rent/i.test(e.title);
            items.push({ when: e.date + " " + e.time, title: e.title, sub: e.description || e.category, cls: bill ? "bill" : e.category === "Maintenance" ? "car" : e.category === "Shopping" ? "shopping" : "", icon: bill ? "fa-file-invoice-dollar" : ICONS[e.category] || "fa-calendar", label: friendlyDay(e.date, e.time) });
        });
        if (D.can("tasks")) D.tasks.all().forEach(function (t) {
            if (t.status === "Completed") return;
            var late = (t.date + " " + t.time) < (nowKey + " " + hm);
            if (!late && t.date > limit) return;
            items.push({ when: late ? "0000" : t.date + " " + t.time, title: t.title, sub: "Task • " + (t.assignee || "Unassigned"), cls: late ? "shopping" : "", icon: "fa-list-check", label: late ? "Overdue" : friendlyDay(t.date, t.time), overdue: late });
        });
        if (D.can("shopping")) D.util.load("elaraWarranties", []).forEach(function (w) {
            var days = Math.ceil((new Date(w.expires + "T23:59:59") - now) / 86400000);
            if (days < 0 || days > 45) return;
            items.push({ when: w.expires + " 23:59", title: w.name + " warranty", sub: "Warranty ends soon", cls: "bill", icon: "fa-shield-halved", label: days === 0 ? "Today" : days + (days === 1 ? " day" : " days") });
        });
        items.sort(function (a, b) { return a.when.localeCompare(b.when); });
        box.innerHTML = items.length ? items.slice(0, 5).map(function (r) {
            return '<div class="reminder ' + r.cls + '"><div class="reminder-left"><div class="reminder-icon"><i class="fa-solid ' + r.icon + '"></i></div><div class="reminder-text"><h4>' + esc(r.title) + "</h4><p>" + esc(r.sub) + '</p></div></div><span class="reminder-date' + (r.overdue ? " overdue" : "") + '">' + esc(r.label) + "</span></div>";
        }).join("") : '<div class="reminder-empty"><i class="fa-regular fa-bell"></i><p>Nothing to remind you about. Add an event or a task and it will show up here.</p></div>';
    }

    function refresh() { renderCalendar(); renderAgenda(); renderStats(); renderWeek(); renderDayAvailability(); renderWeekGrid(); renderReminders(); renderRecent(); }

    /* ---------- event modal (validated) ---------- */
    var modal = $("eventModal"), form = $("eventForm");
    function renderPeoplePicks(selected) {
        $("eventPeople").innerHTML = people().map(function (p) {
            return '<label class="pick"><input type="checkbox" value="' + esc(p.userId) + '"' + (selected.indexOf(p.userId) > -1 ? " checked" : "") + "><span>" + esc(p.isMe ? p.name + " (you)" : p.name) + "</span></label>";
        }).join("");
        updateBusyWarning();
    }
    function updateBusyWarning() {
        var date = $("eventDate").value, w = $("busyWarning");
        if (!date) { w.hidden = true; return; }
        var busy = people().filter(function (p) { return !p.isMe && stateOf(date, p.userId) !== "available"; });
        w.hidden = !busy.length;
        w.innerHTML = busy.length ? '<i class="fa-solid fa-triangle-exclamation"></i> ' + esc(busy.map(function (p) { return p.name + " is " + stateOf(date, p.userId); }).join(", ")) + " that day. They'll be notified." : "";
    }
    function openModal(ev) {
        if (!canEdit()) return UI.toast("You can view the schedule but not change it.", "error");
        editingId = ev ? ev.id : null;
        form.reset();
        $("eventError").textContent = "";
        $("eventTitle").value = ev ? ev.title : "";
        $("eventCategory").value = ev ? (ev.category === "Imported" ? "Personal" : ev.category) : "Personal";
        $("eventDate").value = ev ? ev.date : (selectedKey < todayKey() ? todayKey() : selectedKey);
        $("eventDate").min = ev && ev.date < todayKey() ? ev.date : todayKey();
        $("eventDate").max = toKey(addDays(new Date(), 5 * 365));
        $("eventTime").value = ev ? ev.time : "09:00";
        $("eventDescription").value = ev ? ev.description || "" : "";
        $("eventRepeat").value = ""; $("eventRepeat").disabled = !!ev;
        renderPeoplePicks(ev ? ev.involves || [] : [me().id]);
        showErrors([]);
        $("eventModalTitle").textContent = ev ? "Edit Event" : "Add New Event";
        modal.classList.add("active"); document.body.style.overflow = "hidden";
        setTimeout(function () { $("eventTitle").focus(); }, 50);
    }
    function closeModal() { modal.classList.remove("active"); document.body.style.overflow = ""; editingId = null; }
    ["addEventBtn", "fabButton"].forEach(function (id) { $(id).addEventListener("click", function () { openModal(null); }); });
    ["closeModal", "cancelEvent"].forEach(function (id) { $(id).addEventListener("click", closeModal); });
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(); closeSync(); } });
    $("eventDate").addEventListener("change", updateBusyWarning);

    /* every field is checked; returns [{ field, msg }] */
    function validateEvent(v, before) {
        var errs = [], now = todayKey() + " " + nowHM();
        function bad(field, msg) { errs.push({ field: field, msg: msg }); }
        if (v.title.length < 2 || v.title.length > 80) bad("eventTitle", "Give the event a name of 2 to 80 characters.");
        else if (!/[a-z0-9]/i.test(v.title) || /[<>]/.test(v.title)) bad("eventTitle", "The name needs letters or numbers, and no < or >.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || isNaN(fromKey(v.date).getTime())) bad("eventDate", "Choose the date.");
        else if (v.date < todayKey() && (!before || before.date !== v.date)) bad("eventDate", "That day has already passed. Choose today or a later day.");
        else if (v.date > toKey(addDays(new Date(), 5 * 365))) bad("eventDate", "Choose a date within the next 5 years.");
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) bad("eventTime", "Choose the start time.");
        else if (/^\d{4}-\d{2}-\d{2}$/.test(v.date) && v.date === todayKey() && (v.date + " " + v.time) < now && (!before || before.date !== v.date || before.time !== v.time)) bad("eventTime", "That time has already passed today. Choose a later time.");
        if (!v.involves.length) bad("eventPeople", "Tick who the event is for (at least one person).");
        else {
            var active = people().map(function (p) { return p.userId; });
            if (v.involves.some(function (id) { return active.indexOf(id) < 0; })) bad("eventPeople", "Someone you ticked is no longer in the home.");
        }
        if (["Personal", "Household", "Shopping", "Maintenance", "Smart Home"].indexOf(v.category) < 0) bad("eventCategory", "Choose a category.");
        if (v.description.length > 500) bad("eventDescription", "The description can be at most 500 characters.");
        if (!errs.length) {
            var clash = events().filter(function (e) { return e.id !== editingId && e.date === v.date && e.time === v.time && e.title.toLowerCase() === v.title.toLowerCase(); });
            if (clash.length) bad("eventTitle", "That event is already on the calendar at that time.");
        }
        return errs;
    }
    function showErrors(errs) {
        ["eventTitle", "eventDate", "eventTime", "eventPeople", "eventCategory", "eventDescription"].forEach(function (id) { $(id).classList.remove("invalid"); $(id).removeAttribute("aria-invalid"); });
        errs.forEach(function (e) { $(e.field).classList.add("invalid"); $(e.field).setAttribute("aria-invalid", "true"); });
        $("eventError").innerHTML = errs.map(function (e) { return "\u2022 " + esc(e.msg); }).join("<br>");
        if (errs.length) { var f = $(errs[0].field); (f.querySelector ? f.querySelector("input") || f : f).focus(); }
    }
    ["eventTitle", "eventDate", "eventTime", "eventDescription"].forEach(function (id) { $(id).addEventListener("input", function () { this.classList.remove("invalid"); }); });
    $("eventPeople").addEventListener("change", function () { this.classList.remove("invalid"); });

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        var v = { title: $("eventTitle").value.trim(), category: $("eventCategory").value, date: $("eventDate").value, time: $("eventTime").value,
                  description: $("eventDescription").value.trim(), repeat: $("eventRepeat").value,
                  involves: Array.prototype.map.call($("eventPeople").querySelectorAll("input:checked"), function (x) { return x.value; }) };
        var before = editingId !== null ? events().filter(function (x) { return x.id === editingId; })[0] : null;
        var errs = validateEvent(v, before);
        showErrors(errs);
        if (errs.length) return;
        var list = events(), m = me();
        if (editingId !== null) {
            var before = list.filter(function (x) { return x.id === editingId; })[0];
            if (!before) { $("eventError").textContent = "That event was deleted by someone else."; return; }
            var moved = before.date !== v.date || before.time !== v.time;
            var newPeople = v.involves.filter(function (id) { return (before.involves || []).indexOf(id) === -1; });
            Object.assign(before, { title: v.title, category: v.category, date: v.date, time: v.time, description: v.description, involves: v.involves, updatedBy: m.id, updatedAt: Date.now() });
            saveEvents(list);
            logActivity(v.title + (moved ? " rescheduled" : " updated"), prettyDate(v.date) + " • " + v.time, moved ? "fa-arrows-rotate" : "fa-pen");
            shared((moved ? "rescheduled “" : "updated event “") + v.title + "”", moved ? "fa-arrows-rotate" : "fa-pen");
            notifyForEvent(before, moved ? "moved" : "updated", newPeople);
            UI.toast("Event updated.");
        } else {
            var dates = [v.date];
            if (v.repeat) {
                var n = v.repeat === "daily" ? 14 : v.repeat === "weekly" ? 13 : 12, d0 = fromKey(v.date);
                for (var i = 1; i < n; i++) { var d = v.repeat === "daily" ? addDays(d0, i) : v.repeat === "weekly" ? addDays(d0, 7 * i) : new Date(d0.getFullYear(), d0.getMonth() + i, d0.getDate()); dates.push(toKey(d)); }
            }
            var series = dates.length > 1 ? "s" + Date.now() : undefined, first = null;
            dates.forEach(function (date, idx) {
                var ev = { id: Date.now() + idx, title: v.title, category: v.category, date: date, time: v.time, description: v.description, involves: v.involves,
                           createdBy: m.id, createdByName: m.first, createdAt: Date.now(), series: series };
                list.push(ev); if (!first) first = ev;
            });
            saveEvents(list);
            logActivity(v.title + " added", prettyDate(v.date) + " • " + v.time + (dates.length > 1 ? " (" + dates.length + " times)" : ""), "fa-calendar-check");
            shared("scheduled “" + v.title + "” for " + prettyDate(v.date) + (dates.length > 1 ? " (repeats)" : ""), "fa-calendar-check");
            notifyForEvent(first, "added", v.involves);
            UI.toast(dates.length > 1 ? "Event added " + dates.length + " times." : "Event added.");
        }
        var d1 = fromKey(v.date);
        viewYear = d1.getFullYear(); viewMonth = d1.getMonth(); selectedKey = v.date; weekStart = startOfWeek(d1);
        showAll = false; searchTerm = ""; $("eventSearch").value = ""; $("searchEvents").value = "";
        closeModal(); refresh();
    });

    /* who to tell: people busy/away that day get a personal warning; people involved get "you're in this";
       everyone else with schedule access gets "new event" */
    function notifyForEvent(ev, how, newlyInvolved) {
        var m = me(), when = prettyDate(ev.date) + " at " + ev.time, told = {};
        people().forEach(function (p) {
            if (p.isMe) return;
            var st = stateOf(ev.date, p.userId);
            if (st !== "available") {
                told[p.userId] = 1;
                D.notify({ to: [p.userId], kind: "schedule", title: "Event on a day you're " + st, body: m.first + " " + how + " “" + ev.title + "” on " + when + ". You're marked " + st + ".", href: "dashboard-schedule.html?date=" + ev.date });
            }
        });
        (newlyInvolved || []).forEach(function (id) {
            if (id === m.id || told[id]) return;
            told[id] = 1;
            D.notify({ to: [id], kind: "schedule", title: "You're in a new event", body: m.first + " added you to “" + ev.title + "” on " + when + ".", href: "dashboard-schedule.html?date=" + ev.date });
        });
        var rest = people().filter(function (p) { return !p.isMe && !told[p.userId]; }).map(function (p) { return p.userId; });
        if (rest.length) D.notify({ to: rest, kind: "schedule", title: how === "added" ? "New event" : "Event " + how, body: m.first + " " + how + " “" + ev.title + "” on " + when + ".", href: "dashboard-schedule.html?date=" + ev.date });
    }

    /* ---------- calendar + agenda clicks ---------- */
    $("calendarDates").addEventListener("click", function (e) { var c = e.target.closest("span[data-date]"); if (c) pickDate(c.dataset.date); });
    $("calendarDates").addEventListener("keydown", function (e) { var c = e.target.closest("span[data-date]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickDate(c.dataset.date); } });
    function shiftMonth(delta) { viewMonth += delta; if (viewMonth < 0) { viewMonth = 11; viewYear--; } if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar(); }
    $("prevMonth").addEventListener("click", function () { shiftMonth(-1); });
    $("nextMonth").addEventListener("click", function () { shiftMonth(1); });
    $("prevWeek").addEventListener("click", function () { weekStart = addDays(weekStart, -7); renderWeekGrid(); });
    $("nextWeek").addEventListener("click", function () { weekStart = addDays(weekStart, 7); renderWeekGrid(); });
    $("todayBtn").addEventListener("click", function () { weekStart = startOfWeek(new Date()); pickDate(todayKey()); });

    $("agendaList").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-action]"); if (!btn || !canEdit()) return;
        var id = Number(btn.closest(".agenda-item").dataset.id), ev = events().filter(function (x) { return x.id === id; })[0];
        if (!ev) return;
        if (btn.dataset.action === "edit") return openModal(ev);
        var inSeries = ev.series ? events().filter(function (x) { return x.series === ev.series && x.date >= ev.date; }).length : 1;
        UI.confirm({ title: "Delete this event?", message: "“" + ev.title + "” on " + prettyDate(ev.date) + " will be removed" + (inSeries > 1 ? " (and the " + (inSeries - 1) + " later repeats)" : "") + ".", confirmText: "Delete event" })
            .then(function (ok) {
                if (!ok) return;
                saveEvents(events().filter(function (x) { return x.id !== id && !(ev.series && x.series === ev.series && x.date >= ev.date); }));
                logActivity(ev.title + " deleted", prettyDate(ev.date), "fa-trash");
                shared("deleted event “" + ev.title + "”", "fa-trash");
                UI.toast("Event deleted."); refresh();
            });
    });
    document.querySelector("#agendaList").closest(".panel").querySelector(".view-btn").addEventListener("click", function () { showAll = !showAll; renderAgenda(); });

    $("viewFilter").addEventListener("change", function () { viewMode = this.value; showAll = false; renderAgenda(); });
    $("categoryFilter").addEventListener("change", function () { categoryFilter = this.value; refresh(); });
    function onSearch(e) {
        searchTerm = e.target.value.toLowerCase().trim().slice(0, 80);
        ["eventSearch", "searchEvents"].forEach(function (id) { var el = $(id); if (el && el !== e.target) el.value = e.target.value; });
        renderAgenda();
    }
    ["eventSearch", "searchEvents"].forEach(function (id) { if ($(id)) $(id).addEventListener("input", onSearch); });

    /* ---------- history ---------- */
    $("historyBtn").addEventListener("click", function () {
        var changes = loadLog().slice().sort(function (a, b) { return b.t - a.t; });
        var past = events().filter(function (e) { return e.date < todayKey(); }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); }).slice(0, 100);
        var box = document.createElement("div");
        box.className = "history-modal";
        box.innerHTML = '<div class="history-box" role="dialog" aria-modal="true"><div class="history-head"><h2>Schedule History</h2><button type="button" class="history-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="history-list">' +
            '<h3 class="history-sub">Recent changes</h3>' + (changes.length ? changes.map(function (a) { return '<div class="history-row"><div><strong>' + esc(a.title) + "</strong><small>" + esc((a.who ? a.who + " • " : "") + a.sub) + "</small></div><span>" + esc(D.ago(a.t)) + "</span></div>"; }).join("") : '<p class="history-empty">No changes recorded yet.</p>') +
            '<h3 class="history-sub">Past events</h3>' + (past.length ? past.map(function (e) { return '<div class="history-row"><div><strong>' + esc(e.title) + "</strong><small>" + esc(e.category) + "</small></div><span>" + esc(prettyDate(e.date)) + " • " + esc(e.time) + "</span></div>"; }).join("") : '<p class="history-empty">No past events yet.</p>') +
            "</div>" + (past.length && canEdit() ? '<button type="button" class="history-clear">Clear past events</button>' : "") + "</div>";
        document.body.appendChild(box);
        box.addEventListener("click", function (e) {
            if (e.target === box || e.target.closest(".history-close")) box.remove();
            if (e.target.closest(".history-clear")) UI.confirm({ title: "Clear past events?", message: "All past events will be permanently deleted for everyone.", confirmText: "Clear past events" }).then(function (ok) {
                if (!ok) return;
                saveEvents(events().filter(function (x) { return x.date >= todayKey(); })); refresh(); UI.toast("Past events cleared."); box.remove();
            });
        });
    });

    /* =====================================================================
       CALENDAR SYNC  (.ics file or private iCal link; adds only, never removes)
    ===================================================================== */
    function unfold(text) { return String(text).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""); }
    function unescapeIcs(s) { return String(s || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim(); }
    function tzOffsetMs(ms, tz) {
        var f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
        var p = {}; f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
        return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
    }
    /* returns {date: local Date, allDay} */
    function parseIcsDate(value, params) {
        var m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
        if (!m) return null;
        if (!m[4]) return { date: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true };
        var parts = [+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)];
        if (m[7]) return { date: new Date(Date.UTC.apply(null, parts)), allDay: false };
        var tz = (params.match(/TZID=([^;:]+)/i) || [])[1];
        if (tz) {
            try { var guess = Date.UTC.apply(null, parts); return { date: new Date(guess - tzOffsetMs(guess, tz.replace(/"/g, ""))), allDay: false }; } catch (e) { /* unknown zone: treat as local */ }
        }
        return { date: new Date(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]), allDay: false };
    }
    function parseIcs(text) {
        var out = [], cur = null, lines = unfold(text).split("\n");
        lines.forEach(function (line) {
            if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; return; }
            if (/^END:VEVENT/i.test(line)) { if (cur) out.push(cur); cur = null; return; }
            if (!cur) return;
            var i = line.indexOf(":"); if (i < 0) return;
            var left = line.slice(0, i), val = line.slice(i + 1), name = left.split(";")[0].toUpperCase(), params = left.slice(name.length);
            if (name === "SUMMARY") cur.summary = unescapeIcs(val);
            else if (name === "DESCRIPTION") cur.description = unescapeIcs(val);
            else if (name === "LOCATION") cur.location = unescapeIcs(val);
            else if (name === "UID") cur.uid = val.trim();
            else if (name === "DTSTART") cur.start = parseIcsDate(val.trim(), params);
            else if (name === "RRULE") cur.rrule = val.trim();
            else if (name === "STATUS") cur.status = val.trim().toUpperCase();
            else if (name === "EXDATE") (cur.exdates = cur.exdates || []).push.apply(cur.exdates, val.split(",").map(function (v) { var d = parseIcsDate(v.trim(), params); return d ? toKey(d.date) : ""; }));
            else if (name === "RECURRENCE-ID") cur.recurrence = true;
        });
        return out;
    }
    var BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    function occurrences(ev, from, to) {
        var start = ev.start.date, res = [];
        if (!ev.rrule) { if (start >= from && start <= to) res.push(start); return res; }
        var r = {}; ev.rrule.split(";").forEach(function (p) { var kv = p.split("="); r[kv[0].toUpperCase()] = kv[1]; });
        var freq = r.FREQ, interval = Math.max(1, +r.INTERVAL || 1), count = r.COUNT ? +r.COUNT : Infinity;
        var until = r.UNTIL ? (parseIcsDate(r.UNTIL, "") || {}).date : null;
        var days = r.BYDAY ? r.BYDAY.split(",").map(function (d) { return BYDAY[d.slice(-2)]; }).filter(function (x) { return x != null; }) : null;
        var n = 0, guard = 0, d = new Date(start);
        function push(x) { n++; if (x >= from && x <= to) res.push(new Date(x)); }
        while (n < count && guard++ < 2000 && res.length < 200) {
            if (until && d > until) break;
            if (d > to) break;
            if (freq === "WEEKLY" && days) {
                var ws = addDays(d, -d.getDay());
                days.slice().sort().forEach(function (wd) {
                    var x = addDays(ws, wd); x.setHours(start.getHours(), start.getMinutes(), 0, 0);
                    if (x >= start && (!until || x <= until) && n < count) push(x);
                });
                d = addDays(ws, 7 * interval); d.setHours(start.getHours(), start.getMinutes(), 0, 0);
            } else {
                push(d);
                if (freq === "DAILY") d = addDays(d, interval);
                else if (freq === "WEEKLY") d = addDays(d, 7 * interval);
                else if (freq === "MONTHLY") d = new Date(d.getFullYear(), d.getMonth() + interval, d.getDate(), d.getHours(), d.getMinutes());
                else if (freq === "YEARLY") d = new Date(d.getFullYear() + interval, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
                else break;
            }
        }
        return res;
    }
    /* adds new events, never removes or changes existing ones */
    function importIcs(text, sourceName) {
        if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That isn't a calendar (.ics) file.");
        var parsed = parseIcs(text).filter(function (e) { return e.start && e.summary && e.status !== "CANCELLED" && !e.recurrence; });
        var from = new Date(), to = addDays(new Date(), 365);          // only events from now on: past events aren't added
        var list = events(), m = me(), added = 0, skipped = 0;
        var have = {};
        list.forEach(function (e) { if (e.uid) have[e.uid] = 1; have["t|" + e.title.toLowerCase() + "|" + e.date + "|" + e.time] = 1; });
        parsed.forEach(function (ev, i) {
            occurrences(ev, from, to).forEach(function (when, j) {
                var date = toKey(when), time = ev.start.allDay ? "00:00" : pad(when.getHours()) + ":" + pad(when.getMinutes());
                if (ev.exdates && ev.exdates.indexOf(date) > -1) return;
                var uid = (ev.uid || "noid-" + i) + "@" + date;
                var title = ev.summary.slice(0, 80);
                if (have[uid] || have["t|" + title.toLowerCase() + "|" + date + "|" + time]) { skipped++; return; }
                have[uid] = 1;
                list.push({ id: Date.now() * 10 + added, uid: uid, title: title, category: "Imported", date: date, time: time, allDay: ev.start.allDay || undefined,
                            description: [ev.location, ev.description].filter(Boolean).join(" • ").slice(0, 300), source: "ics", sourceName: sourceName,
                            createdBy: m.id, createdByName: m.first, createdAt: Date.now() });
                added++;
            });
        });
        if (added > 1500) throw new Error("That calendar has too many events to import at once.");
        if (added) {
            saveEvents(list);
            logActivity("Calendar synced", added + " event(s) added from " + sourceName, "fa-arrows-rotate");
            shared("imported " + added + " event(s) from " + sourceName, "fa-arrows-rotate");
        }
        return { added: added, skipped: skipped };
    }

    var syncModal = $("syncModal");
    function openSync() {
        if (!canEdit()) return UI.toast("You can view the schedule but not change it.", "error");
        $("syncError").textContent = ""; $("syncResult").textContent = "";
        renderSavedLinks();
        syncModal.classList.add("active"); document.body.style.overflow = "hidden";
    }
    function closeSync() { syncModal.classList.remove("active"); document.body.style.overflow = ""; }
    $("syncBtn").addEventListener("click", openSync);
    $("closeSync").addEventListener("click", closeSync);
    syncModal.addEventListener("click", function (e) { if (e.target === syncModal) closeSync(); });
    function showResult(r, name) {
        $("syncResult").textContent = r.added ? "Added " + r.added + " event(s) from " + name + (r.skipped ? " (" + r.skipped + " already on your calendar)." : ".") : "Nothing new: all " + r.skipped + " event(s) were already on your calendar.";
        UI.toast(r.added ? r.added + " event(s) imported." : "Your calendar is already up to date.", r.added ? "success" : "info");
        refresh();
    }
    $("icsFile").addEventListener("change", function () {
        var f = this.files[0]; this.value = "";
        $("syncError").textContent = "";
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) { $("syncError").textContent = "That file is bigger than 3 MB."; return; }
        if (!/\.ics$/i.test(f.name) && f.type !== "text/calendar") { $("syncError").textContent = "Choose a calendar file ending in .ics."; return; }
        var reader = new FileReader();
        reader.onload = function () { try { showResult(importIcs(String(reader.result), f.name.replace(/\.ics$/i, "")), f.name); } catch (e) { $("syncError").textContent = e.message; } };
        reader.onerror = function () { $("syncError").textContent = "Could not read that file."; };
        reader.readAsText(f);
    });
    function savedLinks() { return D.util.load("elaraCalendarLinks", []); }
    function renderSavedLinks() {
        var list = savedLinks();
        $("savedLinks").innerHTML = list.length ? '<p class="saved-title">Saved on this device:</p>' + list.map(function (l, i) {
            return '<div class="saved-link"><span title="' + esc(l.url) + '">' + esc(l.name) + "</span><small>" + (l.last ? "synced " + esc(D.ago(l.last)) : "") + '</small><button type="button" data-sync-link="' + i + '">Sync now</button><button type="button" data-forget-link="' + i + '" aria-label="Forget link"><i class="fa-solid fa-xmark"></i></button></div>';
        }).join("") : "";
    }
    function linkName(url) { try { var u = new URL(url.replace(/^webcal:/i, "https:")); return u.hostname.replace(/^www\./, "").replace(/calendar\.google\.com/, "Google Calendar").replace(/.*icloud\.com/, "iCloud").replace(/outlook\.(live|office365)\.com/, "Outlook"); } catch (e) { return "Calendar link"; } }
    function syncLink(url, quiet) {
        if (!cfg.icsEndpoint || !D.user) return Promise.reject(new Error("Importing from a link needs the elara-ics function (README, step 9). You can import a .ics file instead."));
        return D.callFunction(cfg.icsEndpoint, { url: url }).then(function (j) {
            var r = importIcs(j.ics, linkName(url));
            var list = savedLinks(); list.forEach(function (l) { if (l.url === url) l.last = Date.now(); }); D.util.save("elaraCalendarLinks", list);
            if (!quiet) showResult(r, linkName(url)); else if (r.added) { UI.toast(r.added + " new event(s) synced from " + linkName(url) + ".", "info"); refresh(); }
            return r;
        });
    }
    $("icsLinkForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var url = $("icsUrl").value.trim();
        $("syncError").textContent = ""; $("syncResult").textContent = "";
        if (!/^(https|webcal):\/\/[^\s]{8,}$/i.test(url)) { $("syncError").textContent = "Paste the calendar's https:// or webcal:// link."; return; }
        var overlay = $("loadingOverlay"); overlay.classList.add("active");
        syncLink(url).then(function () {
            if ($("rememberLink").checked) {
                var list = savedLinks();
                if (!list.some(function (l) { return l.url === url; })) list.push({ url: url, name: linkName(url), last: Date.now() });
                D.util.save("elaraCalendarLinks", list.slice(0, 5));
            }
            $("icsUrl").value = ""; renderSavedLinks();
        }).catch(function (err) { $("syncError").textContent = err.message; }).then(function () { overlay.classList.remove("active"); });
    });
    $("savedLinks").addEventListener("click", function (e) {
        var s = e.target.closest("[data-sync-link]"), f = e.target.closest("[data-forget-link]"), list = savedLinks();
        if (s) { var overlay = $("loadingOverlay"); overlay.classList.add("active"); syncLink(list[+s.dataset.syncLink].url).catch(function (err) { $("syncError").textContent = err.message; }).then(function () { overlay.classList.remove("active"); renderSavedLinks(); }); }
        if (f) { list.splice(+f.dataset.forgetLink, 1); D.util.save("elaraCalendarLinks", list); renderSavedLinks(); }
    });
    // saved links sync quietly when the page opens (at most once an hour)
    if (canEdit()) savedLinks().forEach(function (l) { if (!l.last || Date.now() - l.last > 3600000) syncLink(l.url, true).catch(function (e) { console.warn("[Elara] calendar sync:", e.message); }); });

    D.onChange(refresh);
    document.addEventListener("elara:refresh", refresh);
    if (/[?&]new=1/.test(location.search)) setTimeout(function () { openModal(null); }, 300);
    refresh();
})();
