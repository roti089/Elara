/* ==========================================================
            ELARA HOME MANAGEMENT SYSTEM
                 SCHEDULE ENGINE V2
   (theme + logout are handled by elara-common.js)
========================================================== */
(function () {
    "use strict";

    var STORAGE_KEY = "elaraSchedules";
    var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    var ICONS = {
        "Personal": "fa-user", "Household": "fa-house", "Shopping": "fa-cart-shopping",
        "Maintenance": "fa-wrench", "Smart Home": "fa-lightbulb",
        "Cleaning": "fa-broom", "Security": "fa-lock"
    };

    /* ---------- date helpers (LOCAL time; toISOString() would be UTC and off by a day) ---------- */
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function toKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function fromKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function startOfWeek(d) { return addDays(d, -d.getDay()); }
    function prettyDate(key) {
        var d = fromKey(key);
        return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3);
    }

    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }
    function $(id) { return document.getElementById(id); }

    /* ---------- state ---------- */
    var today = new Date();
    var todayKey = toKey(today);
    var viewYear = today.getFullYear();
    var viewMonth = today.getMonth();
    var selectedKey = todayKey;
    var viewMode = "Month";        // Month | Week | Today
    var categoryFilter = "All Categories";
    var searchTerm = "";
    var showAll = false;
    var editingId = null;

    var seq = 0;
    var events = loadEvents();
    events.forEach(function (e) { if (typeof e.id !== "number" || isNaN(e.id)) e.id = Date.now() + (seq++); });
    save();

    function loadEvents() {
        var raw = null;
        try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        if (raw !== null) {
            try {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            } catch (e) { /* fall through to seed */ }
        }
        // logged-in users start with an empty calendar; guests get demo events
        if (window.ElaraData && !ElaraData.demo) return [];
        var t = new Date();
        return [
            mk("Morning Routine",  "Household", toKey(t), "07:00", "Kitchen • Coffee • Breakfast"),
            mk("Pick Up Groceries","Shopping",  toKey(t), "13:00", "Checkers Hyper"),
            mk("Gym Session",      "Personal",  toKey(t), "18:00", "Virgin Active"),
            mk("Water Plants",     "Household", toKey(addDays(t, 1)), "08:00", "Garden irrigation reminder"),
            mk("Vehicle Service",  "Maintenance", toKey(addDays(t, 3)), "09:30", "Book maintenance appointment")
        ];
    }
    function mk(title, category, date, time, description) {
        return { id: Date.now() + (seq++), title: title, category: category, date: date, time: time,
                 description: description || "", completed: false };
    }
    function shared(text, icon) { if (window.ElaraData) ElaraData.log(text, icon); }
    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch (e) { /* ignore */ }
    }

    function matchesCategory(ev) {
        return categoryFilter === "All Categories" || ev.category === categoryFilter;
    }
    function eventsOn(key) {
        return events
            .filter(function (e) { return e.date === key && matchesCategory(e); })
            .sort(function (a, b) { return a.time.localeCompare(b.time); });
    }

    /* ---------- toast ---------- */
    function toast(message, type) {
        var box = $("toastContainer");
        if (!box) { box = document.createElement("div"); box.id = "toastContainer"; document.body.appendChild(box); }
        var el = document.createElement("div");
        el.className = "toast " + (type || "success");
        el.innerHTML = '<i class="fa-solid ' + (type === "error" ? "fa-circle-exclamation" : "fa-circle-check") + '"></i><span>' + esc(message) + "</span>";
        box.appendChild(el);
        requestAnimationFrame(function () { el.classList.add("show"); });
        setTimeout(function () {
            el.classList.remove("show");
            setTimeout(function () { el.remove(); }, 350);
        }, 3000);
    }

    /* ---------- calendar ---------- */
    function renderCalendar() {
        var grid = $("calendarDates");
        if (!grid) return;

        var title = $("calendarMonth");
        if (title) title.textContent = MONTHS[viewMonth] + " " + viewYear;

        var first = new Date(viewYear, viewMonth, 1);
        var gridStart = addDays(first, -first.getDay());
        var html = "";

        for (var i = 0; i < 42; i++) {
            var d = addDays(gridStart, i);
            var key = toKey(d);
            var cls = [];
            if (d.getMonth() !== viewMonth) cls.push("inactive");
            if (key === todayKey) cls.push("today");
            if (key === selectedKey) cls.push("selected");
            if (eventsOn(key).length) cls.push("event-day");
            html += '<span class="' + cls.join(" ") + '" data-date="' + key + '">' + d.getDate() + "</span>";
        }
        grid.innerHTML = html;
    }

    /* ---------- agenda ---------- */
    function agendaItemHTML(ev, showDate) {
        var icon = ICONS[ev.category] || "fa-calendar";
        var sub = ev.description || ev.category;
        return '' +
        '<div class="agenda-item" data-id="' + ev.id + '">' +
            '<div class="agenda-left">' +
                '<div class="agenda-icon"><i class="fa-solid ' + icon + '"></i></div>' +
                '<div class="agenda-text"><h4>' + esc(ev.title) + '</h4><p>' +
                    (showDate ? esc(prettyDate(ev.date)) + " • " : "") + esc(sub) + '</p></div>' +
            '</div>' +
            '<div class="agenda-right">' +
                '<span class="agenda-time">' + esc(ev.time) + '</span>' +
                '<button type="button" class="agenda-btn" data-action="edit" data-id="' + ev.id + '" title="Edit"><i class="fa-solid fa-pen"></i></button>' +
                '<button type="button" class="agenda-btn" data-action="delete" data-id="' + ev.id + '" title="Delete"><i class="fa-solid fa-trash"></i></button>' +
            '</div>' +
        '</div>';
    }

    function renderAgenda() {
        var list = $("agendaList");
        if (!list) return;
        var panel = list.closest(".panel");
        var h2 = panel && panel.querySelector(".panel-header h2");
        var sub = panel && panel.querySelector(".panel-subtitle");
        var items, showDate = false, heading, subtitle;

        if (searchTerm) {
            items = events.filter(function (e) {
                return matchesCategory(e) &&
                    (e.title + " " + e.description + " " + e.category).toLowerCase().indexOf(searchTerm) > -1;
            });
            showDate = true;
            heading = "Search Results"; subtitle = items.length + " event(s) found";
        } else if (showAll) {
            items = events.filter(function (e) { return matchesCategory(e) && e.date >= todayKey; });
            showDate = true;
            heading = "Upcoming Events"; subtitle = "Everything coming up";
        } else if (viewMode === "Week") {
            var ws = startOfWeek(fromKey(selectedKey)), we = addDays(ws, 6);
            items = events.filter(function (e) { return matchesCategory(e) && e.date >= toKey(ws) && e.date <= toKey(we); });
            showDate = true;
            heading = "This Week"; subtitle = prettyDate(toKey(ws)) + " – " + prettyDate(toKey(we));
        } else {
            items = eventsOn(selectedKey);
            heading = selectedKey === todayKey ? "Today's Agenda" : "Agenda";
            subtitle = selectedKey === todayKey ? "Your schedule for today" : "Schedule for " + prettyDate(selectedKey);
        }

        items.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });

        if (h2) h2.textContent = heading;
        if (sub) sub.textContent = subtitle;

        list.innerHTML = items.length
            ? items.map(function (e) { return agendaItemHTML(e, showDate); }).join("")
            : '<div class="agenda-empty"><i class="fa-regular fa-calendar"></i><p>No events here yet.<br>Click <strong>New Event</strong> to add one.</p></div>';

        var viewAll = panel && panel.querySelector(".view-btn");
        if (viewAll) viewAll.textContent = showAll ? "Back" : "View All";
    }

    /* ---------- member availability (shared by the list, the stat card and the weekly bars) ---------- */
    function memberState(m) {
        if (m.availability) return m.availability;
        if (m.status === "away") return "away";
        var nowT = new Date(), hm = pad(nowT.getHours()) + ":" + pad(nowT.getMinutes());
        var from = pad(Math.max(0, nowT.getHours() - 1)) + ":00";
        var inEvent = events.some(function (e) {
            return e.date === todayKey && e.time <= hm && e.time >= from &&
                   (e.title + " " + (e.description || "")).toLowerCase().indexOf(m.name.toLowerCase()) > -1;
        });
        return inEvent ? "busy" : "available";
    }
    function activeMembers() {
        return window.ElaraData ? ElaraData.members.all().filter(function (m) { return m.status !== "pending"; }) : [];
    }

    /* ---------- stats ---------- */
    function renderStats() {
        var tEl = $("todayEvents"), wEl = $("weekEvents");
        if (tEl) tEl.textContent = events.filter(function (e) { return e.date === todayKey; }).length;
        if (wEl) {
            var ws = toKey(startOfWeek(today)), we = toKey(addDays(startOfWeek(today), 6));
            wEl.textContent = events.filter(function (e) { return e.date >= ws && e.date <= we; }).length;
        }

        // Recurring = an event or task title that shows up on 2 or more different days
        var rEl = $("recurringTasks");
        if (rEl) {
            var seen = {};
            function note(title, date) {
                var k = String(title || "").trim().toLowerCase(); if (!k) return;
                (seen[k] = seen[k] || {})[date] = 1;
            }
            events.forEach(function (e) { note(e.title, e.date); });
            (window.ElaraData ? ElaraData.tasks.all() : []).forEach(function (t) { note(t.title, t.date); });
            rEl.textContent = Object.keys(seen).filter(function (k) { return Object.keys(seen[k]).length >= 2; }).length;
        }

        // Family availability = share of (joined) members who are available right now
        var aEl = $("availability");
        if (aEl) {
            var ms = activeMembers();
            var free = ms.filter(function (m) { return memberState(m) === "available"; }).length;
            aEl.textContent = ms.length ? Math.round(free / ms.length * 100) + "%" : "\u2014";
        }
    }

    /* ---------- activity feed ---------- */
    var D = window.ElaraData;
    function loadLog() { return D ? D.util.load("elaraScheduleLog", []) : []; }
    function relTime(t) { return D ? D.ago(t) : "Just now"; }

    function logActivity(title, subtitle, icon) {
        if (D) {
            var list = loadLog();
            list.unshift({ t: Date.now(), title: title, sub: subtitle, icon: icon || "fa-calendar-check" });
            D.util.save("elaraScheduleLog", list.slice(0, 60));
        }
        renderRecent();
    }

    /* "Recent Activity" = the real changes you made to the schedule */
    function renderRecent() {
        var list = $("activityList");
        if (!list) return;
        var items = loadLog().slice(0, 5);
        list.innerHTML = items.length ? items.map(function (a) {
            return '<div class="activity-item"><div class="activity-icon"><i class="fa-solid ' + esc(a.icon) + '"></i></div>' +
                   '<div class="activity-info"><h4>' + esc(a.title) + '</h4><p>' + esc(a.sub) + '</p></div><span>' + esc(relTime(a.t)) + '</span></div>';
        }).join("") : '<div class="activity-empty"><i class="fa-regular fa-clock"></i><p>No changes yet. When you add, move or delete events they\u2019ll be listed here.</p></div>';
    }
    setInterval(renderRecent, 30000);

    /* ---------- upcoming reminders: events, tasks and warranties that need you soon ---------- */
    var REM_TYPES = {
        "Household":   { cls: "plants",   icon: "fa-house" },
        "Shopping":    { cls: "shopping", icon: "fa-cart-shopping" },
        "Maintenance": { cls: "car",      icon: "fa-wrench" },
        "Personal":    { cls: "",         icon: "fa-user" },
        "Smart Home":  { cls: "",         icon: "fa-lightbulb" }
    };
    function friendlyDay(key, time) {
        var d = fromKey(key), diff = Math.round((d - startOfDay(new Date())) / 86400000);
        var base = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff > 1 && diff < 7 ? DAYS[d.getDay()] : d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3);
        return time && diff <= 1 ? base + " \u2022 " + time : base;
    }
    function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

    function renderReminders() {
        var box = $("reminderList");
        if (!box) return;
        box.className = "reminder-list";
        var now = new Date(), nowKey = toKey(now), hm = pad(now.getHours()) + ":" + pad(now.getMinutes());
        var limit = toKey(addDays(now, 14)), items = [];

        events.forEach(function (e) {
            if (e.date < nowKey || e.date > limit) return;
            if (e.date === nowKey) {                       // today's events are already in the Agenda: only nudge for ones starting within 3 hours
                var soonHM = pad(Math.min(23, now.getHours() + 3)) + ":" + pad(now.getMinutes());
                if (e.time < hm || e.time > soonHM) return;
            }
            var t = REM_TYPES[e.category] || { cls: "", icon: "fa-calendar" };
            if (/bill|pay|invoice|rent/i.test(e.title)) t = { cls: "bill", icon: "fa-file-invoice-dollar" };
            items.push({ when: e.date + " " + e.time, title: e.title, sub: e.description || e.category, cls: t.cls, icon: t.icon, label: friendlyDay(e.date, e.time) });
        });
        if (D) {
            D.tasks.all().forEach(function (t) {
                if (t.status === "Completed") return;
                var late = (t.date + " " + t.time) < (nowKey + " " + hm);
                if (!late && t.date > limit) return;
                items.push({ when: late ? "0000" : t.date + " " + t.time, title: t.title, sub: "Task \u2022 " + t.assignee, cls: late ? "shopping" : "", icon: "fa-list-check",
                             label: late ? "Overdue" : friendlyDay(t.date, t.time), overdue: late });
            });
            D.util.load("elaraWarranties", []).forEach(function (w) {
                var days = Math.ceil((new Date(w.expires + "T23:59:59") - now) / 86400000);
                if (days < 0 || days > 45) return;
                items.push({ when: w.expires + " 23:59", title: w.name + " warranty", sub: "Warranty ends soon", cls: "bill", icon: "fa-shield-halved",
                             label: days === 0 ? "Today" : days + (days === 1 ? " day" : " days") });
            });
        }
        items.sort(function (a, b) { return a.when.localeCompare(b.when); });
        items = items.slice(0, 5);

        box.innerHTML = items.length ? items.map(function (r) {
            return '<div class="reminder ' + r.cls + '"><div class="reminder-left"><div class="reminder-icon"><i class="fa-solid ' + r.icon + '"></i></div>' +
                   '<div class="reminder-text"><h4>' + esc(r.title) + '</h4><p>' + esc(r.sub) + '</p></div></div>' +
                   '<span class="reminder-date' + (r.overdue ? " overdue" : "") + '">' + esc(r.label) + '</span></div>';
        }).join("") : '<div class="reminder-empty"><i class="fa-regular fa-bell"></i><p>Nothing to remind you about. Add an event or a task and it will show up here.</p></div>';
    }

    /* ---------- weekly activity (events + tasks per day, this week) ---------- */
    function renderWeek() {
        var box = document.querySelector(".week-timeline");
        if (!box) return;
        var tasks = window.ElaraData ? ElaraData.tasks.all() : [];
        var start = startOfWeek(new Date()), html = "";
        for (var i = 0; i < 7; i++) {
            var d = addDays(start, i), key = toKey(d);
            var dayEvents = events.filter(function (e) { return e.date === key; });
            var dayTasks = tasks.filter(function (t) { return t.date === key && t.status !== "Completed"; });
            var n = dayEvents.length + dayTasks.length;
            var busyNow = 0;
            if (key === todayKey) {   // people marked Busy or Away today make today a heavier day
                busyNow = activeMembers().filter(function (m) { return memberState(m) !== "available"; }).length;
            }
            n += busyNow;
            var cls = n >= 6 ? "full" : n >= 4 ? "busy" : n >= 2 ? "medium" : "low";
            var names = dayEvents.map(function (e) { return e.time + " " + e.title; }).concat(dayTasks.map(function (t) { return "Task: " + t.title; })).slice(0, 5);
            if (busyNow) names.push(busyNow + (busyNow === 1 ? " member is" : " members are") + " busy or away");
            html += '<div class="day' + (key === todayKey ? " today" : "") + (key === selectedKey ? " picked" : "") + '" data-day="' + key + '" role="button" tabindex="0">' +
                    '<h4>' + DAYS[d.getDay()] + '</h4>' +
                    '<div class="bar ' + cls + '" title="' + esc(n ? names.join("\n") : "Nothing planned") + '"></div>' +
                    '<span>' + (n === 0 ? "Free" : n + (n === 1 ? " item" : " items")) + '</span></div>';
        }
        box.innerHTML = html;
    }
    document.addEventListener("click", function (e) {
        var day = e.target.closest(".week-timeline [data-day]");
        if (!day) return;
        selectedKey = day.dataset.day;
        var d = fromKey(selectedKey); viewYear = d.getFullYear(); viewMonth = d.getMonth();
        showAll = false; searchTerm = "";
        refresh();
        var agendaPanel = $("agendaList") && $("agendaList").closest(".panel");
        if (agendaPanel) agendaPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    /* ---------- household availability (from Members, click to change) ---------- */
    function renderAvailability() {
        var list = document.querySelector(".family-list");
        if (!list || !window.ElaraData) return;
        var members = ElaraData.members.all().filter(function (m) { return m.status !== "pending"; });
        var roles = { owner: "Home Owner", adult: "Adult", member: "Family Member", guest: "Guest" };
        var pic = localStorage.getItem("elaraProfileImage") || "";
        list.innerHTML = members.map(function (m) {
            var state = memberState(m);
            var img = m.role === "owner" && pic ? pic : m.avatar;
            var avatar = img ? '<img src="' + esc(img) + '" alt="' + esc(m.name) + '">' : '<div class="avail-avatar">' + esc(m.name.charAt(0).toUpperCase()) + '</div>';
            return '<div class="member"><div class="member-info">' + avatar + '<div><h4>' + esc(m.name) + '</h4><p>' + esc(roles[m.role] || m.role) + '</p></div></div>' +
                   '<button type="button" class="status-badge ' + state + '" data-avail="' + m.id + '" title="Click to change">' + state.charAt(0).toUpperCase() + state.slice(1) + '</button></div>';
        }).join("") || '<p style="opacity:.65;padding:12px">Invite people on the Members page.</p>';
    }
    document.addEventListener("click", function (e) {
        var b = e.target.closest("[data-avail]");
        if (!b || !window.ElaraData) return;
        var all = ElaraData.members.all(), m = all.filter(function (x) { return String(x.id) === b.dataset.avail; })[0];
        if (!m) return;
        var order = ["available", "busy", "away"];
        var shown = b.classList.contains("busy") ? "busy" : b.classList.contains("away") ? "away" : "available";
        var next = order[(order.indexOf(shown) + 1) % order.length];
        m.availability = next;
        ElaraData.members.save(all);
        shared(m.name + " is now " + next, "fa-user-clock");
        renderAvailability(); renderStats(); renderWeek();
    });

    function refresh() {
        renderCalendar();
        renderAgenda();
        renderStats();
        renderWeek();
        renderAvailability();
        renderReminders();
        renderRecent();
    }

    /* ---------- modal ---------- */
    var modal = $("eventModal");
    var form = $("eventForm");

    function openModal(ev) {
        if (!modal) return;
        editingId = ev ? ev.id : null;
        if (form) form.reset();
        $("eventTitle").value = ev ? ev.title : "";
        $("eventCategory").value = ev ? ev.category : "Personal";
        $("eventDate").value = ev ? ev.date : selectedKey;
        $("eventTime").value = ev ? ev.time : "09:00";
        $("eventDescription").value = ev ? ev.description : "";
        var h2 = modal.querySelector(".modal-header h2");
        if (h2) h2.textContent = ev ? "Edit Event" : "Add New Event";
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
        setTimeout(function () { $("eventTitle").focus(); }, 50);
    }
    function closeModal() {
        if (!modal) return;
        modal.classList.remove("active");
        document.body.style.overflow = "";
        editingId = null;
    }

    ["addEventBtn", "fabButton"].forEach(function (id) {
        var b = $(id);
        if (b) b.addEventListener("click", function () { openModal(null); });
    });
    ["closeModal", "cancelEvent"].forEach(function (id) {
        var b = $(id);
        if (b) b.addEventListener("click", closeModal);
    });
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

    if (form) {
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var title = $("eventTitle").value.trim();
            var date = $("eventDate").value;
            var time = $("eventTime").value;
            if (!title || !date || !time) { toast("Please fill in the name, date and time.", "error"); return; }

            var data = {
                title: title, category: $("eventCategory").value, date: date, time: time,
                description: $("eventDescription").value.trim()
            };

            if (editingId !== null) {
                var before = events.filter(function (ev) { return ev.id === editingId; })[0];
                var moved = before && (before.date !== date || before.time !== time);
                var oldTitle = before ? before.title : title;
                events.forEach(function (ev) { if (ev.id === editingId) { for (var k in data) ev[k] = data[k]; } });
                if (moved) {
                    logActivity(title + " rescheduled", "Moved to " + prettyDate(date) + " \u2022 " + time, "fa-arrows-rotate");
                    shared("rescheduled \u201c" + title + "\u201d to " + prettyDate(date), "fa-arrows-rotate");
                } else {
                    logActivity(title + " updated", (oldTitle !== title ? "Renamed from " + oldTitle : prettyDate(date) + " \u2022 " + time), "fa-pen");
                    shared("updated event \u201c" + title + "\u201d", "fa-pen");
                }
                toast("Event updated.");
            } else {
                var created = mk(data.title, data.category, data.date, data.time, data.description);
                events.push(created);
                logActivity(title + " added", prettyDate(date) + " \u2022 " + time, "fa-calendar-check");
                shared("scheduled \u201c" + title + "\u201d for " + prettyDate(date), "fa-calendar-check");
                toast("Event added.");
            }

            save();
            // jump to the month/day of the saved event so the person sees it
            var d = fromKey(date);
            viewYear = d.getFullYear(); viewMonth = d.getMonth(); selectedKey = date;
            showAll = false; searchTerm = "";
            ["eventSearch", "searchEvents"].forEach(function (id) { if ($(id)) $(id).value = ""; });
            closeModal();
            refresh();
        });
    }

    /* ---------- calendar clicks ---------- */
    var dates = $("calendarDates");
    if (dates) {
        dates.addEventListener("click", function (e) {
            var cell = e.target.closest("span[data-date]");
            if (!cell) return;
            selectedKey = cell.dataset.date;
            var d = fromKey(selectedKey);
            viewYear = d.getFullYear(); viewMonth = d.getMonth();
            showAll = false;
            refresh();
        });
    }

    function shiftMonth(delta) {
        viewMonth += delta;
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        renderCalendar();
    }
    if ($("prevMonth")) $("prevMonth").addEventListener("click", function () { shiftMonth(-1); });
    if ($("nextMonth")) $("nextMonth").addEventListener("click", function () { shiftMonth(1); });

    function goToday() {
        selectedKey = todayKey;
        viewYear = today.getFullYear(); viewMonth = today.getMonth();
        showAll = false;
        refresh();
    }
    if ($("todayBtn")) $("todayBtn").addEventListener("click", goToday);

    /* ---------- agenda actions (delegation) ---------- */
    var agenda = $("agendaList");
    if (agenda) {
        agenda.addEventListener("click", function (e) {
            var btn = e.target.closest("[data-action]");
            if (!btn) return;
            var id = Number(btn.dataset.id);
            var ev = events.filter(function (x) { return x.id === id; })[0];
            if (!ev) return;
            if (btn.dataset.action === "edit") {
                openModal(ev);
            } else if (btn.dataset.action === "delete") {
                ElaraUI.confirm({ title: "Delete this event?", message: "\u201c" + ev.title + "\u201d on " + prettyDate(ev.date) + " will be removed from your schedule.", confirmText: "Delete event" })
                    .then(function (ok) {
                        if (!ok) return;
                        events = events.filter(function (x) { return x.id !== id; });
                        save();
                        logActivity(ev.title + " deleted", prettyDate(ev.date), "fa-trash");
                        shared("deleted event \u201c" + ev.title + "\u201d", "fa-trash");
                        toast("Event deleted.");
                        refresh();
                    });
            }
        });
        var panel = agenda.closest(".panel");
        var viewAll = panel && panel.querySelector(".view-btn");
        if (viewAll) viewAll.addEventListener("click", function () { showAll = !showAll; renderAgenda(); });
    }

    /* ---------- filters / search ---------- */
    if ($("viewFilter")) {
        $("viewFilter").addEventListener("change", function () {
            viewMode = this.value.trim();
            showAll = false;
            if (viewMode === "Today") goToday(); else refresh();
        });
    }
    if ($("categoryFilter")) {
        $("categoryFilter").addEventListener("change", function () {
            categoryFilter = this.value.trim();
            refresh();
        });
    }
    function onSearch(e) {
        searchTerm = e.target.value.toLowerCase().trim();
        // keep the two search boxes in sync
        ["eventSearch", "searchEvents"].forEach(function (id) {
            var el = $(id); if (el && el !== e.target) el.value = e.target.value;
        });
        renderAgenda();
    }
    ["eventSearch", "searchEvents"].forEach(function (id) {
        if ($(id)) $(id).addEventListener("input", onSearch);
    });

    /* ---------- sync + notifications ---------- */
    if ($("syncBtn")) {
        $("syncBtn").addEventListener("click", function () {
            var overlay = $("loadingOverlay");
            if (overlay) overlay.classList.add("active");
            setTimeout(function () {
                if (overlay) overlay.classList.remove("active");
                toast("Calendar synced successfully.");
            }, 1500);
        });
    }
    if ($("notificationBtn")) {
        $("notificationBtn").addEventListener("click", function () {
            var now = pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
            var left = events.filter(function (e) { return e.date === todayKey && e.time >= now; }).length;
            toast(left ? left + " event(s) still to come today." : "No more events today.");
        });
    }

    /* ---------- activity "View History" ---------- */
    function openHistory() {
        var old = $("historyModal");
        if (old) old.remove();

        var changes = loadLog();
        var past = events.filter(function (e) { return e.date < todayKey; })
            .sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });

        var box = document.createElement("div");
        box.id = "historyModal";
        box.className = "history-modal";
        box.innerHTML =
            '<div class="history-box">' +
                '<div class="history-head"><h2>Schedule History</h2>' +
                '<button type="button" class="history-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +
                '<div class="history-list">' +
                '<h3 class="history-sub">Recent changes</h3>' +
                (changes.length ? changes.map(function (a) {
                    return '<div class="history-row"><div><strong>' + esc(a.title) + '</strong><small>' + esc(a.sub) + '</small></div><span>' + esc(relTime(a.t)) + '</span></div>';
                }).join("") : '<p class="history-empty">No changes recorded yet.</p>') +
                '<h3 class="history-sub">Past events</h3>' +
                (past.length ? past.map(function (e) {
                    return '<div class="history-row"><div><strong>' + esc(e.title) + '</strong><small>' + esc(e.category) + '</small></div><span>' + esc(prettyDate(e.date)) + ' \u2022 ' + esc(e.time) + '</span></div>';
                }).join("") : '<p class="history-empty">No past events yet.</p>') +
                '</div>' +
                (past.length ? '<button type="button" class="history-clear">Clear past events</button>' : "") +
            '</div>';
        document.body.appendChild(box);

        function close() { box.remove(); }
        box.addEventListener("click", function (e) {
            if (e.target === box || e.target.closest(".history-close")) close();
            if (e.target.closest(".history-clear")) {
                ElaraUI.confirm({ title: "Clear past events?", message: "All " + past.length + " past event(s) will be permanently deleted.", confirmText: "Clear past events" })
                    .then(function (ok) {
                        if (!ok) return;
                        events = events.filter(function (x) { return x.date >= todayKey; });
                        save(); refresh(); toast("Past events cleared."); close();
                    });
            }
        });
    }
    var activityPanel = $("activityList") && $("activityList").closest(".panel");
    var historyBtn = activityPanel && activityPanel.querySelector(".view-btn");
    if (historyBtn) historyBtn.addEventListener("click", openHistory);

    refresh();
})();
