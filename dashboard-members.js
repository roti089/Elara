/* ==========================================================
                ELARA MEMBERS PAGE
   Data comes from ElaraData (per logged-in user).
   Theme, logout and dialogs come from elara-common.js
========================================================== */
(function () {
    "use strict";

    var D = window.ElaraData;
    var ROLE_PERMS = D ? D.members.ROLE_PERMS : {
        owner: { smartHome: true, tasks: true, shopping: true, analytics: true },
        adult: { smartHome: true, tasks: true, shopping: true, analytics: true },
        member: { smartHome: true, tasks: true, shopping: true, analytics: false },
        guest: { smartHome: false, tasks: true, shopping: false, analytics: false }
    };
    var cfg = window.ELARA_CONFIG || {};
    var LOGIN_URL = new URL(cfg.loginPage || "../Interface/Loginpage.html", window.location.href).href;
    var members = D ? D.members.all() : [];
    var editingId = null, permMemberId = null;
    var avatarColors = ["", "blue", "pink", "orange"];

    function save() { if (D) D.members.save(members); }
    function log(text, icon) { if (D) D.log(text, icon); renderActivity(); }
    function $(id) { return document.getElementById(id); }
    function esc(str) {
        return String(str).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    }
    function toast(m, t) { if (window.ElaraUI) ElaraUI.toast(m, t); }
    function find(id) { return members.filter(function (m) { return String(m.id) === String(id); })[0]; }

    var roleLabels = { owner: "Home Owner", adult: "Adult", member: "Member", guest: "Guest" };
    var roleIcons = { owner: "fa-crown", adult: "fa-user", member: "fa-user", guest: "fa-user-clock" };
    var statusLabels = { online: "Online", away: "Away", offline: "Offline", pending: "Pending" };


    /* ---------- invitations: really email the person ---------- */
    function inviteViaServer(m) {
        return D.getClient().then(function (c) { return c.auth.getSession(); }).then(function (s) {
            var headers = { "Content-Type": "application/json" };
            if (s.data && s.data.session) headers.Authorization = "Bearer " + s.data.session.access_token;
            if (cfg.supabaseAnonKey) headers.apikey = cfg.supabaseAnonKey;
            return fetch(cfg.inviteEndpoint, { method: "POST", headers: headers,
                body: JSON.stringify({ email: m.email, name: m.name, role: m.role, redirectTo: LOGIN_URL }) });
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && !j.error, body: j }; });
        });
    }

    // no server set up yet: open the person's own email app with the invitation already written
    function inviteViaMailApp(m) {
        var me = (D && D.user && D.user.first) || localStorage.getItem("elaraFirstName") || "A friend";
        var subject = me + " invited you to join their Elara smart home";
        var body = "Hi " + m.name + ",\n\n" + me + " has invited you to join their home on Elara.\n\n" +
                   "1. Open " + LOGIN_URL + "\n2. Choose Sign Up and use this email address: " + m.email + "\n\nSee you inside!";
        return ElaraUI.confirm({
            title: "Send the invitation from your email app?",
            message: "Elara can\u2019t send emails by itself yet, so I\u2019ll open your email app with the invitation to " + m.email + " already written.",
            confirmText: "Open email app", icon: "fa-envelope", danger: false
        }).then(function (ok) {
            if (!ok) return false;
            var a = document.createElement("a");
            a.href = "mailto:" + m.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
            document.body.appendChild(a); a.click(); a.remove();
            return true;
        });
    }

    function deliverInvite(m) {
        m.location = "Sending invitation..."; save(); render();

        if (!cfg.inviteEndpoint) {
            return inviteViaMailApp(m).then(function (opened) {
                m.location = opened ? "Invitation drafted in your email app" : "Invitation not sent";
                save(); render();
                if (opened) { log("invited " + m.email + " (email app opened)", "fa-envelope"); toast("Your email app opened. Press send there to finish.", "info"); }
            });
        }

        return inviteViaServer(m).then(function (res) {
            if (res.ok) {
                m.location = "Invitation emailed"; save(); render();
                log("emailed an invitation to " + m.email, "fa-paper-plane");
                toast("Invitation emailed to " + m.email + ".");
            } else if (res.body && res.body.code === "exists") {
                m.location = "Already has an account"; save(); render();
                toast(m.name + " already has an Elara account. Ask them to log in.", "info");
            } else {
                m.location = "Invitation not sent"; save(); render();
                toast("Couldn\u2019t email " + m.email + ": " + ((res.body && res.body.error) || "server error") + ". Use Resend Invite to try again.", "error");
            }
        }).catch(function () {
            m.location = "Invitation not sent"; save(); render();
            toast("Couldn\u2019t reach the invitation service. Check your connection and use Resend Invite.", "error");
        });
    }

    /* ---------- member cards ---------- */
    function cardHTML(m) {
        var pic = "";
        try { pic = localStorage.getItem("elaraProfileImage") || ""; } catch (e) { /* ignore */ }
        var img = m.role === "owner" && pic ? pic : m.avatar;
        var avatar = img ? '<img src="' + esc(img) + '" alt="' + esc(m.name) + '">'
            : '<div class="avatar-placeholder ' + esc(m.color || "") + '">' + esc(m.name.charAt(0).toUpperCase()) + "</div>";
        var dot = m.status === "online" ? '<span class="online-dot"></span>' : "";
        var pending = m.status === "pending";
        return '' +
        '<div class="member-card' + (pending ? " pending-member" : "") + '" data-id="' + m.id + '">' +
            '<div class="member-left"><div class="member-avatar">' + avatar + dot + '</div>' +
                '<div class="member-info"><h3>' + esc(m.name) + '</h3><p>' + esc(m.email) + '</p>' +
                '<span class="member-location"><i class="fa-solid ' + (pending ? "fa-envelope" : "fa-location-dot") + '"></i> ' + esc(m.location || "Home") + '</span></div></div>' +
            '<div class="member-middle"><span class="role-badge ' + (pending ? "guest" : esc(m.role)) + '"><i class="fa-solid ' + (pending ? "fa-user-clock" : roleIcons[m.role] || "fa-user") + '"></i> ' +
                esc(pending ? "Pending" : roleLabels[m.role] || m.role) + '</span></div>' +
            '<div class="member-right"><span class="member-status ' + esc(m.status) + '">' + esc(statusLabels[m.status] || m.status) + '</span>' +
                '<button class="member-menu" type="button" aria-label="Member options" data-menu="' + m.id + '"><i class="fa-solid fa-ellipsis-vertical"></i></button></div>' +
        '</div>';
    }

    function render(list) {
        var box = $("membersList");
        if (!box) return;
        list = list || members;
        box.innerHTML = list.length ? list.map(cardHTML).join("")
            : '<div class="empty-state"><i class="fa-solid fa-users"></i><h3>No members found</h3><p>Try searching for someone else.</p></div>';
        updateStats(); renderPermissions();
    }

    function updateStats() {
        function set(id, v) { var el = $(id); if (el) el.textContent = v; }
        set("totalMembers", members.length);
        set("membersAtHome", members.filter(function (m) { return m.status === "online" && m.location === "Home"; }).length);
        set("homeOwners", members.filter(function (m) { return m.role === "owner"; }).length);
        set("pendingMembers", members.filter(function (m) { return m.status === "pending"; }).length);
    }

    /* ---------- floating menu (lives on <body> so nothing can cover or clip it) ---------- */
    var menuEl = null;
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }

    function openMenu(btn, m) {
        closeMenu();
        var items = [
            '<button type="button" data-action="view"><i class="fa-solid fa-eye"></i> View Profile</button>',
            '<button type="button" data-action="edit"><i class="fa-solid fa-pen"></i> Edit Member</button>'
        ];
        if (m.status === "pending") items.push('<button type="button" data-action="resend"><i class="fa-solid fa-paper-plane"></i> Resend Invite</button>');
        else if (m.role !== "owner") items.push('<button type="button" data-action="presence"><i class="fa-solid fa-' + (m.status === "away" ? "house" : "person-walking-arrow-right") + '"></i> Mark as ' + (m.status === "away" ? "Home" : "Away") + '</button>');
        if (m.role !== "owner") items.push('<button type="button" class="delete-option" data-action="remove"><i class="fa-solid fa-trash"></i> Remove Member</button>');

        menuEl = document.createElement("div");
        menuEl.className = "member-portal";
        menuEl.dataset.id = m.id;
        menuEl.innerHTML = items.join("");
        document.body.appendChild(menuEl);

        var r = btn.getBoundingClientRect(), h = menuEl.offsetHeight, w = menuEl.offsetWidth;
        var top = r.bottom + 6;
        if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 6);
        menuEl.style.top = top + "px";
        menuEl.style.left = Math.max(10, Math.min(window.innerWidth - w - 10, r.right - w)) + "px";
    }

    function openProfile(m) {
        var old = $("memberProfileModal"); if (old) old.remove();
        var perms = m.permissions || ROLE_PERMS[m.role] || {};
        var names = { smartHome: "Smart Home", tasks: "Tasks", shopping: "Shopping", analytics: "Analytics" };
        var ov = document.createElement("div");
        ov.id = "memberProfileModal"; ov.className = "eui-overlay";
        ov.innerHTML =
            '<div class="eui-box member-profile-box">' +
                '<div class="avatar-placeholder big ' + esc(m.color || "") + '">' + esc(m.name.charAt(0).toUpperCase()) + '</div>' +
                '<h3>' + esc(m.name) + '</h3><p>' + esc(m.email) + '</p>' +
                '<div class="mp-grid">' +
                    '<div><small>Role</small><strong>' + esc(roleLabels[m.role] || m.role) + '</strong></div>' +
                    '<div><small>Status</small><strong>' + esc(statusLabels[m.status] || m.status) + '</strong></div>' +
                    '<div><small>Location</small><strong>' + esc(m.location || "Home") + '</strong></div>' +
                '</div>' +
                '<div class="mp-perms">' + Object.keys(names).map(function (k) {
                    return '<span class="' + (perms[k] ? "on" : "off") + '"><i class="fa-solid ' + (perms[k] ? "fa-check" : "fa-xmark") + '"></i> ' + names[k] + '</span>';
                }).join("") + '</div>' +
                '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-r="0">Close</button><button type="button" class="eui-btn primary" data-edit="1">Edit Member</button></div>' +
            '</div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        ov.addEventListener("click", function (e) {
            if (e.target === ov || e.target.closest("[data-r]")) { ov.remove(); }
            else if (e.target.closest("[data-edit]")) { ov.remove(); openModal(m); }
        });
    }

    /* ---------- search ---------- */
    var search = $("memberSearch");
    if (search) {
        search.addEventListener("input", function () {
            var q = search.value.toLowerCase().trim();
            render(members.filter(function (m) {
                return m.name.toLowerCase().indexOf(q) > -1 || m.email.toLowerCase().indexOf(q) > -1 ||
                       (roleLabels[m.role] || m.role).toLowerCase().indexOf(q) > -1;
            }));
        });
    }

    /* ---------- invite / edit modal ---------- */
    var modal = $("memberModal"), form = $("memberForm");

    function openModal(m) {
        if (!modal) return;
        editingId = m ? m.id : null;
        if (form) form.reset();
        if (m) {
            $("memberName").value = m.name; $("memberEmail").value = m.email;
            var sel = $("memberRole"); if (sel && sel.querySelector('option[value="' + m.role + '"]')) sel.value = m.role;
        }
        var title = modal.querySelector(".modal-header h2"), submit = modal.querySelector(".save-btn");
        if (title) title.textContent = m ? "Edit Member" : "Invite Member";
        if (submit) submit.innerHTML = m ? '<i class="fa-solid fa-floppy-disk"></i> Save Changes' : '<i class="fa-solid fa-paper-plane"></i> Send Invitation';
        modal.classList.add("active"); document.body.style.overflow = "hidden";
    }
    function closeModal() { if (!modal) return; modal.classList.remove("active"); document.body.style.overflow = ""; editingId = null; }

    ["addMemberBtn", "addMemberFab"].forEach(function (id) { var b = $(id); if (b) b.addEventListener("click", function () { openModal(null); }); });
    ["closeMemberModal", "cancelMember"].forEach(function (id) { var b = $(id); if (b) b.addEventListener("click", closeModal); });
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(); closeMenu(); } });

    if (form) {
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var name = $("memberName").value.trim(), email = $("memberEmail").value.trim(), role = $("memberRole").value;
            if (!name || !email) return toast("Please complete all required fields.", "error");
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Please enter a valid email address.", "error");
            if (members.some(function (m) { return m.email.toLowerCase() === email.toLowerCase() && m.id !== editingId; })) return toast("A member with that email already exists.", "error");

            if (editingId !== null) {
                members.forEach(function (m) {
                    if (m.id !== editingId) return;
                    var roleChanged = m.role !== role && m.role !== "owner";
                    m.name = name; m.email = email;
                    if (m.role !== "owner") { m.role = role; if (roleChanged) m.permissions = Object.assign({}, ROLE_PERMS[role]); }
                });
                log(name + "\u2019s details were updated", "fa-user-pen"); toast(name + " was updated.");
            } else {
                var fresh = { id: Date.now(), name: name, email: email, role: role, status: "pending", location: "Sending invitation...", avatar: "",
                               color: avatarColors[members.length % avatarColors.length], permissions: Object.assign({}, ROLE_PERMS[role]) };
                members.push(fresh);
                save(); render(); closeModal();
                deliverInvite(fresh);
                return;
            }
            save(); render(); closeModal();
        });
    }

    /* ---------- clicks ---------- */
    document.addEventListener("click", function (e) {
        var menuBtn = e.target.closest(".member-menu");
        if (menuBtn) {
            var m = find(menuBtn.dataset.menu);
            var same = menuEl && menuEl.dataset.id === String(menuBtn.dataset.menu);
            closeMenu();
            if (m && !same) openMenu(menuBtn, m);
            return;
        }
        var act = e.target.closest(".member-portal [data-action]");
        if (act) {
            var mem = find(menuEl.dataset.id); closeMenu();
            if (!mem) return;
            var a = act.dataset.action;
            if (a === "view") openProfile(mem);
            else if (a === "edit") openModal(mem);
            else if (a === "resend") { deliverInvite(mem); }
            else if (a === "presence") {
                var away = mem.status !== "away";
                mem.status = away ? "away" : "online"; mem.location = away ? "Away" : "Home";
                save(); render(); log(mem.name + " is now " + (away ? "away" : "home"), "fa-location-dot"); toast(mem.name + " marked as " + (away ? "away" : "home") + ".", "info");
            } else if (a === "remove") {
                ElaraUI.confirm({ title: "Remove " + mem.name + "?", message: "They will lose access to your household. You can invite them again later.", confirmText: "Remove member" })
                    .then(function (ok) {
                        if (!ok) return;
                        members = members.filter(function (x) { return x.id !== mem.id; });
                        if (String(permMemberId) === String(mem.id)) permMemberId = null;
                        save(); render(); log(mem.name + " was removed from the household", "fa-user-minus"); toast(mem.name + " was removed.");
                    });
            }
            return;
        }
        if (!e.target.closest(".member-portal")) closeMenu();

        var perm = e.target.closest("[data-perm]");
        if (perm && !perm.disabled) togglePermission(perm.dataset.perm);
    });
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);

    /* ---------- access permissions (per member) ---------- */
    var PERMS = [
        ["smartHome", "Smart Home", "fa-lightbulb", "Control lights and connected devices"],
        ["tasks", "Tasks", "fa-list-check", "View and manage household tasks"],
        ["shopping", "Shopping", "fa-cart-shopping", "Access household shopping lists"],
        ["analytics", "Analytics", "fa-chart-line", "View household usage analytics"]
    ];
    function permTarget() {
        var m = find(permMemberId);
        if (!m) { m = members.filter(function (x) { return x.status !== "pending"; })[0] || members[0]; if (m) permMemberId = m.id; }
        return m;
    }
    function renderPermissions() {
        var list = document.querySelector(".permission-list");
        if (!list) return;
        var panel = list.closest(".panel"), header = panel.querySelector(".panel-header");
        var m = permTarget();
        if (!m) { list.innerHTML = '<p class="perm-empty">Invite a member to manage their access.</p>'; return; }

        var sel = $("permMember");
        if (!sel) {
            sel = document.createElement("select"); sel.id = "permMember"; sel.className = "perm-member-select";
            sel.addEventListener("change", function () { permMemberId = sel.value; renderPermissions(); });
            header.appendChild(sel);
        }
        sel.innerHTML = members.map(function (x) { return '<option value="' + x.id + '"' + (String(x.id) === String(m.id) ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("");

        var perms = m.permissions || (m.permissions = Object.assign({}, ROLE_PERMS[m.role] || {}));
        var locked = m.role === "owner";
        list.innerHTML = PERMS.map(function (p) {
            var on = locked ? true : !!perms[p[0]];
            return '<div class="permission-item"><div class="permission-left"><i class="fa-solid ' + p[2] + '"></i><div><h4>' + p[1] + '</h4><p>' + p[3] + '</p></div></div>' +
                   '<button type="button" class="permission-status ' + (on ? "active" : "inactive") + '" data-perm="' + p[0] + '"' + (locked ? ' disabled title="The home owner always has full access"' : "") + ">" + (on ? "Enabled" : "Disabled") + "</button></div>";
        }).join("");
    }
    function togglePermission(key) {
        var m = permTarget(); if (!m || m.role === "owner") return;
        m.permissions[key] = !m.permissions[key];
        save(); renderPermissions();
        var label = PERMS.filter(function (p) { return p[0] === key; })[0][1];
        log(label + " access " + (m.permissions[key] ? "enabled" : "disabled") + " for " + m.name, "fa-shield-halved");
        toast(label + " access " + (m.permissions[key] ? "enabled" : "disabled") + " for " + m.name + ".", m.permissions[key] ? "success" : "info");
    }

    /* ---------- member activity (real log) ---------- */
    function renderActivity() {
        var panelTitle = Array.prototype.filter.call(document.querySelectorAll(".panel-header h2"), function (h) { return /Member Activity/i.test(h.textContent); })[0];
        var list = panelTitle && panelTitle.closest(".panel").querySelector(".activity-list");
        if (!list || !D) return;
        var items = D.activity(8);
        list.innerHTML = items.length ? items.map(function (a) {
            return '<div class="activity-item"><div class="activity-left"><div class="activity-icon"><i class="fa-solid ' + esc(a.icon || "fa-bolt") + '"></i></div>' +
                   '<div class="activity-info"><h4>' + esc(a.who) + ": " + esc(a.text) + '</h4><p>' + esc(D.ago(a.t)) + '</p></div></div></div>';
        }).join("") : '<div class="empty-state small"><i class="fa-solid fa-clock-rotate-left"></i><p>No activity yet. Things you do around the home show up here.</p></div>';
    }
    setInterval(renderActivity, 30000);

    render();
    renderActivity();
})();
