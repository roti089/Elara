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
    /* ---------------- activity log: everything, filterable, exportable ---------------- */
    var logShown = 15;
    function logArea(a) {
        var t = (a.icon || "") + " " + a.text;
        if (/task|chore|fa-list-check|fa-rotate\b|fa-broom|fa-circle-check/i.test(t)) return "tasks";
        if (/shopping|bought|receipt|warranty|meal|pantry|house stock|used up|ingredient|fa-cart|fa-bag|fa-receipt|fa-utensils|fa-box/i.test(t)) return "shopping";
        if (/event|schedule|calendar|busy|available|away for|fa-calendar/i.test(t)) return "schedule";
        if (/turned|switch|device|geyser|light|automation|load-shedding|electricity|meter|cbi|energy|fa-bolt|fa-fire|fa-robot|fa-plug|fa-gauge/i.test(t)) return "smartHome";
        if (/member|invite|joined|left the|access|role|guest link|fa-user|fa-key/i.test(t)) return "members";
        return "";
    }
    function logEntries() {
        var who = $("logWho").value, area = $("logArea").value, q = $("logSearch").value.toLowerCase().trim();
        return D.activity(300).filter(function (a) {
            if (who && (who === "elara" ? a.who !== "Elara" || a.by : a.by !== who)) return false;
            if (area && logArea(a) !== area) return false;
            if (q && (a.who + " " + a.text).toLowerCase().indexOf(q) < 0) return false;
            return true;
        });
    }
    function renderLogWho() {
        var sel = $("logWho"), cur = sel.value;
        sel.innerHTML = '<option value="">Everyone</option>' + D.members.active().map(function (m) { return '<option value="' + esc(m.userId) + '">' + esc(m.isMe ? m.name + " (you)" : m.name) + "</option>"; }).join("") +
            '<option value="elara">Elara (automatic)</option>';
        sel.value = cur;
    }
    function renderActivity() {
        renderLogWho();
        var items = logEntries(), shown = items.slice(0, logShown), lastDay = "";
        $("memberActivity").innerHTML = shown.length ? shown.map(function (a) {
            var d = new Date(a.t), day = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }), head = "";
            if (day !== lastDay) { head = '<div class="log-day">' + esc(D.util.dayKey(d) === D.util.dayKey() ? "Today" : day) + "</div>"; lastDay = day; }
            return head + '<div class="activity-item' + (a.who === "Elara" && !a.by ? " by-elara" : "") + '"><div class="activity-left"><div class="activity-icon"><i class="fa-solid ' + esc(a.icon) + '"></i></div><div class="activity-info"><h4>' + esc(a.who + " " + a.text) + "</h4><p>" +
                esc(d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })) + " • " + esc(D.ago(a.t)) + "</p></div></div></div>";
        }).join("") : '<p class="perm-empty">' + (D.activity(1).length ? "Nothing matches." : "No activity yet.") + "</p>";
        $("logMore").hidden = items.length <= logShown;
        $("logMore").textContent = "Show more (" + (items.length - logShown) + " older)";
    }
    ["logWho", "logArea"].forEach(function (id) { $(id).addEventListener("change", function () { logShown = 15; renderActivity(); }); });
    $("logSearch").addEventListener("input", function () { logShown = 15; renderActivity(); });
    $("logMore").addEventListener("click", function () { logShown += 30; renderActivity(); });
    $("logExport").addEventListener("click", function () {
        var F = window.ElaraFeatures, items = logEntries();
        if (!F || !items.length) return UI.toast("Nothing to export.", "info");
        F.csv("elara-activity-" + D.util.dayKey() + ".csv", ["Date", "Time", "Who", "What", "Area"], items.map(function (a) {
            var d = new Date(a.t);
            return [D.util.dayKey(d), d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }), a.who, a.text, logArea(a) || "other"];
        }));
        UI.toast(items.length + " entr" + (items.length === 1 ? "y" : "ies") + " downloaded.");
    });

    /* ---------------- guest links (owner only): a view-only page that expires ---------------- */
    var GUEST_AREAS = [["tasks", "Tasks for the next 2 weeks"], ["schedule", "Events for the next 2 weeks"], ["shopping", "Shopping list"], ["smartHome", "Which switches are on (view only)"]];
    function guestBase() {
        var cfg = window.ELARA_CONFIG || {};
        var base = (cfg.siteUrl || (location.origin + location.pathname.replace(/[^/]*$/, ""))).replace(/\/?$/, "/");
        return base + "guest.html#t=";
    }
    function newToken() {
        var b = new Uint8Array(32); crypto.getRandomValues(b);
        return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    var guestCache = [];
    function loadGuests() {
        if (!isOwner() || !D.user || !(window.ELARA_CONFIG || {}).supabaseUrl) {
            $("guestList").innerHTML = '<p class="perm-empty">' + (D.user ? "Only the home owner can make guest links." : "Log in to make guest links.") + "</p>";
            return Promise.resolve();
        }
        return D.getClient().then(function (c) { return c.from("elara_guest_links").select("id,token,label,areas,note,expires_at,revoked,created_at,last_viewed,views").eq("owner_id", D.user.id).order("created_at", { ascending: false }).limit(30); })
            .then(function (r) {
                if (r.error) throw r.error;
                guestCache = r.data || []; renderGuests();
            }).catch(function (e) {
                $("guestList").innerHTML = '<p class="perm-empty">' + (/elara_guest_links|relation|schema cache/i.test(e.message || "") ? "Guest links need the latest elara-setup.sql (README, step 2)." : "Couldn't load guest links: " + esc(e.message)) + "</p>";
            });
    }
    function renderGuests() {
        var now = Date.now();
        $("guestList").innerHTML = guestCache.length ? guestCache.map(function (g) {
            var exp = new Date(g.expires_at).getTime(), live = !g.revoked && exp > now;
            var areas = (g.areas || []).map(function (a) { var x = GUEST_AREAS.filter(function (y) { return y[0] === a; })[0]; return x ? x[1].split(" (")[0].replace(/ for the next 2 weeks/, "") : a; });
            return '<div class="guest-row' + (live ? "" : " ended") + '" data-id="' + esc(g.id) + '"><div class="guest-ic"><i class="fa-solid ' + (live ? "fa-key" : "fa-lock") + '"></i></div><div class="guest-main"><strong>' + esc(g.label) + "</strong>" +
                "<small>" + (g.revoked ? "Turned off" : live ? "Works until " + esc(new Date(exp).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) : "Expired " + esc(D.ago(exp).toLowerCase())) +
                " • " + esc(areas.join(", ") || "Notes only") + "</small><small>" + (g.views ? "Opened " + g.views + " time" + (g.views === 1 ? "" : "s") + ", last " + esc(D.ago(new Date(g.last_viewed).getTime()).toLowerCase()) : "Not opened yet") + "</small></div>" +
                '<div class="guest-acts">' + (live ? '<button type="button" class="ghost-btn" data-g="copy"><i class="fa-solid fa-copy"></i> Copy link</button><button type="button" class="ghost-btn danger-ghost" data-g="off">Turn off</button>'
                                                   : '<button type="button" class="ghost-btn" data-g="del" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>') + "</div></div>";
        }).join("") : '<p class="perm-empty">No guest links yet. Make one for a house-sitter: they see only what you tick, and the link stops working when you say.</p>';
    }
    function copyText(t) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
        var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e) { /* ignore */ } ta.remove(); return Promise.resolve();
    }
    function shareLink(g) {
        var url = guestBase() + g.token;
        if (navigator.share) return navigator.share({ title: "Elara: " + g.label, text: "View-only access to the home until " + new Date(g.expires_at).toLocaleDateString() + ".", url: url }).catch(function () { return copyText(url).then(function () { UI.toast("Link copied."); }); });
        return copyText(url).then(function () { UI.toast("Link copied. Send it to your guest."); });
    }
    $("guestNew").addEventListener("click", function () {
        if (!isOwner() || !D.user) return UI.toast("Only the home owner can make guest links.", "error");
        var ov = document.createElement("div");
        ov.className = "eui-overlay";
        ov.innerHTML = '<form class="eui-box eui-form auto-form" novalidate><div class="eui-icon info"><i class="fa-solid fa-key"></i></div><h3>New guest link</h3>' +
            "<p>Anyone with this link can <b>look</b> (never change anything) until it expires.</p>" +
            '<label>Who is it for?<input name="label" maxlength="60" placeholder="e.g. Lerato (house-sitting)"></label>' +
            '<label>Works for<select name="days"><option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="7" selected>1 week</option><option value="14">2 weeks</option><option value="30">30 days</option></select></label>' +
            '<fieldset><legend>What they can see</legend><div class="dev-picks">' + GUEST_AREAS.map(function (a) {
                return '<label><input type="checkbox" name="area" value="' + a[0] + '"' + (a[0] === "tasks" || a[0] === "shopping" ? " checked" : "") + "> " + esc(a[1]) + "</label>";
            }).join("") + "</div></fieldset>" +
            '<label>Notes for them (optional)<textarea name="note" rows="3" maxlength="1000" placeholder="e.g. Feed the dog at 7. Wi-Fi password is on the fridge. Call Thabo on 082 000 0000 if anything goes wrong."></textarea></label>' +
            '<p class="eui-err" aria-live="assertive"></p><div class="eui-actions"><button type="button" class="eui-btn ghost" data-close>Cancel</button><button type="submit" class="eui-btn primary">Make link</button></div></form>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        var f = ov.querySelector("form");
        f.label.focus();
        function shut() { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); }
        ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest("[data-close]")) shut(); });
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            var label = f.label.value.trim().replace(/\s+/g, " "), days = Number(f.days.value), note = f.note.value.trim(),
                areas = Array.prototype.map.call(f.querySelectorAll('[name="area"]:checked'), function (x) { return x.value; });
            f.querySelectorAll(".invalid").forEach(function (x) { x.classList.remove("invalid"); });
            var err = label.length < 2 || label.length > 60 || /[<>]/.test(label) ? ["label", "Say who it's for (2 to 60 characters)."]
                : [1, 2, 3, 7, 14, 30].indexOf(days) < 0 ? ["days", "Choose how long it works."]
                : !areas.length && !note ? [null, "Tick at least one thing they can see, or write a note."]
                : note.length > 1000 ? ["note", "Keep the notes under 1000 characters."] : null;
            if (err) { f.querySelector(".eui-err").textContent = err[1]; if (err[0]) { f[err[0]].classList.add("invalid"); f[err[0]].focus(); } return; }
            var btn = f.querySelector('[type="submit"]'); btn.disabled = true;
            var row = { owner_id: D.user.id, token: newToken(), label: label, areas: areas, note: note || null, expires_at: new Date(Date.now() + days * 86400000).toISOString() };
            D.getClient().then(function (c) { return c.from("elara_guest_links").insert(row).select("id,token,label,areas,note,expires_at,revoked,created_at,last_viewed,views").single(); })
                .then(function (r) {
                    if (r.error) throw r.error;
                    guestCache.unshift(r.data); renderGuests(); shut();
                    D.log("made a guest link for " + label + " (" + days + " day" + (days === 1 ? "" : "s") + ")", "fa-key");
                    shareLink(r.data);
                }).catch(function (e2) { btn.disabled = false; f.querySelector(".eui-err").textContent = /elara_guest_links|relation/i.test(e2.message || "") ? "Run the latest elara-setup.sql first (README, step 2)." : "Couldn't make the link: " + e2.message; });
        });
    });
    $("guestList").addEventListener("click", function (e) {
        var b = e.target.closest("[data-g]"); if (!b) return;
        var g = guestCache.filter(function (x) { return x.id === b.closest("[data-id]").dataset.id; })[0]; if (!g) return;
        if (b.dataset.g === "copy") return shareLink(g);
        if (b.dataset.g === "off") return UI.confirm({ title: "Turn off " + g.label + "'s link?", message: "It stops working straight away.", confirmText: "Turn off" }).then(function (ok) {
            if (!ok) return;
            D.getClient().then(function (c) { return c.from("elara_guest_links").update({ revoked: true }).eq("id", g.id); }).then(function (r) {
                if (r.error) throw r.error; g.revoked = true; renderGuests(); D.log("turned off the guest link for " + g.label, "fa-key"); UI.toast("Link turned off.");
            }).catch(function (e2) { UI.toast("Couldn't turn it off: " + e2.message, "error"); });
        });
        if (b.dataset.g === "del") D.getClient().then(function (c) { return c.from("elara_guest_links").delete().eq("id", g.id); }).then(function (r) {
            if (r.error) throw r.error; guestCache = guestCache.filter(function (x) { return x.id !== g.id; }); renderGuests();
        }).catch(function (e2) { UI.toast("Couldn't delete it: " + e2.message, "error"); });
    });
    loadGuests();

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
