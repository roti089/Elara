/* ==========================================================
            ELARA MEMBERS
   - roster comes from Supabase (elara_household_links + elara_profiles)
   - the owner invites people and chooses exactly what each may
     see (Hidden / View / Edit for every area)
   - members see the same list, their own access, and can leave
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI;
    if (!D) return;
    window.ElaraPageLive = true;

    var AREAS = [["tasks", "Tasks", "fa-list-check"], ["shopping", "Shopping", "fa-cart-shopping"], ["schedule", "Schedule", "fa-calendar-days"],
                 ["smartHome", "Smart Home", "fa-lightbulb"], ["analytics", "Analytics", "fa-chart-simple"], ["reports", "Reports", "fa-file-lines"]];
    var LEVELS = [["none", "Hidden"], ["view", "View"], ["edit", "Edit"]];
    var ROLE_LABEL = { owner: "Home Owner", adult: "Adult", member: "Member", guest: "Guest" };
    var ROLE_ICON = { owner: "fa-crown", adult: "fa-user-tie", member: "fa-user", guest: "fa-user-clock" };
    var COLORS = ["blue", "pink", "orange", ""];
    var query = "", editing = null;

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function isOwner() { return D.household.isOwner; }
    function perms(m) { return m.role === "owner" ? null : Object.assign({}, D.members.ROLE_PERMS[m.role] || D.members.ROLE_PERMS.member, m.permissions || {}); }
    function level(m, area) { return m.role === "owner" ? "edit" : perms(m)[area] || "none"; }

    /* ---------------- render ---------------- */
    function render() {
        var all = D.members.all(), pres = D.presence.all();
        var active = all.filter(function (m) { return m.status === "active"; });
        $("totalMembers").textContent = active.length;
        $("membersAtHome").textContent = active.filter(function (m) { return !pres[m.userId] || pres[m.userId].state !== "away"; }).length;
        $("homeOwners").textContent = active.filter(function (m) { return m.role === "owner" || m.role === "adult"; }).length;
        $("pendingMembers").textContent = all.filter(function (m) { return m.status === "pending"; }).length;
        $("membersSubtitle").textContent = isOwner() ? "You own this home. Invite people and decide what each may see." : "You're a " + (ROLE_LABEL[D.access.role] || "member") + " in this home.";
        document.querySelectorAll(".owner-only").forEach(function (el) { el.hidden = !isOwner(); });
        document.querySelectorAll(".member-only").forEach(function (el) { el.hidden = isOwner() || !D.user; });

        var list = all.filter(function (m) { return !query || (m.name + " " + m.email + " " + (ROLE_LABEL[m.role] || "")).toLowerCase().indexOf(query) > -1; });
        $("membersList").innerHTML = list.length ? list.map(function (m, i) {
            var away = m.status === "active" && pres[m.userId] && pres[m.userId].state === "away";
            var status = m.status === "pending" ? ["pending", "Invite sent"] : away ? ["away", "Away"] : ["online", "Home"];
            var avatar = m.avatar ? '<img src="' + esc(m.avatar) + '" alt="">' : '<div class="avatar-placeholder ' + COLORS[i % COLORS.length] + '">' + esc((m.name || "?").charAt(0).toUpperCase()) + "</div>";
            var acts = [];
            if (m.status === "active" && m.isMe) acts.push('<button type="button" class="mact" data-act="presence">' + (away ? '<i class="fa-solid fa-house"></i> Mark home' : '<i class="fa-solid fa-plane-departure"></i> Mark away') + "</button>");
            if (isOwner() && m.role !== "owner") {
                acts.push('<button type="button" class="mact" data-act="edit"><i class="fa-solid fa-sliders"></i> Access</button>');
                if (m.status === "pending") acts.push('<button type="button" class="mact" data-act="resend"><i class="fa-solid fa-paper-plane"></i> Resend</button>');
                acts.push('<button type="button" class="mact danger" data-act="remove"><i class="fa-solid fa-user-minus"></i> Remove</button>');
            }
            return '<div class="member-card" data-key="' + esc(m.id) + '"><div class="member-left"><div class="member-avatar">' + avatar + (m.status === "active" && !away ? '<span class="online-dot"></span>' : "") + "</div>" +
                '<div class="member-info"><h3>' + esc(m.name + (m.isMe ? " (you)" : "")) + "</h3><p>" + esc(m.email || "") + "</p>" +
                '<span class="member-location"><i class="fa-solid fa-key"></i> ' + esc(accessSummary(m)) + "</span></div></div>" +
                '<div class="member-middle"><span class="role-badge ' + esc(m.role) + '"><i class="fa-solid ' + (ROLE_ICON[m.role] || "fa-user") + '"></i> ' + esc(ROLE_LABEL[m.role] || m.role) + "</span></div>" +
                '<div class="member-right"><span class="member-status ' + status[0] + '">' + status[1] + '</span><div class="member-actions">' + acts.join("") + "</div></div></div>";
        }).join("") : '<div class="empty-state"><i class="fa-solid fa-users-slash"></i><p>' + (query ? "No one matches your search." : "No members yet.") + "</p></div>";

        renderPermTable(all);
        renderActivity();
    }
    function accessSummary(m) {
        if (m.role === "owner") return "Full access";
        var p = perms(m), edit = [], view = [];
        AREAS.forEach(function (a) { if (p[a[0]] === "edit") edit.push(a[1]); else if (p[a[0]] === "view") view.push(a[1]); });
        return (edit.length ? "Edits " + edit.join(", ") : "") + (edit.length && view.length ? "; " : "") + (view.length ? "views " + view.join(", ") : "") || "Only the dashboard";
    }
    function renderPermTable(all) {
        var people = isOwner() ? all : all.filter(function (m) { return m.isMe || m.role === "owner"; });
        $("permSubtitle").textContent = isOwner() ? "Click Access on a member to change this" : "Your access is set by the home owner";
        $("permTable").innerHTML = "<thead><tr><th>Area</th>" + people.map(function (m) { return "<th>" + esc(m.isMe ? "You" : m.name) + (m.status === "pending" ? "<small>invited</small>" : "") + "</th>"; }).join("") + "</tr></thead><tbody>" +
            AREAS.map(function (a) {
                return '<tr><th scope="row"><i class="fa-solid ' + a[2] + '"></i> ' + a[1] + "</th>" + people.map(function (m) {
                    var l = level(m, a[0]); return '<td><span class="lvl ' + l + '">' + (l === "edit" ? "Edit" : l === "view" ? "View" : "Hidden") + "</span></td>";
                }).join("") + "</tr>";
            }).join("") + "</tbody>";
    }
    function renderActivity() {
        var items = D.activity(8);
        $("memberActivity").innerHTML = items.length ? items.map(function (a) {
            return '<div class="activity-item"><div class="activity-left"><div class="activity-icon"><i class="fa-solid ' + esc(a.icon) + '"></i></div><div class="activity-info"><h4>' + esc(a.who + " " + a.text) + "</h4><p>" + esc(D.ago(a.t)) + "</p></div></div></div>";
        }).join("") : '<p class="perm-empty">No activity yet.</p>';
    }

    /* ---------------- actions on a member ---------------- */
    $("membersList").addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]"); if (!b) return;
        var key = b.closest(".member-card").dataset.key, m = D.members.all().filter(function (x) { return x.id === key; })[0];
        if (!m) return;
        var act = b.dataset.act;
        if (act === "presence") {
            if (!m.isMe) return UI.toast("Only " + m.name + " can mark themselves home or away.", "error");
            var pres = D.presence.all()[m.userId], away = pres && pres.state === "away";
            D.presence.set(m.userId, away ? "home" : "away");
            D.log((m.isMe ? "is now " : "marked " + m.name + " as ") + (away ? "home" : "away"), away ? "fa-house" : "fa-plane-departure");
            if (!m.isMe) D.notify({ to: [m.userId], kind: "members", title: "You were marked " + (away ? "home" : "away"), body: D.me().first + " changed your status.", href: "dashboard-members.html" });
            render(); return;
        }
        if (!isOwner()) return;
        if (act === "edit") return openModal(m);
        if (act === "resend") {
            if (isLocal() && !/^https?:/i.test((window.ELARA_CONFIG || {}).siteUrl || "")) return UI.toast("Resend from your live site, or set siteUrl in elara-config.js: from this computer the link would point to " + location.host + ".", "error");
            b.disabled = true;
            D.household.invite({ email: m.email, name: m.name, role: m.role, permissions: perms(m), redirectTo: redirectUrl() })
                .then(function (r) { UI.toast(r && r.message ? r.message : "Invitation sent again to " + m.email + "."); })
                .catch(function (err) { UI.toast("Couldn't resend: " + err.message, "error"); }).then(function () { b.disabled = false; });
            return;
        }
        if (act === "remove") {
            UI.confirm({ title: "Remove " + m.name + "?", message: m.status === "pending" ? "Their invitation will be cancelled." : "They will lose access to your home straight away. Their past activity stays in the reports.", confirmText: "Remove" })
                .then(function (ok) {
                    if (!ok) return;
                    return D.household.remove(m.linkId).then(function () {
                        D.log("removed " + m.name + " from the home", "fa-user-minus");
                        UI.toast(m.name + " was removed."); render();
                    });
                }).catch(function (err) { UI.toast("Couldn't remove: " + err.message, "error"); });
        }
    });

    /* ---------------- invite / edit modal ---------------- */
    var modal = $("memberModal"), form = $("memberForm");
    /* invitation links always go to the published site (siteUrl in elara-config.js), even when the owner
       sends them from Live Server on their own computer */
    function redirectUrl() {
        var cfg = window.ELARA_CONFIG || {}, base = location.href;
        if (/^https?:\/\/[^\s]+$/i.test(cfg.siteUrl || "")) base = cfg.siteUrl.replace(/\/?$/, "/");
        return new URL(cfg.loginPage || "Loginpage.html", base).href;
    }
    function isLocal() { return /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) || location.protocol === "file:"; }
    function drawPermGrid(p) {
        $("permGrid").innerHTML = AREAS.map(function (a) {
            return '<label class="perm-row"><span><i class="fa-solid ' + a[2] + '"></i> ' + a[1] + '</span><select data-area="' + a[0] + '" aria-label="' + a[1] + ' access">' +
                LEVELS.map(function (l) { return '<option value="' + l[0] + '"' + (p[a[0]] === l[0] ? " selected" : "") + ">" + l[1] + "</option>"; }).join("") + "</select></label>";
        }).join("");
    }
    function readPerms() {
        var p = {}; $("permGrid").querySelectorAll("select").forEach(function (s) { p[s.dataset.area] = s.value; }); return p;
    }
    function openModal(m) {
        if (!isOwner()) return UI.toast("Only the home owner can invite or change members.", "error");
        if (!D.user && !D.demo) return;
        editing = m || null;
        form.reset(); $("memberError").textContent = "";
        $("memberModalTitle").textContent = m ? "Access for " + m.name : "Invite a Household Member";
        $("memberModalText").textContent = m ? "Changes apply the next time they open a page." : "They get an email. Once they sign up with that address, they join your home.";
        $("memberName").value = m ? m.name : "";
        $("memberEmail").value = m ? m.email : ""; $("memberEmail").disabled = !!m;
        $("memberRole").value = m ? m.role : "member";
        drawPermGrid(m ? perms(m) : D.members.ROLE_PERMS.member);
        $("memberSubmit").innerHTML = m ? '<i class="fa-solid fa-floppy-disk"></i> Save Access' : '<i class="fa-solid fa-paper-plane"></i> Send Invitation';
        modal.classList.add("active"); document.body.style.overflow = "hidden";
        setTimeout(function () { (m ? $("memberRole") : $("memberName")).focus(); }, 50);
    }
    function closeModal() { modal.classList.remove("active"); document.body.style.overflow = ""; editing = null; }
    ["addMemberBtn", "addMemberFab"].forEach(function (id) { $(id).addEventListener("click", function () { openModal(null); }); });
    ["closeMemberModal", "cancelMember"].forEach(function (id) { $(id).addEventListener("click", closeModal); });
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal.classList.contains("active")) closeModal(); });
    $("memberRole").addEventListener("change", function () { drawPermGrid(D.members.ROLE_PERMS[this.value] || D.members.ROLE_PERMS.member); });

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = $("memberName").value.trim().replace(/\s+/g, " "), email = $("memberEmail").value.trim().toLowerCase(), role = $("memberRole").value, p = readPerms(), err = null;
        if (name.length < 2 || name.length > 60) err = "The name must be 2 to 60 characters.";
        else if (/[<>{}]/.test(name) || !/[a-z]/i.test(name)) err = "Please use a real name (letters, no < > { }).";
        else if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) err = "Enter a valid email address.";
        else if (!editing && D.user && email === String(D.user.email || "").toLowerCase()) err = "You're already the owner of this home.";
        else if (!editing && D.members.all().some(function (m) { return (m.email || "").toLowerCase() === email; })) err = "That person is already in your home or has been invited.";
        else if (["adult", "member", "guest"].indexOf(role) < 0) err = "Choose a role.";
        if (err) { $("memberError").textContent = err; return; }
        if (!editing && isLocal() && !/^https?:/i.test((window.ELARA_CONFIG || {}).siteUrl || "")) {
            $("memberError").textContent = "You're on your own computer (" + location.host + "), so the invitation link wouldn't open on anyone else's phone. Put your Vercel address in siteUrl in elara-config.js, or send the invite from the live site.";
            return;
        }
        var btn = $("memberSubmit"); btn.disabled = true;
        var job = editing
            ? D.household.update(editing.linkId, { role: role, permissions: p, name: name }).then(function () {
                  D.log("changed " + name + "'s access", "fa-sliders");
                  if (editing.userId) D.notify({ to: [editing.userId], kind: "members", title: "Your access changed", body: D.me().first + " updated what you can see in Elara.", href: "dashboard-members.html" });
                  UI.toast(name + "'s access was saved.");
              })
            : D.household.invite({ email: email, name: name, role: role, permissions: p, redirectTo: redirectUrl() }).then(function (r) {
                  D.log("invited " + name + " (" + ROLE_LABEL[role] + ")", "fa-user-plus");
                  UI.toast(r && r.demo ? "Demo mode: no email sent." : r && r.message ? r.message : r && r.recordedOnly ? "Invitation saved. Deploy the invite function to send emails (README, step 5)." : "Invitation sent to " + email + ".", r && (r.demo || r.recordedOnly) ? "info" : "success");
                  if (r && r.demo) return;
                  // make sure the invitation was really recorded: an old invite function only sends the email,
                  // and then the person gets a home of their own instead of joining this one
                  return D.members.refresh().then(function (list) {
                      var found = (list || D.members.all()).some(function (m) { return (m.email || "").toLowerCase() === email; });
                      if (!found) UI.confirm({
                          title: "The invitation wasn't recorded",
                          message: "The email went out, but your home has no record of " + email + ", so they would get a home of their own. Your Supabase invite function is an old version: redeploy bright-action from the latest Elara files (README, step 5) and run the latest elara-setup.sql, then invite them again.",
                          confirmText: "OK", cancelText: "Close", icon: "fa-triangle-exclamation", danger: false
                      });
                  });
              });
        job.then(function () { closeModal(); render(); }).catch(function (e2) { $("memberError").textContent = e2.message || "Something went wrong."; })
           .then(function () { btn.disabled = false; });
    });

    /* ---------------- leave ---------------- */
    $("leaveBtn").addEventListener("click", function () {
        UI.confirm({ title: "Leave this household?", message: "You'll lose access to everything shared in this home. Your own account stays.", confirmText: "Leave household" }).then(function (ok) {
            if (!ok) return;
            D.household.leave().then(function () { UI.toast("You left the household."); setTimeout(function () { location.href = "dashboard-content.html"; }, 900); })
                .catch(function (err) { UI.toast("Couldn't leave: " + err.message, "error"); });
        });
    });

    /* ---------------- search ---------------- */
    var s = $("memberSearch");
    if (s) s.addEventListener("input", function () { query = this.value.toLowerCase().trim().slice(0, 60); render(); });

    D.onChange(render);
    document.addEventListener("elara:refresh", render);
    D.members.refresh().then(render);
    if (/[?&]invite=1/.test(location.search)) setTimeout(function () { if (isOwner()) openModal(null); }, 400);
    render();
})();
