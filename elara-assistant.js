/* ==========================================================
   ELARA ASSISTANT  (shared by the Dashboard chat and voice control)
   - understands everyday commands and acts on the home's data
   - suggests meals from what's in the house (offline recipe list, or Elara AI when set up)
   - anything else goes to Elara AI (elara-ai Edge Function) if it is deployed
   Every action respects the person's permissions.
   Load after elara-data.js.
========================================================== */
(function () {
    "use strict";
    var D = window.ElaraData;
    if (!D) return;
    var cfg = window.ELARA_CONFIG || {};

    function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim(); }
    function cap(s) { s = String(s || "").trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
    function listify(arr) { return arr.length <= 1 ? (arr[0] || "") : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1]; }
    function today() { return D.util.dayKey(); }
    function hm(d) { d = d || new Date(); return D.util.pad(d.getHours()) + ":" + D.util.pad(d.getMinutes()); }
    var DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    function noEdit(area) { return "You can't change " + area + " - ask the home owner for edit access."; }

    /* "tomorrow", "today", "on friday", "on 12 november" -> YYYY-MM-DD (or null) */
    function parseDay(text) {
        var t = norm(text), now = new Date();
        if (/\btoday\b|\btonight\b/.test(t)) return today();
        if (/\btomorrow\b/.test(t)) return D.util.dayKey(D.util.addDays(now, 1));
        for (var i = 0; i < 7; i++) {
            if (new RegExp("\\b(on |this |next )?" + DAYS[i] + "\\b").test(t)) {
                var diff = (i - now.getDay() + 7) % 7 || 7;
                if (/\bnext\b/.test(t) && diff < 7) diff += 7;
                return D.util.dayKey(D.util.addDays(now, diff));
            }
        }
        var m = t.match(/\b(\d{1,2}) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
        if (m) {
            var month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m[2]);
            var d = new Date(now.getFullYear(), month, +m[1]);
            if (d < D.util.startOfDay(now)) d.setFullYear(d.getFullYear() + 1);
            if (d.getMonth() === month) return D.util.dayKey(d);
        }
        return null;
    }
    /* "at 5pm", "at 17:30", "at 9" -> HH:MM (or null) */
    function parseTime(text) {
        var m = String(text).toLowerCase().match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
        if (!m) return null;
        var h = +m[1], mi = +(m[2] || 0);
        if (m[3] === "pm" && h < 12) h += 12;
        if (m[3] === "am" && h === 12) h = 0;
        if (h > 23 || mi > 59) return null;
        return D.util.pad(h) + ":" + D.util.pad(mi);
    }
    function stripWhen(text) {
        return String(text).replace(/\s*\b(for |by )?(today|tonight|tomorrow|(on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)|on \d{1,2} [a-z]+)\b/ig, "")
            .replace(/\s*\bat \d{1,2}(:\d{2})?\s*(am|pm)?\b/ig, "").replace(/\s+/g, " ").trim().replace(/[.!]$/, "");
    }
    function findPerson(name) {
        var n = norm(name);
        if (!n) return null;
        if (/^(me|myself|i)$/.test(n)) return D.members.find(D.me().id);
        return D.members.active().filter(function (m) { return norm(m.name) === n || norm(m.name).split(" ")[0] === n.split(" ")[0]; })[0] || null;
    }
    function bestDevice(q) {
        var words = norm(q).split(" ").filter(function (w) { return w.length > 2 && ["the","turn","switch","off","please","for","and","on"].indexOf(w) === -1; });
        var best = null, score = 0;
        D.devices.all().forEach(function (d) {
            var hay = norm(d.name + " " + d.room), s = 0;
            words.forEach(function (w) { if (hay.indexOf(w) > -1) s += (norm(d.name).indexOf(w) > -1 ? 2 : 1); });
            if (s > score) { score = s; best = d; }
        });
        return best;
    }

    /* ---------------- meals from what's in the house ---------------- */
    var RECIPES = [
        { name: "Pap and wors with tomato gravy", needs: ["maize meal", "boerewors|wors|sausage", "tomato", "onion"], time: 40 },
        { name: "Chakalaka and pap", needs: ["maize meal", "baked beans|beans", "carrot", "onion", "tomato"], time: 35 },
        { name: "Bobotie", needs: ["mince", "bread", "egg", "milk", "onion", "curry"], time: 70 },
        { name: "Chicken curry with rice", needs: ["chicken", "rice", "onion", "tomato", "curry"], time: 50 },
        { name: "Spaghetti bolognese", needs: ["spaghetti|pasta", "mince", "tomato", "onion"], time: 40 },
        { name: "Scrambled eggs on toast", needs: ["egg", "bread", "butter|margarine"], time: 10 },
        { name: "French toast", needs: ["bread", "egg", "milk"], time: 15 },
        { name: "Pancakes", needs: ["flour", "egg", "milk"], time: 25 },
        { name: "Vegetable stir-fry with rice", needs: ["rice", "carrot|pepper|cabbage|broccoli", "onion", "soy|oil"], time: 25 },
        { name: "Cheese and tomato toasted sandwich", needs: ["bread", "cheese", "tomato"], time: 10 },
        { name: "Tuna pasta bake", needs: ["pasta|macaroni|spaghetti", "tuna", "cheese", "milk"], time: 40 },
        { name: "Potato and onion soup", needs: ["potato", "onion", "stock|milk"], time: 40 },
        { name: "Omelette", needs: ["egg", "cheese|tomato|onion|pepper|mushroom"], time: 10 },
        { name: "Mac and cheese", needs: ["macaroni|pasta", "cheese", "milk", "butter|margarine"], time: 30 },
        { name: "Beef stew", needs: ["beef|stewing", "potato", "carrot", "onion"], time: 120 },
        { name: "Fried rice", needs: ["rice", "egg", "onion", "carrot|pea|pepper"], time: 20 },
        { name: "Chicken and vegetable soup", needs: ["chicken", "carrot", "potato", "onion"], time: 60 },
        { name: "Samp and beans", needs: ["samp", "beans", "onion"], time: 120 },
        { name: "Bean curry", needs: ["beans", "onion", "tomato", "curry"], time: 35 },
        { name: "Fruit smoothie", needs: ["banana|apple|berry|fruit", "milk|yoghurt|yogurt"], time: 5 },
        { name: "Porridge with banana", needs: ["oats|maize meal|porridge", "milk", "banana|sugar"], time: 10 },
        { name: "Fish cakes", needs: ["tuna|pilchard|fish", "potato", "egg", "onion"], time: 35 },
        { name: "Chicken wraps", needs: ["chicken", "wrap|tortilla|bread", "lettuce|tomato|cheese"], time: 20 },
        { name: "Vetkoek with mince", needs: ["flour", "yeast", "mince", "onion"], time: 90 }
    ];
    function pantry() {
        var p = D.util.load("elaraPantry", []).filter(function (x) { return !x.usedUp; });
        // things bought recently count as "in the house" too
        var cutoff = Date.now() - 14 * 86400000;
        D.util.load("elaraCartItems", []).forEach(function (c) {
            if ((c.addedAt || 0) > cutoff && !p.some(function (x) { return norm(x.name) === norm(c.name); })) p.push({ name: c.name, category: c.category, fromCart: true });
        });
        return p;
    }
    function localMeals(items) {
        var have = items.map(function (x) { return norm(x.name); });
        function has(need) { return need.split("|").some(function (alt) { return have.some(function (h) { return h.indexOf(alt) > -1 || alt.indexOf(h) > -1 && h.length > 3; }); }); }
        return RECIPES.map(function (r) {
            var got = r.needs.filter(has), missing = r.needs.filter(function (n) { return !has(n); });
            return { name: r.name, time: r.time, score: got.length / r.needs.length, uses: got.map(function (g) { return g.split("|")[0]; }), missing: missing.map(function (m) { return m.split("|")[0]; }) };
        }).filter(function (r) { return r.score >= 0.5; }).sort(function (a, b) { return b.score - a.score || a.time - b.time; }).slice(0, 3);
    }
    function mealReply(items) {
        if (!items.length) return "I don't know what's in the house yet. Mark shopping items as bought, or add them under “In the House” on the Shopping page, and I'll suggest meals.";
        var m = localMeals(items);
        if (!m.length) return "With " + listify(items.slice(0, 6).map(function (x) { return x.name; })) + " I can't match a full recipe. Adding basics like onions, eggs or rice gives me more to work with.";
        return "From what's in the house: " + m.map(function (r) {
            return r.name + " (" + r.time + " min" + (r.missing.length ? ", you'd still need " + listify(r.missing) : ", you have everything") + ")";
        }).join("; ") + ".";
    }

    /* ---------------- snapshot for Elara AI (only what this person may see) ---------------- */
    function context() {
        var w = window.__elaraWeather, ctx = { name: D.me().first, today: today(), time: hm(), homeName: localStorage.getItem("elaraHomeName") || "" };
        if (D.can("tasks")) ctx.openTasks = D.tasks.all().filter(function (t) { return t.status !== "Completed"; }).slice(0, 15).map(function (t) { return t.title + " (" + t.date + ", " + (t.assignee || "unassigned") + ")"; });
        if (D.can("schedule")) ctx.events = D.util.load("elaraSchedules", []).filter(function (e) { return e.date >= today() && e.date <= D.util.dayKey(D.util.addDays(new Date(), 7)); }).slice(0, 15).map(function (e) { return e.date + " " + e.time + " " + e.title; });
        if (D.can("smartHome")) {
            ctx.devicesOn = D.devices.all().filter(function (d) { return d.on; }).map(function (d) { return d.name + " (" + d.room + ")"; });
            ctx.energyWeekKwh = +D.energy.compute("week").total.toFixed(1);
        }
        if (D.can("shopping")) {
            ctx.shoppingList = D.util.load("elaraShoppingItems", []).filter(function (i) { return !D.util.load("elaraCartItems", []).some(function (c) { return c.id === i.id; }); }).slice(0, 20).map(function (i) { return i.name; });
            ctx.inHouse = pantry().slice(0, 40).map(function (p) { return p.name + (p.qty ? " x" + p.qty : ""); });
        }
        ctx.members = D.members.active().map(function (m) { return m.name + (m.isMe ? " (me)" : ""); });
        if (w) ctx.weather = { temp: w.temp, city: w.city };
        return ctx;
    }

    var history = [];
    /* the AI may answer with "DO: <command>" lines: Elara runs them as if the person had typed them
       (only the built-in commands exist, and each one checks the person's permissions) */
    function askAI(text) {
        return D.callFunction(cfg.aiEndpoint, { message: text, context: context(), history: history.slice(-6) }).then(function (j) {
            var reply = String(j.reply || ""), cmds = [];
            reply.split(/\n+/).forEach(function (line) { var m = line.match(/^\s*[-*]?\s*\**DO:\**\s*(.+?)\s*$/i); if (m) cmds.push(m[1].replace(/^["“'`]|["”'`]$/g, "")); });
            if (!cmds.length) return reply;
            var rest = reply.split(/\n+/).filter(function (l) { return !/^\s*[-*]?\s*\**DO:/i.test(l); }).join(" ").trim();
            return Promise.all(cmds.slice(0, 5).map(function (c) {
                return Promise.resolve(local(c)).then(function (r) { return r == null ? "I couldn't do “" + c + "”." : r; }, function (e) { return "“" + c + "” failed: " + e.message; });
            })).then(function (results) { return (results.join(" ") + (rest ? " " + rest : "")).trim(); });
        });
    }

    /* ---------------- commands ---------------- */
    /* how people actually talk: "Hey Elara, could you please add juice." -> "add juice" */
    function clean(raw) {
        var t = String(raw || "").trim().replace(/[.!?\u2026]+$/g, "").trim();
        for (var i = 0; i < 3; i++) {
            t = t.replace(/^(?:hey|hi|hello|ok|okay)\s+elara[,!]?\s*/i, "").replace(/^elara[,!:]?\s+/i, "")
                 .replace(/^(?:can|could|would|will)\s+you\s+(?:please\s+)?/i, "").replace(/^please[,]?\s+/i, "")
                 .replace(/^i\s+(?:want|would like|'d like)\s+(?:you\s+)?to\s+/i, "")
                 .replace(/[,]?\s+(?:please|for me|thanks|thank you)$/i, "").replace(/[.!?,]+$/g, "").trim();
        }
        return t;
    }
    /* ---------------- shopping: understand quantity, size, price, category and shop ----------------
       "add 2 litres of milk for R25", "add 3 bread at R18 each", "washing powder 2kg, cleaning, R89",
       "add 6 eggs and toothpaste from Clicks" */
    var SHOP_CATS = ["Groceries", "Cleaning", "Household", "Electronics", "Personal Care"];
    var CAT_WORDS = [
        ["Cleaning", /\b(clean(?:er|ing)?|detergent|washing (?:powder|liquid)|dish(?:washing)?|bleach|jik|handy andy|sunlight|domestos|mr muscle|sponge|scourer|mop|fabric softener|sta-?soft|surface spray|toilet cleaner|vim|ariel|omo|skip)\b/i],
        ["Personal Care", /\b(toothpaste|toothbrush|shampoo|conditioner|deodorant|roll-?on|body ?wash|lotion|vaseline|razor|shav(?:er|ing)|sanitary|pads|tampons|soap bar|bath soap|lip ?balm|face wash|sunscreen|plasters|medicine|panado|vitamins?)\b/i],
        ["Electronics", /\b(batter(?:y|ies)|charger|cable|adapter|earphones|headphones|extension (?:cord|lead)|multi-?plug|usb|power ?bank|remote)\b/i],
        ["Household", /\b(toilet (?:paper|roll)|tissues?|serviettes?|paper towels?|light ?bulbs?|bulbs?|candles?|matches|foil|cling ?wrap|bin bags?|refuse bags?|black bags?|plastic bags?|plates|cups|batteries for|gas refill|firelighters|charcoal|wood)\b/i]
    ];
    var NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, "a dozen": 12, "half a dozen": 6, couple: 2, "a couple of": 2, "a few": 3 };
    var SIZE_UNIT = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilograms?|g|grams?|l|lt|litres?|liters?|ml|millilitres?)\b/i;
    var PACKS = /\b(bottles?|packs?|packets?|bags?|boxes?|loa(?:f|ves)|cartons?|cans?|tins?|tubs?|jars?|rolls?|bunch(?:es)?|trays?|dozen)\b/i;
    var SHOPS = /\b(?:from|at)\s+(checkers(?: hyper)?|woolworths|woolies|pick ?n ?pay|pnp|spar|shoprite|makro|game|clicks|dis-?chem|food lover'?s(?: market)?|ok foods|boxer|usave|u-save)\b/i;
    function money(v) { return "R" + v.toFixed(2); }
    function singular(w) {
        w = w.toLowerCase();
        if (/ves$/.test(w)) return w.replace(/ves$/, "f");                 // loaves -> loaf
        if (/(ches|shes|xes|sses)$/.test(w)) return w.replace(/es$/, "");  // bunches, boxes
        return w.replace(/s$/, "");                                         // bottles, cans, rolls
    }
    function unitLabel(u) {
        u = u.toLowerCase();
        return /^k/.test(u) ? "kg" : /^g/.test(u) ? "g" : /^m/.test(u) ? "ml" : "L";
    }
    function guessCategory(name) {
        for (var i = 0; i < CAT_WORDS.length; i++) if (CAT_WORDS[i][1].test(name)) return CAT_WORDS[i][0];
        return "Groceries";
    }
    function parseItem(seg) {
        var s = " " + String(seg).trim() + " ", it = { qty: null, price: null, each: false, total: false, category: null, size: "", pack: "", shop: "" };
        // price: "R25", "R 25,50", "25 rand", "for R50", "at R18 each", "R18 a piece"
        var pm = s.match(/(?:\b(?:for|at|@|costs?|costing|price(?:d)?(?: at)?|about|around)\s+)?\bR\s?(\d{1,6}(?:[.,]\d{1,2})?)\b(\s*(?:each|ea|a piece|per (?:item|one|piece|unit)|apiece))?(\s*(?:in total|total|altogether|for (?:all|both|the lot)))?/i) ||
                 s.match(/(?:\b(?:for|at|costs?|about|around)\s+)?\b(\d{1,6}(?:[.,]\d{1,2})?)\s*rand\b(\s*(?:each|a piece|apiece))?(\s*(?:in total|total|altogether))?/i);
        if (pm) { it.price = Number(pm[1].replace(",", ".")); it.each = !!pm[2]; it.total = !!pm[3] || /\bfor\s/i.test(pm[0]) && !pm[2]; s = s.replace(pm[0], " "); }
        // category: "in cleaning", "under personal care", "category household", or the word on its own
        var cm = s.match(/\b(?:in|under|as|into|category|for)\s+(?:the\s+)?(groceries|grocery|cleaning|household|electronics|personal care)(?:\s+(?:category|section))?\b/i) ||
                 s.match(/(?:^|[\s,])(groceries|cleaning|household|electronics|personal care)\s*$/i);
        if (cm) { var c = cm[1].toLowerCase(); it.category = SHOP_CATS.filter(function (x) { return x.toLowerCase() === c || (c === "grocery" && x === "Groceries"); })[0]; s = s.replace(cm[0], " "); }
        var sh = s.match(SHOPS); if (sh) { it.shop = cap(sh[1].replace(/^woolies$/i, "Woolworths").replace(/^pnp$/i, "Pick n Pay")); s = s.replace(sh[0], " "); }
        s = s.replace(/^\s*(?:some|more|another|the)\s+/i, " ").trim();
        // quantity at the start: "3 bread", "2 x milk", "three cans of beans", "a dozen eggs"
        var qm = s.match(/^(\d{1,2})\s*(?:x|×)\s*/i) || s.match(/^(half a dozen|a dozen|a couple of|a few|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|\d{1,2})\s+(?![a-z]*\s*(?:kg|g|l|ml)\b)/i);
        if (qm && !/^\d+(?:[.,]\d+)?\s*(?:kg|kilos?|g|grams?|l|lt|litres?|liters?|ml)\b/i.test(s)) {
            var w = qm[1].toLowerCase(); it.qty = NUM_WORDS[w] || Number(w); s = s.slice(qm[0].length);
        }
        var tail = s.match(/\s+(?:x|×)\s*(\d{1,2})$/i) || s.match(/,?\s+(?:qty|quantity)\s*(\d{1,2})$/i) || s.match(/\s+(\d{1,2})\s+(?:of them|pieces|items)$/i);
        if (tail) { it.qty = Number(tail[1]); s = s.slice(0, tail.index); }
        // size: "2 litres of milk", "milk 2L", "1kg sugar"
        var sm = s.match(SIZE_UNIT);
        if (sm) { it.size = sm[1].replace(",", ".") + " " + unitLabel(sm[2]); s = s.replace(sm[0], " "); }
        // containers: "3 bottles of juice" -> qty 3, "bottle"
        var pk = s.match(new RegExp("^\\s*(?:of\\s+)?" + PACKS.source + "\\s+of\\s+", "i")) || s.match(new RegExp("^\\s*" + PACKS.source + "\\s+", "i"));
        if (pk) { it.pack = singular(pk[1]); if (it.pack === "dozen") { it.qty = (it.qty || 1) * 12; it.pack = ""; } s = s.slice(pk[0].length); }
        // a count inside one pack: "toilet paper 18 rolls", "nappies 60 pack", "teabags 100s"
        var inPack = s.match(/\s+(\d{1,3})\s*(rolls?|pack|pk|pieces|pcs|bags|sachets|tablets|s)\b\s*$/i);
        if (inPack) { it.size = (it.size ? it.size + " \u2022 " : "") + inPack[1] + " " + (/^(pk|pack)$/i.test(inPack[2]) ? "pack" : /^s$/i.test(inPack[2]) ? "pack" : inPack[2].toLowerCase().replace(/^pcs$/, "pieces")); s = s.slice(0, inPack.index); }
        s = s.replace(/^\s*of\s+/i, "").replace(/\s+(?:please|for me)$/i, "").replace(/[,.;:]+$/g, "").replace(/\s+/g, " ").trim();
        it.name = cap(s).slice(0, 60);
        if (!it.qty) it.qty = 1;
        it.qty = Math.max(1, Math.min(99, Math.round(it.qty)));
        if (it.price != null) {
            if (!isFinite(it.price) || it.price < 0 || it.price > 100000) it.price = null;
            else if (it.total && !it.each && it.qty > 1) it.price = Math.round(it.price / it.qty * 100) / 100;
        }
        if (!it.category) it.category = guessCategory(it.name + " " + it.pack);
        return it;
    }
    /* "milk 2L, R25" is one item with extra details, "milk, bread and eggs" is three items */
    function splitItems(text) {
        var parts = String(text).split(/\s*,\s*|\s+and\s+|\s*&\s*|\s+plus\s+/i).filter(Boolean), out = [];
        parts.forEach(function (p) {
            var onlyExtra = /^(?:(?:for|at|@|costs?|about)\s+)?(?:R\s?\d|\d+(?:[.,]\d+)?\s*rand)/i.test(p) ||
                            /^(?:in\s+|under\s+|category\s+)?(?:groceries|grocery|cleaning|household|electronics|personal care)(?:\s+category)?$/i.test(p) ||
                            /^\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|litres?|liters?)$/i.test(p) || /^(?:x|×)\s*\d+$/i.test(p) || /^(?:from|at)\s+[a-z]/i.test(p) && SHOPS.test(p) ||
                            /^(?:each|a piece|in total|total)$/i.test(p);
            if (onlyExtra && out.length) out[out.length - 1] += " " + p; else out.push(p);
        });
        return out.slice(0, 10);
    }
    function addShopping(text) {
        if (!D.can("shopping", "edit")) return noEdit("Shopping");
        var parsed = splitItems(text).map(parseItem).filter(function (x) { return x.name.length >= 2 && /[a-z]/i.test(x.name); });
        if (!parsed.length) return "What should I add to the shopping list?";
        var items = D.util.load("elaraShoppingItems", []), done = [], updated = [], already = [], m = D.me();
        parsed.forEach(function (p, i) {
            var details = [p.size, p.pack && !p.size ? p.pack : "", p.shop].filter(Boolean).join(" • ");
            var ex = items.filter(function (x) { return norm(x.name) === norm(p.name); })[0];
            if (ex) {                                   // already on the list: fill in what was said
                var said = p.qty > 1 || p.price != null || !!details || /\b(groceries|cleaning|household|electronics|personal care)\b/i.test(text);
                if (!said) { already.push(ex.name); return; }
                if (p.qty > 1 || /^(1|one|a|an)\b/i.test(text)) ex.qty = p.qty;
                if (p.price != null) ex.price = p.price;
                if (details) ex.details = details;
                if (p.category) { ex.category = p.category; ex.icon = iconForCat(p.category); }
                ex.updatedAt = Date.now(); ex.updatedBy = m.id;
                updated.push(describe(ex));
                return;
            }
            var item = { id: Date.now() + i, name: p.name, details: details, price: p.price != null ? p.price : 0, qty: p.qty, category: p.category,
                         status: "Pending", icon: iconForCat(p.category), by: m.id, byName: m.first, addedAt: Date.now(), priceUnknown: p.price == null || undefined };
            items.push(item); done.push(describe(item));
        });
        D.util.save("elaraShoppingItems", items);
        if (done.length) {
            D.log("added " + listify(parsed.filter(function (p) { return done.some(function (d) { return d.indexOf(p.name) === 0; }); }).map(function (p) { return p.name; })) + " to the shopping list", "fa-cart-shopping");
            D.notify({ to: "household", kind: "shopping", title: "Added to the shopping list", body: m.first + " added " + listify(done) + ".", href: "dashboard-shopping.html" });
        }
        var missingPrice = parsed.some(function (p) { return p.price == null; });
        return (done.length ? "Added " + listify(done) + "." : "") + (updated.length ? (done.length ? " " : "") + "Updated " + listify(updated) + "." : "") +
               (already.length ? ((done.length || updated.length) ? " " : "") + listify(already) + (already.length === 1 ? " is" : " are") + " already on the shopping list." : "") +
               (missingPrice && done.length ? " Say the price any time, e.g. “" + parsed.filter(function (p) { return p.price == null; })[0].name.toLowerCase() + " R25”." : "");
    }
    function iconForCat(c) { return c === "Cleaning" ? "fa-bottle-water" : c === "Electronics" ? "fa-plug" : c === "Personal Care" ? "fa-pump-soap" : c === "Household" ? "fa-house" : "fa-cart-shopping"; }
    function describe(x) {
        var bits = [];
        if (x.details) bits.push(x.details);
        if (x.price) bits.push(money(x.price) + (x.qty > 1 ? " each" : ""));
        return (x.qty > 1 ? x.qty + " × " : "") + x.name + (bits.length ? " (" + bits.join(", ") + ")" : "") + " in " + x.category;
    }

    function local(raw) {
        raw = clean(raw);
        var q = norm(raw), m, d, who;

        // add a task (optionally for someone, on a day, at a time)
        if ((m = raw.match(/^(?:please\s+)?(?:add|create|new)\s+(?:a\s+)?task\s*(?:to|:)?\s*(.+)$/i)) || (m = raw.match(/^remind me to\s+(.+)$/i))) {
            if (!D.can("tasks", "edit")) return noEdit("tasks");
            var rest = m[1], assignee = D.members.find(D.me().id) || { userId: D.me().id, name: D.me().first };
            var fm = rest.match(/\s+(?:for|assign(?:ed)? to)\s+([a-z][a-z' -]{0,30}?)(?=\s+(?:today|tonight|tomorrow|on|at|this|next)\b|$)/i);
            if (fm) {
                who = findPerson(fm[1]);
                if (!who) return "I couldn't find " + cap(fm[1]) + " in your home. Tasks can only go to members: " + listify(D.members.active().map(function (x) { return x.name; })) + ".";
                assignee = who; rest = rest.replace(fm[0], "");
            }
            var date = parseDay(rest) || today(), time = parseTime(rest) || "12:00", title = cap(stripWhen(rest));
            if (title.length < 2 || title.length > 80) return "Tell me the task in 2 to 80 characters, e.g. “add task clean the garage tomorrow at 10”.";
            var all = D.tasks.all(), meNow = D.me();
            all.unshift({ id: Date.now(), title: title, description: "Added by Elara AI.", priority: "Medium", assigneeId: assignee.userId, assignee: assignee.name,
                          createdBy: meNow.id, createdByName: meNow.first, date: date, time: time, status: "Pending", progress: 0, createdAt: Date.now() });
            D.tasks.save(all); D.log("added task “" + title + "”", "fa-list-check");
            if (assignee.userId !== meNow.id) D.notify({ to: [assignee.userId], kind: "tasks", title: "New task for you", body: meNow.first + " assigned “" + title + "” (" + date + " " + time + ").", href: "dashboard-tasks.html" });
            return "Done. “" + title + "” is on " + (assignee.userId === meNow.id ? "your" : assignee.name + "'s") + " list for " + (date === today() ? "today" : date) + " at " + time + ".";
        }
        // complete a task
        if ((m = raw.match(/^(?:complete|finish|tick off|done with|mark)\s+(?:the\s+)?(?:task\s+)?(.+?)(?:\s+as (?:done|complete[d]?))?$/i)) && !/\b(busy|away|available|home)\b/i.test(raw)) {
            if (!D.can("tasks", "edit")) return noEdit("tasks");
            var needle = norm(m[1]), list = D.tasks.all();
            var t = list.filter(function (x) { return x.status !== "Completed" && norm(x.title).indexOf(needle) > -1; })[0];
            if (!t) return "I couldn't find an open task matching “" + m[1] + "”.";
            t.status = "Completed"; t.progress = 100; t.completedBy = D.me().id; t.completedByName = D.me().first; t.completedAt = Date.now();
            D.tasks.save(list); D.log("completed “" + t.title + "”", "fa-circle-check");
            if (t.createdBy && t.createdBy !== D.me().id) D.notify({ to: [t.createdBy], kind: "tasks", title: "Task completed", body: D.me().first + " completed “" + t.title + "”.", href: "dashboard-tasks.html" });
            return "Nice. “" + t.title + "” is marked as completed.";
        }
        // switch devices
        if ((m = raw.match(/^(?:please\s+)?(?:turn|switch)\s+(on|off)\s+(.+)$/i)) || (m = raw.match(/^(?:please\s+)?(?:turn|switch)\s+(.+?)\s+(on|off)$/i)) && (m = [m[0], m[2], m[1]])) {
            if (!D.can("smartHome", "edit")) return noEdit("Smart Home");
            var on = m[1].toLowerCase() === "on", target = m[2];
            if (/\b(all|every)\b.*\blights?\b/.test(norm(target)) || norm(target) === "the lights" || norm(target) === "lights") {
                var lights = D.devices.all().filter(function (x) { return x.type === "Light" || /light|lamp/i.test(x.name); });
                if (!lights.length) return "I couldn't find any lights. Set a device's type to Light on the Smart Home page.";
                return Promise.all(lights.map(function (x) { return D.devices.switch(x.id, on).then(function () { return 1; }, function () { return 0; }); })).then(function (r) {
                    var n = r.reduce(function (a, b) { return a + b; }, 0);
                    return n === lights.length ? "All " + n + " lights are now " + (on ? "on" : "off") + "." : n + " of " + lights.length + " lights switched " + (on ? "on" : "off") + "; the others didn't respond.";
                });
            }
            d = bestDevice(target);
            if (!d) return "I couldn't find a device called “" + target + "”.";
            return D.devices.switch(d.id, on).then(function () { return d.name + " (" + d.room + ") is now " + (on ? "on" : "off") + "."; },
                function (e) { return "I couldn't switch " + d.name + ": " + e.message; });
        }
        // change an item already on the list: "set the price of bread to R18", "milk is R25 each", "eggs costs R60"
        if ((m = raw.match(/^(?:set|change|update)\s+(?:the\s+)?(?:price|cost)\s+(?:of|for)\s+(?:the\s+)?(.+?)\s+(?:to|at|=)\s+(.+)$/i)) ||
            (m = raw.match(/^(?:the\s+)?(.+?)\s+(?:is|are|costs?|was|were)\s+(R\s?\d.*|\d+(?:[.,]\d{1,2})?\s*rand.*)$/i))) {
            var onList = D.util.load("elaraShoppingItems", []).some(function (x) { return norm(x.name) === norm(m[1]); });
            if (onList) return addShopping(m[1] + " " + m[2]);
        }
        // shopping list: "add juice", "add bread and milk to the list", "we need eggs", "buy sugar", "we're out of coffee"
        if ((m = raw.match(/^(?:add|put)\s+(.+?)\s+(?:to|on|onto)\s+(?:my\s+|the\s+|our\s+)?(?:shopping|grocery|groceries)?\s*(?:list|basket|cart)$/i)) ||
            (m = raw.match(/^(?:add|put)\s+(.+?)\s+(?:to|on|onto)\s+(?:my\s+|the\s+|our\s+)?(?:shopping|groceries)$/i)) ||
            (m = raw.match(/^(?:we|i)\s+(?:need|want)(?:\s+to\s+(?:buy|get))?\s+(?:some\s+|more\s+)?(.+)$/i)) ||
            (m = raw.match(/^(?:we're|we are|were|i'm|i am)\s+(?:out of|running (?:low on|out of))\s+(.+)$/i)) ||
            (m = raw.match(/^(?:buy|get me|pick up)\s+(.+)$/i)) ||
            ((m = raw.match(/^add\s+(.+)$/i)) && !/\b(task|event|calendar|schedule|appointment|reminder|meeting|member|device|automation)\b/i.test(raw))) {
            return addShopping(m[1]);
        }
        // availability: "I'm busy tomorrow", "mark Sarah as away on friday"
        if ((m = raw.match(/^(?:i am|i'm|im|set me|mark me)\s+(?:as\s+)?(busy|away|available|free)\b(.*)$/i)) ||
            (m = raw.match(/^(?:mark|set)\s+([a-z][a-z' -]{0,30}?)\s+(?:as\s+)?(busy|away|available|free)\b(.*)$/i)) && (m = [m[0], m[2], m[3], m[1]])) {
            var state = m[1].toLowerCase() === "free" ? "available" : m[1].toLowerCase();
            var person = m[3] ? findPerson(m[3]) : D.members.find(D.me().id);
            if (!person) return "I couldn't find " + cap(m[3]) + " in your home.";
            if (!person.isMe && !D.household.isOwner) return "Only the home owner can change someone else's status.";
            var day = parseDay(m[2]) || today();
            D.availability.set(day, person.userId, state);
            D.log((person.isMe ? "is" : "marked " + person.name + " as") + " " + state + " on " + day, "fa-user-clock");
            return (person.isMe ? "You're" : person.name + " is") + " now " + state + " on " + (day === today() ? "today" : day) + ".";
        }
        // navigation
        if (/\b(open|go to|take me to|show me)\b/.test(q)) {
            var map = { "task": "dashboard-tasks.html", "shopping": "dashboard-shopping.html", "schedule": "dashboard-schedule.html", "calendar": "dashboard-schedule.html",
                "smart home": "dashboard-smart-home.html", "device": "dashboard-smart-home.html", "analytics": "dashboard-analytics.html", "report": "dashboard-reports.html",
                "member": "dashboard-members.html", "setting": "dashboard-settings.html", "dashboard": "dashboard-content.html", "home page": "dashboard-content.html" };
            for (var k in map) if (q.indexOf(k) > -1) { var url = map[k]; setTimeout(function () { location.href = url; }, 900); return "Opening " + k + "..."; }
        }
        // meals
        if (/\b(cook|meal|dinner|lunch|breakfast|recipe|eat|food|hungry|supper)\b/.test(q)) {
            if (!D.can("shopping")) return "I need access to Shopping to see what's in the house.";
            var items2 = pantry();
            if (cfg.aiEndpoint && items2.length) return askAI(raw).catch(function () { return mealReply(items2); });
            return mealReply(items2);
        }
        if (/\b(in the house|pantry|in stock|do we have|what do we have)\b/.test(q)) {
            if (!D.can("shopping")) return "I need access to Shopping to see what's in the house.";
            var p = pantry();
            return p.length ? "In the house: " + listify(p.slice(0, 15).map(function (x) { return x.name; })) + "." : "Nothing is recorded as in the house yet.";
        }
        if (/\b(weather|temperature|rain|hot|cold|forecast)\b/.test(q)) {
            var w = window.__elaraWeather;
            return w ? "It's " + (window.ElaraCommon ? ElaraCommon.fmtTemp(w.temp) : Math.round(w.temp) + "°C") + " in " + w.city + (w.rain != null ? ", with " + Math.round(w.rain) + "% chance of rain." : ".") : "Open the Dashboard and I'll fetch the weather.";
        }
        if (/\b(energy|power|electric|electricity|kwh)\b/.test(q) && /\b(how much|how many|what is|what's|whats|show|usage|used|using|consumption|bill|cost)\b/.test(q) &&
            !/\b(tip|tips|save|saving|reduce|lower|cut|why|should|advice|idea|ideas)\b/.test(q)) {
            if (!D.can("smartHome")) return "You don't have access to the energy data.";
            var td = D.energy.compute("today"), wk = D.energy.compute("week");
            if (!wk.metered) return "None of your connected switches has a power meter, so I can't measure energy yet.";
            if (!wk.hasData) return "Your meters are connected but nothing has been measured yet. Check again in a few minutes.";
            var top = wk.devices.filter(function (x) { return x.kwh > 0; })[0];
            return "Right now: " + Math.round(td.livePower) + " W. Today: " + td.total.toFixed(2) + " kWh (about R" + td.cost.toFixed(2) + "). Last 7 days: " + wk.total.toFixed(1) + " kWh, about R" + wk.cost.toFixed(2) + (top ? ". " + top.name + " used the most." : ".");
        }
        if (/\b(task|todo|to do|chores?)\b/.test(q)) {
            if (!D.can("tasks")) return "You don't have access to tasks.";
            var mine = /\bmy\b/.test(q), open = D.tasks.all().filter(function (t) { return t.status !== "Completed" && (!mine || t.assigneeId === D.me().id); });
            return open.length ? (mine ? "You have " : "There are ") + open.length + " open task" + (open.length === 1 ? "" : "s") + ": " + listify(open.slice(0, 4).map(function (t) { return t.title; })) + "." : "All caught up. No open tasks.";
        }
        if (/\b(schedule|calendar|agenda|event|today|tomorrow)\b/.test(q)) {
            if (!D.can("schedule")) return "You don't have access to the schedule.";
            var dd = parseDay(q) || today();
            var ev = D.util.load("elaraSchedules", []).filter(function (e) { return e.date === dd; }).sort(function (a, b) { return a.time.localeCompare(b.time); });
            return ev.length ? (dd === today() ? "Today" : dd) + ": " + listify(ev.map(function (e) { return e.title + " at " + e.time; })) + "." : "Nothing is scheduled for " + (dd === today() ? "today" : dd) + ".";
        }
        if (/\b(who|family|members?|busy|away)\b/.test(q)) {
            var pres = D.presence.all();
            var states = D.members.active().map(function (x) { return x.name + " (" + (pres[x.userId] && pres[x.userId].state === "away" ? "away" : D.availability.on(today(), x.userId)) + ")"; });
            return "Today: " + listify(states) + ".";
        }
        if (/\b(devices?|lights?|on now)\b/.test(q)) {
            if (!D.can("smartHome")) return "You don't have access to the devices.";
            var onNow = D.devices.all().filter(function (x) { return x.on; });
            return onNow.length ? onNow.length + " device(s) are on: " + listify(onNow.slice(0, 6).map(function (x) { return x.name; })) + "." : "Everything is switched off.";
        }
        if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(q)) return "Hi " + D.me().first + "! I can add tasks, switch devices, suggest meals, check energy, the weather and your schedule. Just ask.";
        if (/\b(help|what can you do)\b/.test(q)) return "Try: “add task clean the garage for Thabo tomorrow at 10”, “turn off the geyser”, “add bread to the shopping list”, “what can I cook tonight”, “I'm busy on Friday”, “what's on tomorrow” or “how much energy did we use”.";
        return null;
    }

    var aiDown = false;                 // stop retrying for this page once we know the AI function isn't there
    function handle(text) {
        text = String(text || "").trim().slice(0, 500);
        if (!text) return Promise.resolve("Say or type something first.");
        history.push({ role: "user", text: text });
        return Promise.resolve(local(text)).then(function (answer) {
            if (answer != null) return answer;
            var notOn = "I didn't catch a command in “" + text.slice(0, 60) + "”. Elara AI isn't switched on yet (README, step 7), but I can still do things like “turn off the geyser”, “add milk to the shopping list”, “I'm busy tomorrow” or “what can I cook?”. Say “help” for more.";
            if (!cfg.aiEndpoint || aiDown) return notOn;
            return askAI(text).catch(function (e) {
                var msg = String(e.message || "");
                // the function isn't deployed (Supabase answers without permission headers, so the browser says "Failed to fetch") or has no key
                if (/failed to fetch|networkerror|load failed|could not load|not set|no ai key|anthropic|groq|404|not found/i.test(msg) || e.status === 404 || e.status === 500) {
                    if (navigator.onLine !== false) aiDown = true;
                    return navigator.onLine === false ? "You're offline, so I can't ask Elara AI. Commands like “turn off the geyser” still work once you're back online." : notOn;
                }
                if (e.status === 429) return msg;
                return "I couldn't reach Elara AI right now (" + msg + ").";
            });
        }).then(function (answer) { history.push({ role: "assistant", text: answer }); history = history.slice(-12); return answer; });
    }

    window.ElaraAssistant = { handle: handle, context: context, pantry: pantry, meals: localMeals, mealReply: mealReply, parseDay: parseDay, parseTime: parseTime };
})();
