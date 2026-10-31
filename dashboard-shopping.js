/* ============================================================
   ELARA SHOPPING
   - shopping list (validated), "bought" items = spending, by person
   - "In the House" pantry, filled automatically when items are bought
   - meal ideas from what's in the house (offline recipes or Elara AI)
   - predictions, receipts (files stay on the device), warranties, price watch
   (theme, logout, dialogs, search: elara-common.js)
   ============================================================ */
(function () {
    "use strict";
    var D = window.ElaraData, UI = window.ElaraUI, F = window.ElaraFeatures, A = window.ElaraAssistant, cfg = window.ELARA_CONFIG || {};
    if (!D) return;
    window.ElaraPageLive = true;

    var CATEGORIES = ["Groceries", "Cleaning", "Household", "Electronics", "Personal Care"];
    var UNITS = ["", "items", "kg", "g", "L", "ml", "pack", "bottle", "can", "loaf", "dozen"];
    var DAY = 86400000;

    function $(s, r) { return (r || document).querySelector(s); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function money(n) { return "R" + Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function canEdit() { return D.can("shopping", "edit"); }
    function me() { return D.me(); }
    function norm(n) { return String(n || "").toLowerCase().replace(/\s+/g, " ").trim(); }
    function iconFor(c) { return c === "Cleaning" ? "fa-bottle-water" : c === "Electronics" ? "fa-plug" : c === "Personal Care" ? "fa-pump-soap" : c === "Household" ? "fa-house" : "fa-cart-shopping"; }
    function load(k) { return D.util.load(k, []); }
    function save(k, v) { D.util.save(k, v); }

    function items() { return load("elaraShoppingItems"); }
    function bought() { return load("elaraCartItems"); }
    function pantry() { return load("elaraPantry"); }
    function isBought(id) { return bought().some(function (c) { return c.id === id; }); }
    function listItems() { return items().filter(function (i) { return !isBought(i.id); }); }

    /* demo data only when nobody is logged in */
    if (D.demo && !localStorage.getItem("elaraShoppingItems")) {
        save("elaraShoppingItems", [
            { id: 1, name: "Milk", details: "2 Litres • Woolworths", price: 38.99, qty: 1, category: "Groceries", icon: "fa-cart-shopping", by: "demo-1", byName: "Justin" },
            { id: 2, name: "Eggs", details: "30 Pack", price: 79.99, qty: 1, category: "Groceries", icon: "fa-egg", by: "demo-2", byName: "Nkosazana" },
            { id: 3, name: "Dishwashing Liquid", details: "750ml", price: 42.5, qty: 1, category: "Cleaning", icon: "fa-bottle-water", by: "demo-1", byName: "Justin" }
        ]);
        save("elaraPantry", [
            { id: 11, name: "Rice", qty: 2, unit: "kg", category: "Groceries", addedAt: Date.now() - 5 * DAY },
            { id: 12, name: "Onions", qty: 6, unit: "items", category: "Groceries", addedAt: Date.now() - 3 * DAY },
            { id: 13, name: "Chicken", qty: 1, unit: "kg", category: "Groceries", addedAt: Date.now() - DAY },
            { id: 14, name: "Tomatoes", qty: 4, unit: "items", category: "Groceries", addedAt: Date.now() - DAY }
        ]);
    }

    /* ---------------- validation ---------------- */
    function validateItem(v) {
        if (v.name.length < 2 || v.name.length > 60) return "The product name must be 2 to 60 characters.";
        if (!/[a-z]/i.test(v.name)) return "The product name needs at least one letter.";
        if (v.details.length > 80) return "Details can be at most 80 characters.";
        var price = Number(v.price);
        if (v.price === "" || !isFinite(price) || price < 0 || price > 100000) return "Enter a price from R0 to R100 000.";
        if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) return "Use at most 2 decimals for the price.";
        var qty = Number(v.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 99) return "Quantity must be a whole number from 1 to 99.";
        if (CATEGORIES.indexOf(v.category) === -1) return "Choose a category.";
        return null;
    }

    /* ---------------- list ---------------- */
    var filterCat = "", sortBy = "newest", query = "";
    function visibleList() {
        var list = listItems().filter(function (i) {
            if (filterCat && i.category !== filterCat) return false;
            if (query && (i.name + " " + (i.details || "")).toLowerCase().indexOf(query) === -1) return false;
            return true;
        });
        if (sortBy === "az") list.sort(function (a, b) { return a.name.localeCompare(b.name); });
        else if (sortBy === "low") list.sort(function (a, b) { return a.price - b.price; });
        else if (sortBy === "high") list.sort(function (a, b) { return b.price - a.price; });
        else list.sort(function (a, b) { return (b.createdAt || b.id) - (a.createdAt || a.id); });
        return list;
    }
    function rowHTML(i) {
        var nm = esc(i.name), edit = canEdit();
        return '<div class="shopping-item" data-id="' + esc(i.id) + '"><div class="item-info"><i class="fa-solid ' + esc(i.icon || iconFor(i.category)) + '"></i>' +
            "<div><h3>" + nm + (i.qty > 1 ? ' <small>×' + esc(i.qty) + "</small>" : "") + "</h3><p>" + esc([i.details, i.category].filter(Boolean).join(" • ")) + (i.byName ? " • added by " + esc(i.byName) : "") + "</p></div></div>" +
            '<div class="item-right"><span class="price' + (i.price ? "" : " no-price") + '"' + (i.price ? "" : ' title="No price yet: press the pencil to add one"') + ">" +
            (i.price ? money(i.price * (i.qty || 1)) + (i.qty > 1 ? "<small>" + money(i.price) + " each</small>" : "") : "No price") + "</span>" +
            (edit ? '<button type="button" class="buy-btn" data-act="buy">Bought</button><div class="item-actions">' +
                '<button type="button" class="icon-act" data-act="edit" title="Edit" aria-label="Edit ' + nm + '"><i class="fa-solid fa-pen"></i></button>' +
                '<button type="button" class="icon-act danger" data-act="delete" title="Delete" aria-label="Delete ' + nm + '"><i class="fa-solid fa-trash"></i></button></div>' : "") +
            "</div></div>";
    }
    function renderList() {
        var list = visibleList();
        $("#listCount").textContent = listItems().length + " item" + (listItems().length === 1 ? "" : "s");
        $("#shoppingList").innerHTML = list.length ? list.map(rowHTML).join("")
            : '<div class="empty-shopping"><i class="fa-solid fa-cart-shopping"></i><p>' + (listItems().length ? "No items match." : "Your shopping list is empty.") + "</p></div>";
        var recent = bought().slice().sort(function (a, b) { return b.addedAt - a.addedAt; }).slice(0, 6);
        $("#boughtList").innerHTML = recent.length ? recent.map(function (c) {
            return '<div class="bought-row" data-id="' + esc(c.id) + '"><span><i class="fa-solid fa-check"></i> ' + esc(c.name) + (c.qty > 1 ? " ×" + esc(c.qty) : "") +
                "<small>" + esc(c.byName || "") + " • " + esc(D.ago(c.addedAt)) + "</small></span><strong>" + money(c.price * (c.qty || 1)) + "</strong>" +
                (canEdit() ? '<button type="button" class="icon-act" data-act="again" title="Add to the list again" aria-label="Add ' + esc(c.name) + ' again"><i class="fa-solid fa-rotate-right"></i></button>' +
                 '<button type="button" class="icon-act" data-act="unbuy" title="Not bought (undo)" aria-label="Undo"><i class="fa-solid fa-rotate-left"></i></button>' : "") + "</div>";
        }).join("") : '<p class="muted">Nothing bought yet. Press “Bought” on an item when you buy it.</p>';
    }

    function openItemForm(item) {
        if (!canEdit()) return UI.toast("You can view Shopping but not change it.", "error");
        UI.form({
            title: item ? "Edit item" : "Add to the shopping list", icon: "fa-cart-plus", submitText: item ? "Save changes" : "Add item",
            fields: [
                { name: "name", label: "Product", value: item ? item.name : "", required: true, maxlength: 60, placeholder: "e.g. Brown bread" },
                { name: "details", label: "Details (optional)", value: item ? item.details : "", maxlength: 80, placeholder: "e.g. 700g • Checkers" },
                { name: "price", label: "Price each (R)", type: "number", value: item ? item.price : "", min: 0, max: 100000, step: "0.01", required: true },
                { name: "qty", label: "Quantity", type: "number", value: item ? (item.qty || 1) : 1, min: 1, max: 99, step: 1, required: true },
                { name: "category", label: "Category", type: "select", value: item ? item.category : "Groceries", options: CATEGORIES }
            ],
            validate: function (v) {
                var e = validateItem(v); if (e) return e;
                var dup = listItems().some(function (x) { return (!item || x.id !== item.id) && norm(x.name) === norm(v.name); });
                return dup ? "“" + v.name + "” is already on the list. Edit it to change the quantity." : null;
            }
        }).then(function (v) {
            if (!v) return;
            var m = me(), list = items(), data = { name: v.name, details: v.details, price: Math.round(Number(v.price) * 100) / 100, qty: Number(v.qty), category: v.category, icon: iconFor(v.category) };
            if (item) {
                list.forEach(function (x) { if (x.id === item.id) Object.assign(x, data, { updatedAt: Date.now() }); });
                save("elaraShoppingItems", list);
                D.log("updated " + v.name + " on the shopping list", "fa-pen");
                UI.toast(v.name + " updated.");
            } else {
                list.push(Object.assign({ id: Date.now(), by: m.id, byName: m.first, createdAt: Date.now(), status: "Pending" }, data));
                save("elaraShoppingItems", list);
                D.log("added " + v.name + " to the shopping list", "fa-cart-plus");
                D.notify({ to: "household", kind: "shopping", title: "Added to the shopping list", body: m.first + " added " + v.name + (v.qty > 1 ? " ×" + v.qty : "") + ".", href: "dashboard-shopping.html" });
                UI.toast(v.name + " added to the list.");
            }
            renderAll();
        });
    }

    function markBought(item) {
        UI.form({
            title: "Bought " + item.name + "?", icon: "fa-bag-shopping", submitText: "Mark as bought",
            text: "Check what you paid. It counts towards your spending and goes into “In the House”.",
            fields: [
                { name: "price", label: "Price paid each (R)", type: "number", value: item.price, min: 0, max: 100000, step: "0.01", required: true },
                { name: "qty", label: "Quantity", type: "number", value: item.qty || 1, min: 1, max: 99, step: 1, required: true },
                { name: "expires", label: "Best before (optional, Elara reminds you)", type: "date", value: F ? F.expiry.suggest(item.name, item.category) : "", min: D.util.dayKey() }
            ],
            validate: function (v) {
                if (v.expires && (!/^\d{4}-\d{2}-\d{2}$/.test(v.expires) || v.expires < D.util.dayKey())) return { field: "expires", msg: "The best-before date can't be in the past. Leave it empty if there isn't one." };
                return validateItem({ name: item.name, details: "", price: v.price, qty: v.qty, category: item.category || "Groceries" });
            }
        }).then(function (v) {
            if (!v) return;
            var m = me(), price = Math.round(Number(v.price) * 100) / 100, qty = Number(v.qty);
            var cart = bought();
            cart.push({ id: item.id, name: item.name, price: price, qty: qty, category: item.category, addedAt: Date.now(), by: m.id, byName: m.first });
            save("elaraCartItems", cart);
            addToPantry(item.name, qty, item.category, v.expires);
            D.log("bought " + item.name + " (" + money(price * qty) + ")", "fa-bag-shopping");
            D.notify({ to: "household", kind: "shopping", title: "Shopping done", body: m.first + " bought " + item.name + " for " + money(price * qty) + ".", href: "dashboard-shopping.html" });
            UI.toast(item.name + " marked as bought.");
            renderAll();
        });
    }
    function addToPantry(name, qty, category, expires) {
        var p = pantry(), m = me(), ex = p.filter(function (x) { return !x.usedUp && norm(x.name) === norm(name); })[0];
        if (ex) {
            ex.qty = Math.min(999, (Number(ex.qty) || 0) + qty); ex.updatedAt = Date.now();
            if (expires && (!ex.expires || expires < ex.expires)) ex.expires = expires;      // the older stock goes off first
        }
        else p.push({ id: Date.now() + Math.floor(Math.random() * 1000), name: name, qty: qty, unit: "items", category: category || "Groceries", addedAt: Date.now(), by: m.id, byName: m.first, expires: expires || undefined });
        save("elaraPantry", p);
    }

    $("#shoppingList").addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]"); if (!b || !canEdit()) return;
        var id = Number(b.closest("[data-id]").dataset.id), item = items().filter(function (x) { return x.id === id; })[0];
        if (!item) return;
        if (b.dataset.act === "buy") markBought(item);
        else if (b.dataset.act === "edit") openItemForm(item);
        else if (b.dataset.act === "delete") UI.confirm({ title: "Delete " + item.name + "?", message: "It will be removed from the shopping list for everyone.", confirmText: "Delete item" }).then(function (ok) {
            if (!ok) return;
            save("elaraShoppingItems", items().filter(function (x) { return x.id !== id; }));
            D.log("removed " + item.name + " from the shopping list", "fa-trash"); UI.toast(item.name + " deleted."); renderAll();
        });
    });
    $("#boughtList").addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]"); if (!b || !canEdit()) return;
        var id = Number(b.closest("[data-id]").dataset.id), c = bought().filter(function (x) { return x.id === id; })[0];
        if (!c) return;
        if (b.dataset.act === "again") {
            var orig = items().filter(function (x) { return x.id === id; })[0] || c, m = me(), list = items();
            if (listItems().some(function (x) { return norm(x.name) === norm(c.name); })) return UI.toast(c.name + " is already on the list.", "info");
            list.push({ id: Date.now(), name: c.name, details: orig.details || "", price: c.price, qty: c.qty || 1, category: c.category || "Groceries", icon: iconFor(c.category), by: m.id, byName: m.first, createdAt: Date.now(), status: "Pending" });
            save("elaraShoppingItems", list); D.log("added " + c.name + " to the list again", "fa-rotate-right"); UI.toast(c.name + " is on the list again."); renderAll();
        } else if (b.dataset.act === "unbuy") {
            save("elaraCartItems", bought().filter(function (x) { return x.id !== id; }));
            D.log("undid buying " + c.name, "fa-rotate-left"); UI.toast(c.name + " is back on the list.", "info"); renderAll();
        }
    });
    $(".add-item").addEventListener("click", function () { openItemForm(null); });
    $("#productSearch").addEventListener("input", function () { query = this.value.toLowerCase().trim(); renderList(); });
    $("#categoryFilter").addEventListener("change", function () { filterCat = this.value; renderList(); });
    $("#sortBy").addEventListener("change", function () { sortBy = this.value; renderList(); });

    /* ---------------- in the house (pantry) ---------------- */
    function expiryOf(x) { return F ? F.expiry.info(x) : null; }
    function renderPantry() {
        var p = pantry().filter(function (x) { return !x.usedUp; }).sort(function (a, b) {
            var ea = a.expires || "9999", eb = b.expires || "9999";
            return ea.localeCompare(eb) || a.name.localeCompare(b.name);
        });
        $("#inHouseCount").textContent = p.length;
        var soon = p.filter(function (x) { var e = expiryOf(x); return e && e.days <= 3; });
        $("#inHouseNote").textContent = soon.length ? soon.length + " to use soon" : "Food and supplies at home";
        var us = $("#useSoon");
        us.hidden = !soon.length;
        if (soon.length) {
            us.innerHTML = '<strong><i class="fa-solid fa-hourglass-half"></i> Use these first</strong><p>' + soon.map(function (x) { var e = expiryOf(x); return '<span class="exp ' + e.cls + '">' + esc(x.name) + " • " + esc(e.label.toLowerCase()) + "</span>"; }).join("") + "</p>";
        }
        $("#pantryList").innerHTML = p.length ? '<div class="pantry-grid">' + p.map(function (x) {
            var age = Math.floor((Date.now() - (x.addedAt || Date.now())) / DAY), e = expiryOf(x);
            return '<div class="pantry-item' + (e && e.cls ? " exp-" + e.cls : "") + '" data-id="' + esc(x.id) + '"><div><strong>' + esc(x.name) + "</strong><small>" + esc(x.qty) + " " + esc(x.unit === "items" && Number(x.qty) === 1 ? "item" : x.unit || "") +
                (e ? " • " + esc(e.label) : age ? " • " + age + "d" : "") + "</small></div>" +
                (canEdit() ? '<div class="pantry-acts"><button type="button" class="icon-act" data-act="date" title="Best-before date" aria-label="Best-before date for ' + esc(x.name) + '"><i class="fa-regular fa-calendar"></i></button><button type="button" class="icon-act" data-act="use" title="Use one" aria-label="Use one ' + esc(x.name) + '"><i class="fa-solid fa-minus"></i></button>' +
                 '<button type="button" class="icon-act" data-act="add" title="Add one" aria-label="Add one ' + esc(x.name) + '"><i class="fa-solid fa-plus"></i></button>' +
                 '<button type="button" class="icon-act danger" data-act="gone" title="Used up" aria-label="' + esc(x.name) + ' used up"><i class="fa-solid fa-check"></i></button></div>' : "") + "</div>";
        }).join("") + "</div>" : '<p class="muted">Nothing recorded yet. Items you mark as bought appear here, or press Add.</p>';
    }
    $("#pantryList").addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]"); if (!b || !canEdit()) return;
        var id = Number(b.closest("[data-id]").dataset.id), p = pantry(), x = p.filter(function (y) { return y.id === id; })[0];
        if (!x) return;
        if (b.dataset.act === "date") {
            return UI.form({
                title: "Best before: " + x.name, icon: "fa-hourglass-half", submitText: "Save",
                text: "Elara reminds you the day before. Leave it empty if it doesn't go off.",
                fields: [{ name: "expires", label: "Best before", type: "date", value: x.expires || (F ? F.expiry.suggest(x.name, x.category) : ""), min: D.util.dayKey() }],
                validate: function (v) { return v.expires && v.expires < D.util.dayKey() ? { field: "expires", msg: "Choose today or a later day, or leave it empty." } : null; }
            }).then(function (v) {
                if (!v) return;
                var list = pantry(), y = list.filter(function (z) { return z.id === id; })[0]; if (!y) return;
                if (v.expires) y.expires = v.expires; else delete y.expires;
                y.updatedAt = Date.now(); save("elaraPantry", list); renderAll();
            });
        }
        if (b.dataset.act === "add") x.qty = Math.min(999, (Number(x.qty) || 0) + 1);
        else if (b.dataset.act === "use") { x.qty = Math.max(0, (Number(x.qty) || 1) - 1); if (!x.qty) { x.usedUp = true; x.usedAt = Date.now(); } }
        else { x.usedUp = true; x.usedAt = Date.now(); D.log(x.name + " is used up", "fa-box-open"); }
        x.updatedAt = Date.now();
        save("elaraPantry", p.filter(function (y) { return !y.usedUp || Date.now() - y.usedAt < 60 * DAY; }));
        if (x.usedUp && !listItems().some(function (y) { return norm(y.name) === norm(x.name); })) {
            UI.confirm({ title: x.name + " is finished", message: "Add it to the shopping list?", confirmText: "Add to list", danger: false, icon: "fa-cart-plus" }).then(function (ok) {
                if (!ok) return;
                var last = bought().filter(function (c) { return norm(c.name) === norm(x.name); }).pop(), list = items(), m = me();
                list.push({ id: Date.now(), name: x.name, details: "", price: last ? last.price : 0, qty: 1, category: x.category || "Groceries", icon: iconFor(x.category), by: m.id, byName: m.first, createdAt: Date.now(), status: "Pending" });
                save("elaraShoppingItems", list); renderAll();
            });
        }
        renderAll();
    });
    $("#addPantryBtn").addEventListener("click", function () {
        if (!canEdit()) return;
        UI.form({
            title: "Add to “In the House”", icon: "fa-box-open", submitText: "Add",
            fields: [
                { name: "name", label: "Item", required: true, maxlength: 60, placeholder: "e.g. Maize meal" },
                { name: "qty", label: "Quantity", type: "number", value: 1, min: 0.1, max: 999, step: "0.1", required: true },
                { name: "unit", label: "Unit", type: "select", value: "items", options: UNITS.filter(Boolean) },
                { name: "category", label: "Category", type: "select", value: "Groceries", options: CATEGORIES },
                { name: "expires", label: "Best before (optional)", type: "date", value: "", min: D.util.dayKey() }
            ],
            validate: function (v) {
                if (v.name.length < 2 || v.name.length > 60 || !/[a-z]/i.test(v.name)) return "The item name must be 2 to 60 characters with at least one letter.";
                var q = Number(v.qty); if (!isFinite(q) || q <= 0 || q > 999) return "Quantity must be more than 0 and at most 999.";
                if (v.expires && v.expires < D.util.dayKey()) return { field: "expires", msg: "The best-before date can't be in the past." };
                return null;
            }
        }).then(function (v) {
            if (!v) return;
            var p = pantry(), m = me(), ex = p.filter(function (x) { return !x.usedUp && norm(x.name) === norm(v.name); })[0];
            if (ex) { ex.qty = Math.min(999, Number(ex.qty) + Number(v.qty)); ex.unit = v.unit; if (v.expires && (!ex.expires || v.expires < ex.expires)) ex.expires = v.expires; }
            else p.push({ id: Date.now(), name: v.name, qty: Number(v.qty), unit: v.unit, category: v.category, addedAt: Date.now(), by: m.id, byName: m.first, expires: v.expires || undefined });
            save("elaraPantry", p); D.log("added " + v.name + " to the house stock", "fa-box-open"); renderAll();
        });
    });
    $("#mealIdeasBtn").addEventListener("click", function () {
        var box = $("#mealIdeas"), btn = this, items2 = window.ElaraAssistant ? ElaraAssistant.pantry() : [];
        box.hidden = false;
        if (!items2.length) { box.textContent = "Add what's in the house first, then I can suggest meals."; return; }
        var local = ElaraAssistant.meals(items2);
        box.innerHTML = local.length ? "<strong>You could make:</strong><ul>" + local.map(function (r) {
            return "<li><b>" + esc(r.name) + "</b> (" + r.time + " min) • uses " + esc(r.uses.join(", ")) + (r.missing.length ? '<br><small>Still need: ' + esc(r.missing.join(", ")) + "</small>" : "<br><small>You have everything</small>") + "</li>";
        }).join("") + "</ul>" : "<p>I couldn't match a full recipe with what's here.</p>";
        if ((window.ELARA_CONFIG || {}).aiEndpoint && D.user) {
            btn.disabled = true;
            box.insertAdjacentHTML("beforeend", '<p class="ai-wait"><i class="fa-solid fa-robot"></i> Asking Elara AI for more ideas...</p>');
            ElaraAssistant.handle("What meals can I cook with what's in the house?").then(function (reply) {
                var w = box.querySelector(".ai-wait"); if (w) w.remove();
                box.insertAdjacentHTML("beforeend", '<div class="ai-reply"><strong><i class="fa-solid fa-robot"></i> Elara AI</strong><p>' + esc(reply).replace(/\n/g, "<br>") + "</p></div>");
            }).then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
        }
    });

    /* ---------------- meal planner ----------------
       elaraMeals: [{ id, date, slot, name, ingredients:["onion", "rice|basmati", ...], by, byName }]
       "Add missing to list" puts every ingredient of this week's meals that isn't in the house
       (and isn't already on the list) onto the shopping list in one go. */
    var SLOTS = ["Breakfast", "Lunch", "Dinner"];
    var mealWeek = 0;                                      // 0 = this week, 1 = next week ...
    function meals() { return load("elaraMeals"); }
    function weekDays() {
        var start = F ? F.util.mondayOf(D.util.dayKey()) : D.util.dayKey(), out = [];
        for (var i = 0; i < 7; i++) out.push(F.util.addDaysKey(start, i + mealWeek * 7));
        return out;
    }
    function ingName(n) { return String(n).split("|")[0].trim(); }
    function inHouseFn() { return A && A.has ? A.has(A.pantry()) : function () { return false; }; }
    function recipeByName(n) { return (A && A.recipes || []).filter(function (r) { return norm(r.name) === norm(n); })[0]; }
    function dayLabel(k) { var d = new Date(k + "T00:00:00"); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + d.getDate(); }
    function renderMeals() {
        if (!F || !$("#mealWeek")) return;
        var days = weekDays(), today = D.util.dayKey(), all = meals(), has = inHouseFn(), edit = canEdit();
        $("#mealWeekLabel").textContent = mealWeek === 0 ? "This week" : mealWeek === 1 ? "Next week" : "Week of " + dayLabel(days[0]);
        $("#mealPrev").disabled = mealWeek <= 0;
        $("#mealNext").disabled = mealWeek >= 3;
        $("#mealWeek").innerHTML = days.map(function (k) {
            var list = all.filter(function (m) { return m.date === k; }).sort(function (a, b) { return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot); }), past = k < today;
            return '<div class="meal-day' + (k === today ? " today" : "") + (past ? " past" : "") + '" data-date="' + k + '"><div class="meal-date">' + esc(k === today ? "Today" : dayLabel(k)) + "</div><div class=\"meal-items\">" +
                (list.length ? list.map(function (m) {
                    var miss = (m.ingredients || []).filter(function (n) { return !has(n); });
                    return '<button type="button" class="meal-chip" data-meal="' + esc(m.id) + '"><small>' + esc(m.slot) + "</small>" + esc(m.name) +
                        (m.ingredients && m.ingredients.length ? '<em class="' + (miss.length ? "need" : "ok") + '">' + (miss.length ? "Need " + esc(miss.slice(0, 3).map(ingName).join(", ")) + (miss.length > 3 ? " +" + (miss.length - 3) : "") : "All in the house") + "</em>" : "") + "</button>";
                }).join("") : '<span class="meal-none">' + (past ? "—" : "Nothing planned") + "</span>") +
                "</div>" + (edit && !past ? '<button type="button" class="icon-act meal-add" data-add="' + k + '" aria-label="Plan a meal for ' + esc(dayLabel(k)) + '"><i class="fa-solid fa-plus"></i></button>' : "") + "</div>";
        }).join("");
    }
    function openMeal(m, date) {
        if (!canEdit()) return UI.toast("You can view Shopping but not change it.", "error");
        var today = D.util.dayKey(), days = weekDays().filter(function (k) { return k >= today; });
        if (m && days.indexOf(m.date) < 0) days.unshift(m.date);
        var recipes = (A && A.recipes || []).map(function (r) { return r.name; });
        UI.form({
            title: m ? "Edit meal" : "Plan a meal", icon: "fa-utensils", submitText: m ? "Save" : "Add to the plan",
            fields: [
                { name: "date", label: "Day", type: "select", value: m ? m.date : (date || days[0]), options: days.map(function (k) { return [k, k === today ? "Today" : dayLabel(k)]; }) },
                { name: "slot", label: "Meal", type: "select", value: m ? m.slot : "Dinner", options: SLOTS },
                { name: "name", label: "What are you making?", value: m ? m.name : "", maxlength: 60, required: true, placeholder: "e.g. Chicken curry with rice", suggestions: recipes },
                { name: "ingredients", label: "Ingredients (comma separated)", type: "textarea", value: m ? (m.ingredients || []).map(ingName).join(", ") : "", maxlength: 400,
                  hint: "Pick a dish from the list and Elara fills these in. Anything not in the house can go on the shopping list." }
            ],
            onChange: function (form, field) {
                if (field !== "name") return;
                var r = recipeByName(form.elements.name.value);
                if (r && !form.elements.ingredients.value.trim()) form.elements.ingredients.value = r.needs.map(ingName).join(", ");
            },
            validate: function (v) {
                if (v.name.length < 2 || v.name.length > 60 || !/[a-z]/i.test(v.name) || /[<>]/.test(v.name)) return { field: "name", msg: "Name the meal (2 to 60 characters)." };
                if (!v.date || v.date < today) return { field: "date", msg: "Choose today or a later day." };
                if (SLOTS.indexOf(v.slot) < 0) return { field: "slot", msg: "Choose breakfast, lunch or dinner." };
                var ings = v.ingredients.split(/[,\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
                if (ings.length > 25) return { field: "ingredients", msg: "Keep it to 25 ingredients or fewer." };
                if (ings.some(function (x) { return x.length > 40 || /[<>]/.test(x); })) return { field: "ingredients", msg: "Each ingredient can be at most 40 characters." };
                var dup = meals().some(function (x) { return (!m || x.id !== m.id) && x.date === v.date && x.slot === v.slot; });
                if (dup) return { field: "slot", msg: "There's already a " + v.slot.toLowerCase() + " planned that day. Edit that one instead." };
                return null;
            }
        }).then(function (v) {
            if (!v) return;
            var r = recipeByName(v.name), typed = v.ingredients.split(/[,\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
            // keep the recipe's "a|b" alternatives when the person left the suggested ingredients as they were
            var ings = r && typed.join(",").toLowerCase() === r.needs.map(ingName).join(",").toLowerCase() ? r.needs.slice() : typed;
            var list = meals(), u = me(), data = { date: v.date, slot: v.slot, name: v.name, ingredients: ings };
            if (m) list = list.map(function (x) { return x.id === m.id ? Object.assign({}, x, data, { updatedAt: Date.now() }) : x; });
            else list.push(Object.assign({ id: Date.now() + Math.floor(Math.random() * 1000), by: u.id, byName: u.first, createdAt: Date.now() }, data));
            save("elaraMeals", list.filter(function (x) { return x.date >= F.util.addDaysKey(today, -60); }).slice(-300));
            D.log((m ? "changed the meal plan: " : "planned ") + v.name + " (" + v.slot.toLowerCase() + ", " + dayLabel(v.date) + ")", "fa-utensils");
            UI.toast(v.name + " is on the plan."); renderMeals();
        });
    }
    $("#mealWeek").addEventListener("click", function (e) {
        var add = e.target.closest("[data-add]");
        if (add) return openMeal(null, add.dataset.add);
        var chip = e.target.closest("[data-meal]"); if (!chip) return;
        var m = meals().filter(function (x) { return String(x.id) === chip.dataset.meal; })[0]; if (!m) return;
        if (!canEdit() || m.date < D.util.dayKey()) return UI.toast(m.name + ": " + ((m.ingredients || []).map(ingName).join(", ") || "no ingredients listed"), "info");
        var ov = document.createElement("div");
        ov.className = "eui-overlay";
        ov.innerHTML = '<div class="eui-box" role="dialog" aria-modal="true"><div class="eui-icon info"><i class="fa-solid fa-utensils"></i></div><h3>' + esc(m.name) + "</h3><p>" +
            esc(m.slot + ", " + dayLabel(m.date) + (m.byName ? " • planned by " + m.byName : "")) + "</p><p><small>" + esc((m.ingredients || []).map(ingName).join(", ") || "No ingredients listed") + "</small></p>" +
            '<div class="eui-actions"><button type="button" class="eui-btn danger" data-m="del">Remove</button><button type="button" class="eui-btn ghost" data-m="close">Close</button><button type="button" class="eui-btn primary" data-m="edit">Edit</button></div></div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        function shut() { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); }
        ov.addEventListener("click", function (ev) {
            var b = ev.target.closest("[data-m]");
            if (ev.target === ov || (b && b.dataset.m === "close")) return shut();
            if (!b) return;
            shut();
            if (b.dataset.m === "edit") return openMeal(m);
            save("elaraMeals", meals().filter(function (x) { return x.id !== m.id; }));
            D.log("removed " + m.name + " from the meal plan", "fa-utensils"); UI.toast(m.name + " removed from the plan.", "info"); renderMeals();
        });
    });
    $("#mealPrev").addEventListener("click", function () { if (mealWeek > 0) { mealWeek--; renderMeals(); } });
    $("#mealNext").addEventListener("click", function () { if (mealWeek < 3) { mealWeek++; renderMeals(); } });

    /* fill empty dinners: Elara AI if it's on, otherwise the built-in recipes that best match what's in the house */
    function planDinners(picks) {
        var today = D.util.dayKey(), list = meals(), u = me(), added = [];
        var free = weekDays().filter(function (k) { return k >= today && !list.some(function (m) { return m.date === k && m.slot === "Dinner"; }); });
        var used = list.filter(function (m) { return weekDays().indexOf(m.date) > -1; }).map(function (m) { return norm(m.name); });
        picks = picks.filter(function (p) { return used.indexOf(norm(p.name)) < 0; });
        free.forEach(function (k, i) {
            var p = picks[i]; if (!p) return;
            list.push({ id: Date.now() + i, date: k, slot: "Dinner", name: p.name.slice(0, 60), ingredients: (p.needs || []).slice(0, 25), by: u.id, byName: u.first, createdAt: Date.now(), suggested: true });
            added.push(p.name);
        });
        if (added.length) { save("elaraMeals", list); D.log("planned " + added.length + " dinner" + (added.length === 1 ? "" : "s") + " with Elara", "fa-wand-magic-sparkles"); }
        renderMeals();
        return added;
    }
    $("#mealSuggest").addEventListener("click", function () {
        if (!canEdit() || !A) return;
        var btn = this, today = D.util.dayKey();
        var free = weekDays().filter(function (k) { return k >= today && !meals().some(function (m) { return m.date === k && m.slot === "Dinner"; }); });
        if (!free.length) return UI.toast("Every dinner this week is already planned.", "info");
        var local = A.rankMeals(A.pantry(), 14, 0);
        function finish(picks, how) {
            var added = planDinners(picks);
            UI.toast(added.length ? "Planned " + added.length + " dinner" + (added.length === 1 ? "" : "s") + how + ". Tap one to change it." : "No new ideas this time.", added.length ? "success" : "info");
            btn.disabled = false;
        }
        btn.disabled = true;
        if (!cfg.aiEndpoint || !D.user || navigator.onLine === false) return finish(local, " from what's in the house");
        var ask = "Plan " + free.length + " different South African family dinners for this week, using what's in the house first. " +
            "Reply ONLY with one line per dinner, exactly like: MEAL: <dish name> | <ingredient>, <ingredient>, ... (short ingredient names, no amounts, no DO: lines).";
        D.callFunction(cfg.aiEndpoint, { message: ask, context: A.context(), history: [] }).then(function (j) {
            var picks = String(j.reply || "").split(/\n+/).map(function (l) {
                var mm = l.match(/MEAL:\s*([^|]{2,60})\|\s*(.+)$/i); if (!mm) return null;
                var name = mm[1].replace(/[*_#<>]/g, "").trim(), ings = mm[2].split(",").map(function (x) { return x.replace(/[*_<>.]/g, "").trim().toLowerCase(); }).filter(function (x) { return x && x.length <= 40; });
                return name.length >= 2 ? { name: name, needs: ings.slice(0, 20) } : null;
            }).filter(Boolean);
            finish(picks.length ? picks.concat(local) : local, picks.length ? " with Elara AI" : " from what's in the house");
        }).catch(function () { finish(local, " from what's in the house"); });
    });
    $("#mealMissing").addEventListener("click", function () {
        if (!canEdit()) return;
        var today = D.util.dayKey(), has = inHouseFn(), onList = listItems().map(function (i) { return norm(i.name); });
        var planned = meals().filter(function (m) { return weekDays().indexOf(m.date) > -1 && m.date >= today; });
        if (!planned.length) return UI.toast("Plan some meals for this week first.", "info");
        var need = [], seen = {};
        planned.forEach(function (m) {
            (m.ingredients || []).forEach(function (n) {
                var name = ingName(n), k = norm(name); if (!k || seen[k]) return; seen[k] = 1;
                if (has(n)) return;
                if (onList.some(function (l) { return String(n).toLowerCase().split("|").some(function (alt) { alt = alt.trim(); return alt && (l.indexOf(alt) > -1 || alt.indexOf(l) > -1 && l.length > 3); }); })) return;
                need.push(name);
            });
        });
        if (!need.length) return UI.toast("You have everything for this week's meals (or it's already on the list).", "success");
        UI.confirm({ title: "Add " + need.length + " item" + (need.length === 1 ? "" : "s") + "?", message: need.join(", ") + ".", confirmText: "Add to the list", danger: false, icon: "fa-cart-plus" }).then(function (ok) {
            if (!ok) return;
            var list = items(), u = me(), t = Date.now();
            need.forEach(function (n, i) {
                var last = bought().filter(function (c) { return norm(c.name) === norm(n); }).pop();
                var nm = n.charAt(0).toUpperCase() + n.slice(1);
                list.push({ id: t + i, name: nm, details: "For the meal plan", price: last ? last.price : 0, qty: 1, category: "Groceries", icon: "fa-cart-shopping", by: u.id, byName: u.first, createdAt: t, status: "Pending" });
            });
            save("elaraShoppingItems", list);
            D.log("added " + need.length + " ingredient" + (need.length === 1 ? "" : "s") + " for the meal plan to the shopping list", "fa-cart-plus");
            D.notify({ to: "household", kind: "shopping", title: "Added to the shopping list", body: u.first + " added " + need.length + " item" + (need.length === 1 ? "" : "s") + " for this week's meals.", href: "dashboard-shopping.html" });
            UI.toast(need.length + " item" + (need.length === 1 ? "" : "s") + " added to the list."); renderAll();
        });
    });

    /* ---------------- predictions ---------------- */
    function computePredictions() {
        var now = Date.now(), out = [], groups = {};
        bought().forEach(function (c) {
            var k = norm(c.name); if (!k) return;
            (groups[k] = groups[k] || { name: c.name, times: [] }).times.push(Number(c.addedAt) || now);
        });
        Object.keys(groups).forEach(function (k) {
            var g = groups[k], t = g.times.sort(function (a, b) { return a - b; }), last = t[t.length - 1];
            var sinceLast = Math.max(0, Math.floor((now - last) / DAY));
            if (t.length >= 2) {
                var gaps = []; for (var i = 1; i < t.length; i++) gaps.push((t[i] - t[i - 1]) / DAY);
                var avg = Math.max(1, Math.round(gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length));
                var left = Math.round(avg - (now - last) / DAY), basis = "bought " + t.length + " times, about every " + avg + " day" + (avg === 1 ? "" : "s");
                if (left < 0) out.push({ rank: 0, level: "overdue", icon: "fa-triangle-exclamation", color: "#F87171", name: g.name, text: "Probably running out: " + basis + ", last bought " + sinceLast + " day" + (sinceLast === 1 ? "" : "s") + " ago." });
                else if (left <= 3) out.push({ rank: 1, level: "soon", icon: "fa-clock", color: "#FBBF24", name: g.name, text: (left === 0 ? "Likely to run out today. " : "Likely to run out in " + left + " day" + (left === 1 ? "" : "s") + ". ") + cap(basis) + "." });
                else out.push({ rank: 4, level: "ok", icon: "fa-box-open", color: "#34D399", name: g.name, text: "Should last about " + left + " more days. " + cap(basis) + "." });
            } else out.push({ rank: 5, level: "learning", icon: "fa-circle-info", color: "#60A5FA", name: g.name, text: "Bought once, " + sinceLast + " day" + (sinceLast === 1 ? "" : "s") + " ago. Buy it again and Elara learns how often you need it." });
        });
        listItems().forEach(function (i) {
            if (groups[norm(i.name)]) return;
            var listed = Number(i.createdAt || i.id); if (!(listed > 1e12)) return;
            var days = Math.floor((now - listed) / DAY);
            if (days >= 3) out.push({ rank: 2, level: "waiting", icon: "fa-hourglass-half", color: "#FBBF24", name: i.name, text: "On the list for " + days + " days and not bought yet." });
        });
        return out.sort(function (a, b) { return a.rank - b.rank; });
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function renderPredictions() {
        var list = computePredictions();
        $("#lowStock").textContent = list.filter(function (p) { return p.level === "overdue" || p.level === "soon"; }).length;
        $("#predictions").innerHTML = list.length ? list.slice(0, 6).map(function (p) {
            return '<div class="prediction"><i class="fa-solid ' + p.icon + '" style="color:' + p.color + '"></i><div><h3>' + esc(p.name) + "</h3><p>" + esc(p.text) + "</p></div></div>";
        }).join("") : '<p class="muted">No predictions yet. Once you’ve bought the same item twice, Elara estimates when you’ll run out.</p>';
    }

    /* ---------------- spending ---------------- */
    function monthOf(t) { var d = new Date(t); return d.getFullYear() + "-" + d.getMonth(); }
    function renderSpending() {
        var nowM = monthOf(Date.now()), mine = bought().filter(function (c) { return monthOf(c.addedAt) === nowM; });
        var total = mine.reduce(function (s, c) { return s + c.price * (c.qty || 1); }, 0);
        $("#monthlySpending").textContent = money(total);
        $("#spendNote").textContent = mine.length + " purchase" + (mine.length === 1 ? "" : "s") + " this month";
        var per = {};
        mine.forEach(function (c) { var k = c.by || "unknown"; per[k] = per[k] || { name: c.byName || "Unknown", total: 0, n: 0 }; per[k].total += c.price * (c.qty || 1); per[k].n++; });
        var rows = Object.keys(per).map(function (k) { return per[k]; }).sort(function (a, b) { return b.total - a.total; });
        $("#spendByPerson").innerHTML = rows.length ? rows.map(function (r) {
            var pct = total ? Math.round(r.total / total * 100) : 0;
            return '<div class="person-spend"><div><strong>' + esc(r.name) + "</strong><small>" + r.n + " item" + (r.n === 1 ? "" : "s") + "</small></div><span>" + money(r.total) + "</span>" +
                '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
        }).join("") : '<p class="muted">No purchases this month yet.</p>';
        drawChart();
    }
    var chart = null;
    function drawChart() {
        var canvas = $("#spendingChart");
        if (!canvas || typeof Chart === "undefined") return;
        var names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], months = [];
        for (var i = 5; i >= 0; i--) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push({ y: d.getFullYear(), m: d.getMonth(), total: 0 }); }
        bought().forEach(function (c) {
            var d = new Date(c.addedAt || Date.now());
            var slot = months.filter(function (x) { return x.y === d.getFullYear() && x.m === d.getMonth(); })[0];
            if (slot) slot.total += c.price * (c.qty || 1);
        });
        var light = document.body.classList.contains("light-theme"), tick = light ? "#68708a" : "#b8bfd9", grid = light ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.06)";
        var data = { labels: months.map(function (x) { return names[x.m]; }), datasets: [{ label: "Spending (R)", data: months.map(function (x) { return +x.total.toFixed(2); }),
            borderColor: "#6C63FF", backgroundColor: "rgba(108,99,255,.18)", fill: true, tension: .35, borderWidth: 3, pointRadius: 4 }] };
        if (chart) { chart.data = data; chart.update(); return; }
        chart = new Chart(canvas, { type: "line", data: data, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { ticks: { color: tick }, grid: { color: grid } }, y: { beginAtZero: true, ticks: { color: tick, callback: function (v) { return "R" + v; } }, grid: { color: grid } } } } });
    }

    /* ---------------- receipts (metadata synced, files kept in this browser) ---------------- */
    var RDB = (function () {
        var uid = (D.user && D.user.id) || "guest", dbp = null;
        function open() {
            if (dbp) return dbp;
            dbp = new Promise(function (res, rej) {
                var r = indexedDB.open("elaraReceiptFiles:" + uid, 1);
                r.onupgradeneeded = function () { r.result.createObjectStore("files"); };
                r.onsuccess = function () { res(r.result); };
                r.onerror = function () { rej(r.error); };
            });
            return dbp;
        }
        function run(mode, fn) {
            return open().then(function (db) { return new Promise(function (res, rej) {
                var t = db.transaction("files", mode), req = fn(t.objectStore("files"));
                t.oncomplete = function () { res(req && req.result); }; t.onerror = function () { rej(t.error); };
            }); });
        }
        return { put: function (id, b) { return run("readwrite", function (s) { return s.put(b, id); }); },
                 get: function (id) { return run("readonly", function (s) { return s.get(id); }); },
                 del: function (id) { return run("readwrite", function (s) { return s.delete(id); }); } };
    })();
    function receipts() { return load("elaraReceipts"); }
    function addReceipt(file, label) {
        if (!canEdit()) return;
        var okType = /^image\//.test(file.type) || file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        if (!okType) return UI.toast("Receipts must be a photo or a PDF.", "error");
        if (file.size > 15 * 1024 * 1024) return UI.toast("That file is bigger than 15 MB.", "error");
        UI.form({
            title: "Save receipt", icon: "fa-receipt", submitText: "Save",
            fields: [
                { name: "store", label: "Store", value: label === "scan" ? "" : file.name.replace(/\.[^.]+$/, "").slice(0, 40), required: true, maxlength: 40, placeholder: "e.g. Checkers" },
                { name: "total", label: "Total (R, optional)", type: "number", min: 0, max: 100000, step: "0.01" },
                { name: "date", label: "Date", type: "date", value: D.util.dayKey(), required: true, max: D.util.dayKey() }
            ],
            validate: function (v) {
                if (v.store.length < 2) return "Enter the store name (2 to 40 characters).";
                if (v.total !== "" && (!(Number(v.total) >= 0) || Number(v.total) > 100000)) return "Enter a total from R0 to R100 000, or leave it empty.";
                if (!v.date || v.date > D.util.dayKey()) return "The receipt date can't be in the future.";
                return null;
            }
        }).then(function (v) {
            if (!v) return;
            var id = Date.now(), m = me();
            RDB.put(id, file).then(function () {
                var list = receipts();
                list.unshift({ id: id, store: v.store, total: v.total === "" ? null : Number(v.total), date: v.date, fileName: file.name.slice(0, 80), mime: file.type || "", size: file.size, hasFile: true, by: m.id, byName: m.first });
                save("elaraReceipts", list.slice(0, 50));
                D.log("saved a " + v.store + " receipt", "fa-receipt"); UI.toast("Receipt saved."); renderReceipts();
            }).catch(function () { UI.toast("Could not store this receipt file. Your browser may be blocking storage.", "error"); });
        });
    }
    function pickFile(capture) {
        var inp = document.createElement("input");
        inp.type = "file"; inp.accept = capture ? "image/*" : "image/*,.pdf"; if (capture) inp.capture = "environment";
        inp.addEventListener("change", function () {
            var f = inp.files[0]; if (!f) return;
            if (/^image\//.test(f.type) && F && F.receipt && f.size <= 15 * 1024 * 1024) scanReceipt(f);
            else addReceipt(f, capture ? "scan" : "upload");
        });
        inp.click();
    }

    /* read the till slip on the phone, then let the person check what Elara found before anything changes */
    function scanReceipt(file) {
        if (!canEdit()) return;
        var ov = document.createElement("div");
        ov.className = "eui-overlay";
        ov.innerHTML = '<div class="eui-box scan-box" role="dialog" aria-modal="true"><div class="eui-icon info"><i class="fa-solid fa-receipt"></i></div><h3>Reading your receipt...</h3>' +
            '<p class="scan-msg">Getting the reader ready. The first time takes a little longer.</p><div class="scan-bar"><i style="width:4%"></i></div>' +
            '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-skip>Skip, just save it</button></div></div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        var cancelled = false;
        function shut() { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); }
        ov.querySelector("[data-skip]").addEventListener("click", function () { cancelled = true; shut(); addReceipt(file, "scan"); });
        F.receipt.read(file, function (pct) {
            ov.querySelector(".scan-msg").textContent = "Reading the text... " + pct + "%";
            ov.querySelector(".scan-bar i").style.width = Math.max(4, pct) + "%";
        }).then(function (text) {
            if (cancelled) return;
            shut();
            var r = F.receipt.parse(text);
            if (!r.items.length && r.total == null) { UI.toast("I couldn't read that receipt. Try a flatter, brighter photo, or fill it in yourself.", "error"); return addReceipt(file, "scan"); }
            reviewReceipt(file, r);
        }).catch(function (e) {
            if (cancelled) return;
            shut(); UI.toast(e.message + " You can still save the receipt.", "error"); addReceipt(file, "scan");
        });
    }
    function reviewReceipt(file, r) {
        var onList = listItems(), recent = bought().slice(-80).reverse(), inHouse = pantry().filter(function (x) { return !x.usedUp; });
        var cands = onList.map(function (i) { return { name: i.name, kind: "list", ref: i }; })
            .concat(recent.map(function (c) { return { name: c.name, kind: "bought", ref: c }; }))
            .concat(inHouse.map(function (x) { return { name: x.name, kind: "pantry", ref: x }; }));
        var used = {}, rows = r.items.slice(0, 40).map(function (it, i) {
            var m = F.receipt.match(it.name, cands.filter(function (c) { return !used[c.kind + c.name]; }));
            if (m) used[m.item.kind + m.item.name] = 1;
            return { i: i, it: it, m: m };
        });
        var ov = document.createElement("div");
        ov.className = "eui-overlay";
        ov.innerHTML = '<form class="eui-box eui-form auto-form receipt-review" novalidate><div class="eui-icon info"><i class="fa-solid fa-receipt"></i></div><h3>Check the receipt</h3>' +
            "<p>Elara read " + r.items.length + " line" + (r.items.length === 1 ? "" : "s") + ". Untick anything that's wrong.</p>" +
            '<label>Store<input name="store" maxlength="40" value="' + esc(r.store) + '" placeholder="e.g. Checkers"></label>' +
            '<div class="rr-two"><label>Total (R)<input name="total" type="number" min="0" max="100000" step="0.01" value="' + esc(r.total == null ? "" : r.total.toFixed(2)) + '"></label>' +
            '<label>Date<input name="date" type="date" max="' + D.util.dayKey() + '" value="' + esc(r.date || D.util.dayKey()) + '"></label></div>' +
            '<fieldset><legend>What Elara found</legend><div class="rr-list">' + (rows.length ? rows.map(function (x) {
                var on = x.m && x.m.item.kind === "list";
                return '<div class="rr-row' + (x.m ? "" : " nomatch") + '"><div class="rr-line"><strong>' + esc(x.it.name) + "</strong><span>" + (x.it.qty > 1 ? x.it.qty + " × " + money(x.it.each) + " = " : "") + money(x.it.price) + "</span></div>" +
                    (x.m ? '<small>Matches <b>' + esc(x.m.item.name) + "</b>" + (x.m.item.kind === "list" ? " on your list" : x.m.item.kind === "pantry" ? " in the house" : " (bought before)") + "</small>" +
                        '<label class="rr-opt"><input type="checkbox" name="price_' + x.i + '" checked> Use ' + money(x.it.each) + " as its price</label>" +
                        (on ? '<label class="rr-opt"><input type="checkbox" name="buy_' + x.i + '" checked> Mark as bought</label>' : "")
                      : '<label class="rr-opt"><input type="checkbox" name="add_' + x.i + '"> Not on your list: add to spending and “In the House”</label>') + "</div>";
            }).join("") : "<p>No items found, only the total.</p>") + "</div></fieldset>" +
            '<p class="eui-err" aria-live="assertive"></p><div class="eui-actions"><button type="button" class="eui-btn ghost" data-close>Cancel</button><button type="submit" class="eui-btn primary">Save</button></div></form>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        var f = ov.querySelector("form");
        function shut() { ov.classList.remove("show"); setTimeout(function () { ov.remove(); }, 180); }
        ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest("[data-close]")) shut(); });
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            var store = f.store.value.trim(), total = f.total.value.trim(), date = f.date.value, err = null;
            f.querySelectorAll(".invalid").forEach(function (x) { x.classList.remove("invalid"); });
            if (store.length < 2 || store.length > 40 || /[<>]/.test(store)) err = ["store", "Enter the store name (2 to 40 characters)."];
            else if (total !== "" && (!(Number(total) >= 0) || Number(total) > 100000)) err = ["total", "Enter a total from R0 to R100 000, or leave it empty."];
            else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > D.util.dayKey()) err = ["date", "The receipt date can't be in the future."];
            if (err) { f.querySelector(".eui-err").textContent = err[1]; f[err[0]].classList.add("invalid"); f[err[0]].focus(); return; }
            var list = items(), cart = bought(), u = me(), t = Date.now(), nPrice = 0, nBuy = 0, nAdd = 0;
            var when = date === D.util.dayKey() ? t : new Date(date + "T12:00:00").getTime();
            rows.forEach(function (x) {
                var chk = function (n) { var el = f.elements[n + "_" + x.i]; return el && el.checked; };
                if (x.m && chk("price")) {
                    var nm = norm(x.m.item.name);
                    list.forEach(function (i) { if (norm(i.name) === nm && !cart.some(function (c) { return c.id === i.id; })) { i.price = x.it.each; i.updatedAt = t; nPrice++; } });
                }
                if (x.m && x.m.item.kind === "list" && chk("buy")) {
                    var li = x.m.item.ref;
                    if (!cart.some(function (c) { return c.id === li.id; })) {
                        cart.push({ id: li.id, name: li.name, price: x.it.each, qty: x.it.qty || li.qty || 1, category: li.category, addedAt: when, by: u.id, byName: u.first, receipt: t });
                        addToPantry(li.name, x.it.qty || li.qty || 1, li.category, F ? F.expiry.suggest(li.name, li.category) : "");
                        nBuy++;
                    }
                }
                if (!x.m && chk("add")) {
                    var name = x.it.name.toLowerCase().replace(/\b\d+(ml|l|g|kg|s)\b/g, "").replace(/\s+/g, " ").trim();
                    name = name.charAt(0).toUpperCase() + name.slice(1);
                    cart.push({ id: t + 1000 + x.i, name: name.slice(0, 60), price: x.it.each, qty: x.it.qty || 1, category: "Groceries", addedAt: when, by: u.id, byName: u.first, receipt: t });
                    addToPantry(name.slice(0, 60), x.it.qty || 1, "Groceries", F ? F.expiry.suggest(name, "Groceries") : "");
                    nAdd++;
                }
            });
            save("elaraShoppingItems", list); save("elaraCartItems", cart);
            RDB.put(t, file).catch(function () { /* the receipt details are kept even if the photo can't be */ }).then(function () {
                var rl = receipts();
                rl.unshift({ id: t, store: store, total: total === "" ? null : Number(total), date: date, fileName: file.name.slice(0, 80), mime: file.type || "", size: file.size, hasFile: true, by: u.id, byName: u.first, scanned: true });
                save("elaraReceipts", rl.slice(0, 50));
                D.log("scanned a " + store + " receipt" + (nBuy ? " (" + nBuy + " bought)" : ""), "fa-receipt");
                if (nBuy) D.notify({ to: "household", kind: "shopping", title: "Shopping done", body: u.first + " bought " + nBuy + " item" + (nBuy === 1 ? "" : "s") + " at " + store + ".", href: "dashboard-shopping.html" });
                UI.toast("Receipt saved" + (nBuy ? ", " + nBuy + " marked as bought" : "") + (nPrice ? ", " + nPrice + " price" + (nPrice === 1 ? "" : "s") + " updated" : "") + (nAdd ? ", " + nAdd + " added" : "") + ".");
                shut(); renderAll();
            });
        });
    }
    $(".scan-btn").addEventListener("click", function () { pickFile(true); });
    $(".upload-btn").addEventListener("click", function () { pickFile(false); });
    function renderReceipts() {
        var list = receipts();
        $("#receiptList").innerHTML = list.length ? list.slice(0, 10).map(function (r) {
            return '<div class="receipt-card" data-id="' + esc(r.id) + '"><i class="fa-solid fa-receipt"></i><div><h3>' + esc(r.store) + "</h3><p>" + esc(r.date || "") +
                (r.total != null ? " • " + money(r.total) : "") + (r.byName ? " • " + esc(r.byName) : "") + '</p></div><button type="button" class="view-receipt">View</button></div>';
        }).join("") : '<p class="muted">No receipts yet. Scan or upload one.</p>';
    }
    $("#receiptList").addEventListener("click", function (e) {
        var b = e.target.closest(".view-receipt"); if (!b) return;
        var id = Number(b.closest("[data-id]").dataset.id), r = receipts().filter(function (x) { return x.id === id; })[0];
        if (r) openReceipt(r);
    });
    function openReceipt(r) {
        var ov = document.createElement("div");
        ov.className = "eui-overlay receipt-viewer";
        ov.innerHTML = '<div class="eui-box rv-box"><div class="rv-head"><div><h3>' + esc(r.store) + "</h3><p>" + esc(r.date || "") + (r.total != null ? " • " + money(r.total) : "") + '</p></div><button type="button" class="ev-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="rv-body"><p>Loading...</p></div><div class="rv-foot"></div></div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add("show"); });
        var url = "";
        function close() { if (url) URL.revokeObjectURL(url); ov.remove(); }
        ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".ev-close")) close(); });
        var foot = ov.querySelector(".rv-foot"), body = ov.querySelector(".rv-body");
        if (canEdit()) {
            var del = document.createElement("button"); del.type = "button"; del.className = "eui-btn danger"; del.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
            del.onclick = function () {
                UI.confirm({ title: "Delete this receipt?", message: "The " + r.store + " receipt will be removed from the archive.", confirmText: "Delete receipt" }).then(function (ok) {
                    if (!ok) return;
                    RDB.del(r.id).catch(function () {});
                    save("elaraReceipts", receipts().filter(function (x) { return x.id !== r.id; }));
                    renderReceipts(); close();
                });
            };
            foot.appendChild(del);
        }
        RDB.get(r.id).then(function (blob) {
            if (!blob) { body.innerHTML = "<p>This receipt's file is on " + (r.byName ? esc(r.byName) + "'s" : "another") + " device. Receipt files stay on the device they were added from.</p>"; return; }
            url = URL.createObjectURL(blob);
            var isPdf = (blob.type || r.mime) === "application/pdf" || /\.pdf$/i.test(r.fileName || "");
            body.innerHTML = isPdf ? '<iframe src="' + url + '" title="Receipt"></iframe>' : '<img src="' + url + '" alt="Receipt from ' + esc(r.store) + '">';
            var dl = document.createElement("a"); dl.className = "eui-btn primary"; dl.href = url; dl.download = r.fileName || r.store; dl.innerHTML = '<i class="fa-solid fa-download"></i> Download';
            foot.insertBefore(dl, foot.firstChild);
        }).catch(function () { body.innerHTML = "<p>Could not open this receipt file.</p>"; });
    }

    /* ---------------- warranties ---------------- */
    function warranties() { return load("elaraWarranties"); }
    if (D.demo && !localStorage.getItem("elaraWarranties")) {
        var dk = function (d) { return D.util.dayKey(d); }, now0 = new Date();
        save("elaraWarranties", [
            { id: 1, name: "Samsung Microwave", store: "Makro", purchased: dk(D.util.addDays(now0, -120)), expires: dk(D.util.addDays(now0, 240)) },
            { id: 2, name: "Hisense TV", store: "Takealot", purchased: dk(D.util.addDays(now0, -340)), expires: dk(D.util.addDays(now0, 21)) }
        ]);
    }
    function remaining(expires) {
        var days = Math.ceil((new Date(expires + "T23:59:59") - new Date()) / DAY);
        if (days < 0) return { text: "Expired " + Math.abs(days) + " day" + (Math.abs(days) === 1 ? "" : "s") + " ago", cls: "expired" };
        if (days === 0) return { text: "Expires today", cls: "soon" };
        if (days <= 60) return { text: "Expires in " + days + " day" + (days === 1 ? "" : "s"), cls: days <= 30 ? "soon" : "" };
        var months = Math.round(days / 30.4);
        if (months >= 12) { var y = Math.round(months / 12 * 10) / 10; return { text: "Expires in " + y + " year" + (y === 1 ? "" : "s"), cls: "" }; }
        return { text: "Expires in " + months + " months", cls: "" };
    }
    function renderWarranties() {
        var header = $("#warrantyPanel .panel-header");
        if (canEdit() && !header.querySelector(".warranty-add")) {
            header.insertAdjacentHTML("beforeend", '<button type="button" class="warranty-add"><i class="fa-solid fa-plus"></i> Add</button>');
            header.querySelector(".warranty-add").addEventListener("click", function () { openWarranty(null); });
        }
        var list = warranties().slice().sort(function (a, b) { return a.expires.localeCompare(b.expires); });
        $("#warrantyList").innerHTML = list.length ? list.map(function (w) {
            var r = remaining(w.expires);
            return '<div class="warranty-item ' + r.cls + '" data-id="' + esc(w.id) + '"><div class="warranty-main"><h3>' + esc(w.name) + "</h3><p>" + esc(r.text) + (w.store ? " • " + esc(w.store) : "") + "</p></div>" +
                (canEdit() ? '<button type="button" class="warranty-del" aria-label="Delete warranty"><i class="fa-solid fa-trash"></i></button>' : "") + "</div>";
        }).join("") : '<p class="warranty-empty">No warranties saved yet.</p>';
    }
    $("#warrantyList").addEventListener("click", function (e) {
        var row = e.target.closest(".warranty-item"); if (!row || !canEdit()) return;
        var w = warranties().filter(function (x) { return String(x.id) === row.dataset.id; })[0]; if (!w) return;
        if (e.target.closest(".warranty-del")) {
            UI.confirm({ title: "Delete this warranty?", message: "“" + w.name + "” will no longer be tracked.", confirmText: "Delete warranty" }).then(function (ok) {
                if (!ok) return;
                save("elaraWarranties", warranties().filter(function (x) { return x.id !== w.id; })); D.log("removed warranty for " + w.name, "fa-shield"); renderWarranties();
            });
        } else openWarranty(w);
    });
    function openWarranty(w) {
        var today = D.util.dayKey();
        UI.form({
            title: w ? "Edit warranty" : "Add a warranty", icon: "fa-shield-halved", submitText: "Save warranty",
            fields: [
                { name: "name", label: "Product", value: w ? w.name : "", required: true, maxlength: 60, placeholder: "e.g. Samsung Fridge" },
                { name: "store", label: "Store (optional)", value: w ? w.store || "" : "", maxlength: 40 },
                { name: "purchased", label: "Purchase date", type: "date", value: w ? w.purchased : today, required: true, max: today },
                { name: "months", label: "Warranty length (months)", type: "number", value: w ? Math.max(1, Math.round((new Date(w.expires) - new Date(w.purchased)) / 2629800000)) : 12, min: 1, max: 120, step: 1, required: true }
            ],
            validate: function (v) {
                if (v.name.length < 2) return "Enter the product (2 to 60 characters).";
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v.purchased) || v.purchased > today) return "The purchase date can't be in the future.";
                if (v.purchased < D.util.dayKey(D.util.addDays(new Date(), -365 * 15))) return "That purchase date is too long ago.";
                var m = Number(v.months); if (!Number.isInteger(m) || m < 1 || m > 120) return "Warranty length must be 1 to 120 whole months.";
                return null;
            }
        }).then(function (v) {
            if (!v) return;
            var d = new Date(v.purchased + "T00:00:00"); d.setMonth(d.getMonth() + Number(v.months));
            var expires = D.util.dayKey(d), list = warranties();
            if (w) list.forEach(function (x) { if (x.id === w.id) Object.assign(x, { name: v.name, store: v.store, purchased: v.purchased, expires: expires }); });
            else list.push({ id: Date.now(), name: v.name, store: v.store, purchased: v.purchased, expires: expires, by: me().id });
            save("elaraWarranties", list); D.log((w ? "updated" : "added") + " warranty for " + v.name, "fa-shield"); UI.toast("Warranty saved."); renderWarranties();
        });
    }

    /* ---------------- price watch (estimates, clearly labelled) ---------------- */
    function renderPriceWatch() {
        var box = $("#priceWatchList");
        var STORES = [{ n: "Shoprite", m: 0.96 }, { n: "Checkers", m: 0.99 }, { n: "Makro", m: 0.97 }, { n: "Pick n Pay", m: 1.01 }, { n: "Woolworths", m: 1.12 }];
        var hash = function (str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
        var noise = function (key) { var t = (hash(key) + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        var shelf = function (p) { return Math.max(1, Math.round(p)) - 0.01; };
        var weekNo = Math.floor((Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY) + 3) / 7);
        var seen = {}, tracked = listItems().slice().reverse().filter(function (it) {
            var k = norm(it.name); if (!k || seen[k] || !(Number(it.price) > 0)) return false; return (seen[k] = true);
        }).slice(0, 5);
        if (!tracked.length) { box.innerHTML = '<div class="pw-empty"><i class="fa-solid fa-tags"></i><p>Add items with a price to your list and Elara compares typical prices.</p></div>'; return; }
        box.innerHTML = tracked.map(function (it) {
            var key = norm(it.name), base = Number(it.price), regular = [base];
            for (var k = 0; k < 7; k++) regular.push(regular[k] / (1 + (-0.014 + noise(key + "|d|" + (weekNo - k)) * 0.03)));
            var promoOf = function (w) { return noise(key + "|p|" + w) < 0.15 ? 1 - (0.10 + noise(key + "|pf|" + w) * 0.15) : 1; };
            var onSpecial = promoOf(weekNo) < 1;
            var home = STORES.filter(function (s) { return String(it.details || "").toLowerCase().indexOf(s.n.toLowerCase()) > -1; })[0], ref = home ? home.m : 1;
            var quotes = STORES.map(function (s) { return { n: s.n, p: shelf(regular[0] / ref * s.m * (0.985 + noise(key + "|s|" + s.n + "|" + weekNo) * 0.03)) }; });
            var best = quotes.reduce(function (a, b) { return b.p < a.p ? b : a; }), saving = base - best.p;
            var change = (regular[0] - regular[4]) / regular[4] * 100, up = change > 0.4, down = change < -0.4;
            var status = saving >= Math.max(1, base * 0.02) ? "↓ " + money(saving) + " cheaper at " + best.n : onSpecial ? "Special likely this week" : "Your price looks good";
            return '<div class="price-watch"><div class="pw-left"><strong>' + esc(it.name) + "</strong><small>Typical lowest: " + esc(best.n) + " " + money(best.p) + " • you pay " + money(base) + '</small></div>' +
                '<div class="pw-right"><div class="pw-delta"><span class="' + (saving >= 1 ? "green" : "") + '">' + esc(status) + '</span><small class="' + (up ? "red" : down ? "green" : "") + '">' +
                (up ? "↑ " : down ? "↓ " : "→ ") + Math.abs(change).toFixed(1) + "% in 30 days</small></div></div></div>";
        }).join("") + '<p class="pw-note">Estimates from your own prices and typical weekly specials. Live store prices are not connected.</p>';
    }

    /* ---------------- activity ---------------- */
    function renderActivity() {
        var list = D.activity(60).filter(function (a) { return /fa-(cart|bag|box|receipt|shield|rotate)/.test(a.icon || "") || /shopping|bought|receipt|warranty/i.test(a.text); }).slice(0, 6);
        $("#shopActivity").innerHTML = list.length ? list.map(function (a) {
            return '<div class="activity-item"><i class="fa-solid ' + esc(a.icon) + '"></i> ' + esc(a.who + " " + a.text) + "<span>" + esc(D.ago(a.t)) + "</span></div>";
        }).join("") : '<p class="muted">Shopping changes by anyone in the home show up here.</p>';
    }

    function renderAll() {
        $("#itemCount").textContent = listItems().length;
        renderList(); renderPantry(); renderMeals(); renderPredictions(); renderSpending(); renderReceipts(); renderWarranties(); renderPriceWatch(); renderActivity();
    }
    D.onChange(renderAll);
    document.addEventListener("elara:refresh", renderAll);
    if (/[?&]new=1/.test(location.search)) setTimeout(function () { openItemForm(null); }, 300);
    renderAll();
})();
