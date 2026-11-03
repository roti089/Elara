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
        if (/\bday after tomorrow\b/.test(t)) return D.util.dayKey(D.util.addDays(now, 2));
        if (/\btomorrow\b/.test(t)) return D.util.dayKey(D.util.addDays(now, 1));
        for (var i = 0; i < 7; i++) {
            if (new RegExp("\\b(on |this |next )?" + DAYS[i] + "\\b").test(t)) {
                var diff = (i - now.getDay() + 7) % 7;               // "friday" on a Friday = today
                if (/\bnext\b/.test(t)) diff += diff === 0 ? 7 : (diff < 7 && /\bnext week\b/.test(t) ? 7 : 0);
                return D.util.dayKey(D.util.addDays(now, diff));
            }
        }
        var MON = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
        var m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?(?: of)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/) ||
                (function (x) { return x && [x[0], x[2], x[1]]; })(t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (?:the )?(\d{1,2})(?:st|nd|rd|th)?\b/));
        if (m) {
            var month = MON.indexOf(m[2]);
            var d = new Date(now.getFullYear(), month, +m[1]);
            if (d < D.util.startOfDay(now)) d.setFullYear(d.getFullYear() + 1);
            if (d.getMonth() === month) return D.util.dayKey(d);
        }
        // "on the 12th": this month, or next month if that day has passed
        var o = t.match(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/);
        if (o) {
            var dd = new Date(now.getFullYear(), now.getMonth(), +o[1]);
            if (dd < D.util.startOfDay(now)) dd = new Date(now.getFullYear(), now.getMonth() + 1, +o[1]);
            if (dd.getDate() === +o[1]) return D.util.dayKey(dd);
        }
        if (/\bnext week\b/.test(t)) return D.util.dayKey(D.util.addDays(now, 7));
        if (/\bday after tomorrow\b/.test(t)) return D.util.dayKey(D.util.addDays(now, 2));
        return null;
    }
    /* "at 5pm", "at 17:30", "at 9" -> HH:MM (or null) */
    function timeText(text) {
        return String(text).toLowerCase().replace(/\b([ap])\.?\s?m\b\.?/g, "$1m").replace(/(\d)\.(\d{2})\b/g, "$1:$2").replace(/\bo'?clock\b/g, "");
    }
    function parseTimeFull(text) {
        var t = timeText(text), h, mi = 0, ap = null, m;
        if (/\b(at )?(noon|midday|lunchtime)\b/.test(t)) return { time: "12:00", explicit: true };
        if (/\b(at )?midnight\b/.test(t)) return { time: "00:00", explicit: true };
        if ((m = t.match(/\b(?:at )?half past (\d{1,2})\b/))) { h = +m[1]; mi = 30; }
        else if ((m = t.match(/\b(?:at )?quarter past (\d{1,2})\b/))) { h = +m[1]; mi = 15; }
        else if ((m = t.match(/\b(?:at )?quarter to (\d{1,2})\b/))) { h = +m[1] - 1; mi = 45; }
        else if ((m = t.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)) || (m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)) || (m = t.match(/\b(\d{1,2}):(\d{2})\b()/))) {
            h = +m[1]; mi = +(m[2] || 0); ap = m[3] || null;
        } else return null;
        if (!ap && /\b(in the )?(afternoon|evening|tonight|at night)\b/.test(t)) ap = "pm";
        if (!ap && /\bin the morning\b/.test(t)) ap = "am";
        if (ap === "pm" && h < 12) h += 12;
        if (ap === "am" && h === 12) h = 0;
        if (h > 23 || mi > 59 || h < 0) return null;
        return { time: D.util.pad(h) + ":" + D.util.pad(mi), explicit: !!ap || h >= 13 || /:\d{2}/.test(m[0]) || h === 0 };
    }
    function parseTime(text) { var r = parseTimeFull(text); return r ? r.time : null; }
    var MONTH_RE = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
    function stripWhen(text) {
        return timeText(text)
            .replace(new RegExp("\\s*\\b(?:on |for |by )?(?:the )?\\d{1,2}(?:st|nd|rd|th)?(?: of)? " + MONTH_RE + "\\b", "ig"), "")
            .replace(new RegExp("\\s*\\b(?:on |for |by )?" + MONTH_RE + " (?:the )?\\d{1,2}(?:st|nd|rd|th)?\\b", "ig"), "")
            .replace(/\s*\b(?:on |for |by )?the \d{1,2}(?:st|nd|rd|th)\b/ig, "")
            .replace(/\s*\b(for |by )?(the day after tomorrow|day after tomorrow|today|tonight|tomorrow|next week|(on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/ig, "")
            .replace(/\s*\b(?:at )?(?:half past|quarter past|quarter to) \d{1,2}\b/ig, "").replace(/\s*\b(?:at )?(?:noon|midday|lunchtime|midnight)\b/ig, "")
            .replace(/\s*\bat \d{1,2}(:\d{2})?(?:\s*(am|pm))?\b/ig, "").replace(/\s*\b\d{1,2}(:\d{2})?\s*(am|pm)\b/ig, "").replace(/\s*\b\d{1,2}:\d{2}\b/ig, "")
            .replace(/\s*\b(in the|this) (morning|afternoon|evening)\b/ig, "").replace(/\s*\bat night\b/ig, "")
            .replace(/\s+/g, " ").trim().replace(/[.!,]$/, "");
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
    /* only food counts for meals: toothpaste or bleach in the house must never become an "ingredient" */
    function isFood(x) { return !x.category || x.category === "Groceries"; }
    function pantry() {
        var p = D.util.load("elaraPantry", []).filter(function (x) { return !x.usedUp && isFood(x); });
        // things bought recently count as "in the house" too
        var cutoff = Date.now() - 14 * 86400000;
        D.util.load("elaraCartItems", []).forEach(function (c) {
            if ((c.addedAt || 0) > cutoff && isFood(c) && !p.some(function (x) { return norm(x.name) === norm(c.name); })) p.push({ name: c.name, category: c.category, fromCart: true });
        });
        return p;
    }
    /* does the house have this ingredient? ("boerewors|wors|sausage" = any of these words) */
    function haveFn(items) {
        var have = items.map(function (x) { return norm(x.name); });
        return function (need) { return String(need).toLowerCase().split("|").some(function (alt) { alt = alt.trim(); return alt && have.some(function (h) { return h.indexOf(alt) > -1 || alt.indexOf(h) > -1 && h.length > 3; }); }); };
    }
    function rankMeals(items, n, minScore) {
        var has = haveFn(items);
        return RECIPES.map(function (r) {
            var got = r.needs.filter(has), missing = r.needs.filter(function (x) { return !has(x); });
            return { name: r.name, time: r.time, score: got.length / r.needs.length, needs: r.needs.slice(), uses: got.map(function (g) { return g.split("|")[0]; }), missing: missing.map(function (m) { return m.split("|")[0]; }) };
        }).filter(function (r) { return r.score >= (minScore == null ? 0.5 : minScore); }).sort(function (a, b) { return b.score - a.score || a.time - b.time; }).slice(0, n || 3);
    }
    function localMeals(items) { return rankMeals(items, 3, 0.5); }
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

    /* ---------------- schedule: add events by voice ---------------- */
    var EVENT_WORDS = "appointment|meeting|party|braai|birthday|dinner|lunch|breakfast|visit|service|class|lesson|practice|training|match|game|event|interview|call|check-?up|wedding|funeral|church|service|trip|flight|exam|test|concert|movie|outing|date|celebration|gathering|reunion|delivery|installation|inspection";
    function eventCommand(raw) {
        if (/\btasks?\b/i.test(raw) || /^remind me to\b/i.test(raw)) return null;
        var m;
        if ((m = raw.match(/^(?:add|create|make|new|set up|book|plan|put in)\s+(?:an?\s+|the\s+)?(?:new\s+)?(event|appointment|meeting|calendar event)\s*(?:for|called|named|about|:)?\s*(.+)$/i)))
            return { text: /event/i.test(m[1]) && !/^(with|on|at|tomorrow|today|tonight|next|this)\b/i.test(m[2]) ? m[2] : cap(m[1].toLowerCase().replace("calendar ", "")) + " " + m[2] };
        if ((m = raw.match(/^(?:add|put|schedule|book)\s+(.+?)\s+(?:to|on|in|into)\s+(?:the\s+|my\s+|our\s+)?(?:calendar|schedule|diary|planner)\b\s*(.*)$/i))) return { text: m[1] + " " + m[2] };
        if ((m = raw.match(/^schedule\s+(?:an?\s+|the\s+)?(.+)$/i)) && !/^(for|on)\b/i.test(m[1])) return { text: m[1] };
        // "add / book a dentist appointment tomorrow at 3": an event word plus a day or time
        if ((m = raw.match(new RegExp("^(?:add|book|make|plan|organi[sz]e|set up)\\s+(?:an?\\s+|the\\s+|my\\s+|our\\s+)?(.*\\b(?:" + EVENT_WORDS + ")\\b.*)$", "i"))) &&
            !/\b(shopping|grocery|groceries)?\s*(list|basket|cart)\b/i.test(raw) && (parseDay(raw) || parseTimeFull(raw))) return { text: m[1] };
        return null;
    }
    function eventCategory(t) {
        t = t.toLowerCase();
        var c = t.match(/\b(?:in |under )?(?:category\s+)?(personal|household|shopping|maintenance|smart home)(?:\s+category)?\b/);
        if (c && /category|\bin |\bunder /.test(c[0])) return cap(c[1]).replace("Smart home", "Smart Home");
        if (/\b(service|plumber|electrician|repair|fix|mechanic|car|maintenance|technician|inspection|pest|gardener|pool guy|roof|leak)\b/.test(t)) return "Maintenance";
        if (/\b(shopping|grocer|groceries|mall|market|makro|checkers|woolworths|pick n pay|shoprite)\b/.test(t)) return "Shopping";
        if (/\b(geyser|solar|inverter|wi-?fi|internet|fibre|dstv|smart|installation|cbi)\b/.test(t)) return "Smart Home";
        if (/\b(braai|family|party|guests|visit(?:ors)?|birthday|cleaning|clean|church|dinner|lunch|celebration|gathering|reunion|house ?meeting|rent|bill|levy|municipal|delivery)\b/.test(t)) return "Household";
        return "Personal";
    }
    function eventPeople(text) {
        var all = D.members.active(), meP = D.members.find(D.me().id) || { userId: D.me().id, name: D.me().first, isMe: true };
        var m = text.match(/\s+(?:with|for|and invite|invite)\s+(everyone|everybody|all of us|us all|the (?:whole )?(?:family|household|house)|[a-z][a-z' ,-]*?)(?=\s+(?:today|tonight|tomorrow|on|at|this|next|every|in|from|the \d)\b|[.,]?$)/i);
        if (!m) return { people: [meP], text: text };
        if (/^(everyone|everybody|all of us|us all|the (?:whole )?(?:family|household|house))$/i.test(m[1].trim())) return { people: all.length ? all : [meP], text: text.replace(m[0], "") };
        var names = m[1].split(/\s*(?:,|\band\b|&)\s*/).map(function (x) { return x.trim(); }).filter(Boolean), found = [], missing = [];
        names.forEach(function (n) { var p = findPerson(n); if (p) { if (!found.some(function (f) { return f.userId === p.userId; })) found.push(p); } else missing.push(n); });
        // a name nobody in the home has ("with Sipho") is an error; "lunch with the team" is just part of the event's name
        var GENERIC = /^(the|my|our|a|today|tonight|tomorrow|next|this|sunday|monday|tuesday|wednesday|thursday|friday|saturday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|team|friends?|colleagues?|family|kids|children|boss|clients?|customers?|guys|girls|mom|mum|dad|parents|neighbours?|neighbors?|doctor|dentist|teacher|coach)\b/i;
        var named = missing.filter(function (n) { return !GENERIC.test(n) && n.split(" ").length <= 2 && new RegExp("\\b" + n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() + "\\b").test(text); });
        if (!found.length && !named.length) return { people: [meP], text: text };
        if (!found.length) missing = named;
        if (missing.length) return { error: "I couldn't find " + listify(missing.map(cap)) + " in your home. Events can include: " + listify(all.map(function (x) { return x.name; })) + "." };
        if (/^\s+with\b/i.test(m[0]) && !found.some(function (f) { return f.userId === meP.userId; })) found.unshift(meP);   // "with Thabo" = you and Thabo
        return { people: found, text: text.replace(m[0], "") };
    }
    function stateOn(date, uid) {
        var pres = D.presence.all()[uid];
        if (date === today() && pres && pres.state === "away" && D.availability.on(date, uid) === "available") return "away";
        return D.availability.on(date, uid);
    }
    function prettyDay(k) { return k === today() ? "today" : k === D.util.dayKey(D.util.addDays(new Date(), 1)) ? "tomorrow" : new Date(k + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }); }
    function addEvent(text) {
        if (!D.can("schedule", "edit")) return noEdit("the schedule");
        var repeat = /\b(every ?day|daily)\b/i.test(text) ? "daily" : /\b(every ?week|weekly|every (sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/i.test(text) ? "weekly" : /\b(every ?month|monthly)\b/i.test(text) ? "monthly" : "";
        var body = text.replace(/\s*\b(every ?day|daily|every ?week|weekly|every ?month|monthly)\b/ig, "").replace(/\bevery (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/ig, "on $1");
        var who = eventPeople(body);
        if (who.error) return who.error;
        var category = eventCategory(body);
        body = who.text.replace(/\s*\b(?:in |under )?(?:the\s+)?(?:category\s+)?(?:personal|household|shopping|maintenance|smart home)\s+category\b/ig, "").replace(/\s*\bcategory\s+(?:personal|household|shopping|maintenance|smart home)\b/ig, "");
        if (/\byesterday\b|\blast (week|night|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(body)) return "That day has already passed. Give a day from today on.";
        var date = parseDay(body), t = parseTimeFull(body), nowD = new Date(), nowHM = hm(nowD);
        if (!date) date = today();
        var time = t ? t.time : null, guessed = false;
        if (t && !t.explicit) {                                                       // "at 3" for an event almost always means the afternoon
            var hh = +time.slice(0, 2);
            if (hh >= 1 && hh <= 6) { time = D.util.pad(hh + 12) + time.slice(2); guessed = true; }
        }
        if (!time) {
            guessed = true;
            if (/\btonight\b|\bevening\b/i.test(body)) time = "19:00";
            else if (/\bafternoon\b/i.test(body)) time = "14:00";
            else if (date === today()) { var nh = Math.min(23, nowD.getHours() + 1); time = D.util.pad(nh) + ":00"; }
            else time = "09:00";
        }
        var called = body.match(/\s*\b(?:called|named|titled)\s+(.+)$/i);
        if (called) body = body.replace(called[0], "").replace(/^\s*(?:an?\s+)?(?:event|appointment|meeting)\b/i, "") + " ";
        var title = cap(stripWhen(called ? called[1] : body).replace(/^(?:an?|the)\s+/i, "").replace(/\s+(?:on|at|for|from)$/i, "").replace(/^(?:called|named)\s+/i, "")).slice(0, 80);
        if (date < today()) return "That day has already passed. Give a day from today on.";
        if (date > D.util.dayKey(D.util.addDays(nowD, 5 * 365))) return "Choose a date within the next 5 years.";
        if (date === today() && time <= nowHM) return time + " has already passed today. Say a later time, or “tomorrow at " + time + "”.";
        if (title.length < 2 || !/[a-z0-9]/i.test(title) || /[<>]/.test(title)) return "What's the event called? Try “add an event dentist tomorrow at 3pm”.";
        var list = D.util.load("elaraSchedules", []);
        if (list.some(function (e) { return e.date === date && e.time === time && String(e.title).toLowerCase() === title.toLowerCase(); })) return "“" + title + "” is already on the calendar " + prettyDay(date) + " at " + time + ".";
        var dates = [date];
        if (repeat) {
            var n = repeat === "daily" ? 14 : repeat === "weekly" ? 13 : 12, d0 = new Date(date + "T12:00:00");
            for (var i = 1; i < n; i++) dates.push(D.util.dayKey(repeat === "daily" ? D.util.addDays(d0, i) : repeat === "weekly" ? D.util.addDays(d0, 7 * i) : new Date(d0.getFullYear(), d0.getMonth() + i, d0.getDate())));
        }
        var meNow = D.me(), involves = who.people.map(function (p) { return p.userId; }), series = dates.length > 1 ? "s" + Date.now() : undefined, stamp = Date.now();
        dates.forEach(function (k, idx) {
            list.push({ id: stamp + idx, title: title, category: category, date: k, time: time, description: "Added by voice.", involves: involves,
                        createdBy: meNow.id, createdByName: meNow.first, createdAt: stamp, series: series });
        });
        D.util.save("elaraSchedules", list);
        D.log("scheduled “" + title + "” for " + prettyDay(date) + " at " + time + (dates.length > 1 ? " (repeats " + repeat + ")" : ""), "fa-calendar-check");
        // tell people, the same way the Schedule page does
        var when = prettyDay(date) + " at " + time, told = {}, off = [];
        D.members.active().forEach(function (p) {
            var st = stateOn(date, p.userId);
            if (involves.indexOf(p.userId) > -1 && st !== "available") off.push((p.isMe ? "you are " : p.name + " is ") + st);
            if (p.isMe) return;
            if (st !== "available") { told[p.userId] = 1; D.notify({ to: [p.userId], kind: "schedule", title: "Event on a day you're " + st, body: meNow.first + " added “" + title + "” on " + when + ". You're marked " + st + ".", href: "dashboard-schedule.html?date=" + date }); }
        });
        involves.forEach(function (id) {
            if (id === meNow.id || told[id]) return; told[id] = 1;
            D.notify({ to: [id], kind: "schedule", title: "You're in a new event", body: meNow.first + " added you to “" + title + "” on " + when + ".", href: "dashboard-schedule.html?date=" + date });
        });
        var rest = D.members.active().filter(function (p) { return !p.isMe && !told[p.userId]; }).map(function (p) { return p.userId; });
        if (rest.length) D.notify({ to: rest, kind: "schedule", title: "New event", body: meNow.first + " added “" + title + "” on " + when + ".", href: "dashboard-schedule.html?date=" + date });
        var names = who.people.filter(function (p) { return !p.isMe; }).map(function (p) { return p.name; });
        return "Added “" + title + "” to the calendar for " + prettyDay(date) + " at " + time + (dates.length > 1 ? ", repeating " + repeat + " (" + dates.length + " times)" : "") +
            (names.length ? ", with " + listify(names) : "") + " (" + category + ")." +
            (guessed ? " I guessed the time, so change it on the Schedule page if it's wrong." : "") +
            (off.length ? " Heads-up: " + listify(off) + " that day" + (off.some(function (x) { return !/^you /.test(x); }) ? "; they've been told." : ".") : "");
    }

    /* ---------------- deleting by voice (with "undo") ----------------
       "cancel the dentist on Friday", "delete the braai", "cancel every soccer practice",
       "remove bread and milk from the shopping list", "we don't need eggs any more",
       "we're out of / finished the milk" stays shopping, but "remove eggs from in the house" or "the milk is finished" marks it used up,
       "delete task clean the garage" */
    var lastUndo = null;
    function remember(label, key, removed, revert) {
        lastUndo = { label: label, at: Date.now(), run: function () {
            if (revert) return revert();
            var list = D.util.load(key, []), have = {};
            list.forEach(function (x) { have[String(x.id)] = 1; });
            removed.forEach(function (x) { if (!have[String(x.id)]) list.push(x); });
            D.util.save(key, list);
        } };
    }
    function undoLast() {
        if (!lastUndo || Date.now() - lastUndo.at > 10 * 60000) return "There's nothing to undo. I can only undo something I deleted in the last 10 minutes, on this page.";
        var u = lastUndo; lastUndo = null; u.run();
        D.log("undid: " + u.label, "fa-rotate-left");
        return "Done, I brought back " + u.label + ".";
    }
    function matchByName(list, needle, nameOf) {
        var n = norm(needle).replace(/^(the|my|our|a|an) /, "");
        if (!n) return [];
        var exact = list.filter(function (x) { return norm(nameOf(x)) === n; });
        if (exact.length) return exact;
        return list.filter(function (x) { var h = norm(nameOf(x)); return h.indexOf(n) > -1 || (n.indexOf(h) > -1 && h.length > 3); });
    }
    function deleteCommand(raw) {
        var m;
        // shopping list
        if ((m = raw.match(/^(?:delete|remove|take|cross)\s+(.+?)\s+(?:off|from)\s+(?:of\s+)?(?:the\s+|my\s+|our\s+)?(?:shopping\s+|grocery\s+)?(?:list|basket|cart)$/i)) ||
            (m = raw.match(/^(?:delete|remove|take|cross)\s+(.+?)\s+(?:off|from)\s+(?:the\s+|my\s+|our\s+)?shopping$/i)) ||
            (m = raw.match(/^(?:we|i)\s+(?:don't|do not|dont|no longer)\s+need\s+(?:any\s+)?(.+?)(?:\s+any\s*more|\s+anymore)?$/i)))
            return deleteShopping(m[1]);
        // in the house
        if ((m = raw.match(/^(?:delete|remove|take)\s+(.+?)\s+(?:off|from|out of)\s+(?:the\s+)?(?:in the house|house|pantry|stock|cupboard|fridge)$/i)) ||
            (m = raw.match(/^(?:the\s+)?(.+?)\s+(?:is|are)\s+(?:finished|used up|all gone|done|empty)$/i)) ||
            (m = raw.match(/^(?:we|i)\s+(?:finished|used up)\s+(?:the\s+|all the\s+)?(.+)$/i)))
            return usePantry(m[1]);
        // tasks
        if ((m = raw.match(/^(?:delete|remove|cancel)\s+(?:the\s+)?task\s+(.+)$/i))) return deleteTask(m[1]);
        // events: "delete / cancel / remove (the) (event) X (on friday) (from the calendar)"
        if ((m = raw.match(/^(?:delete|remove|cancel|call off|clear)\s+(.+)$/i))) {
            var rest = m[1].replace(/\s+(?:from|off|on)\s+(?:the\s+|my\s+|our\s+)?(?:calendar|schedule|diary)$/i, "");
            var all = /^(?:all|every|each)\s+/i.test(rest) || /\b(?:and (?:the|all) repeats|and all repeats|series)\b/i.test(rest);
            rest = rest.replace(/^(?:all\s+(?:the\s+)?|every\s+|each\s+)/i, "").replace(/\s*\b(?:and (?:the|all) repeats|series)\b/ig, "").replace(/^(?:the\s+|my\s+|our\s+)?(?:event|appointment|meeting)s?\s+(?:called\s+)?/i, "");
            var r = deleteEvent(rest, all, raw);
            if (r != null) return r;
            // "remove the light bulbs": try the shopping list, then the house, before giving up
            var items = D.util.load("elaraShoppingItems", []), cart = D.util.load("elaraCartItems", []);
            if (matchByName(items.filter(function (i) { return !cart.some(function (c) { return c.id === i.id; }); }), rest, function (i) { return i.name; }).length) return deleteShopping(rest);
            var inHouse = usePantry(rest);
            if (inHouse != null) return inHouse;
            return "I couldn't find “" + rest + "” on the calendar, the shopping list or in the house.";
        }
        return null;
    }
    function deleteShopping(text) {
        if (!D.can("shopping", "edit")) return noEdit("the shopping list");
        var items = D.util.load("elaraShoppingItems", []), cart = D.util.load("elaraCartItems", []);
        var open = items.filter(function (i) { return !cart.some(function (c) { return c.id === i.id; }); });
        var asked = text.split(/\s*(?:,|\band\b|&)\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
        var gone = [], missing = [];
        asked.forEach(function (a) {
            var hits = matchByName(open.filter(function (i) { return gone.indexOf(i) < 0; }), a, function (i) { return i.name; });
            if (hits.length) gone.push(hits[0]); else missing.push(a);
        });
        if (!gone.length) return "I couldn't find " + listify(missing.map(function (x) { return "“" + x + "”"; })) + " on the shopping list.";
        D.util.save("elaraShoppingItems", items.filter(function (i) { return gone.indexOf(i) < 0; }));
        var names = gone.map(function (i) { return i.name; });
        D.log("removed " + listify(names) + " from the shopping list", "fa-trash");
        remember(listify(names) + " on the shopping list", "elaraShoppingItems", gone);
        return "Removed " + listify(names) + " from the shopping list." + (missing.length ? " I couldn't find " + listify(missing) + "." : "") + " Say “undo” to bring " + (gone.length === 1 ? "it" : "them") + " back.";
    }
    function usePantry(text) {
        if (!D.can("shopping", "edit")) return noEdit("In the House");
        var p = D.util.load("elaraPantry", []), open = p.filter(function (x) { return !x.usedUp; });
        var asked = text.replace(/\s+(?:in the house|at home)$/i, "").split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean), done = [], missing = [];
        asked.forEach(function (a) {
            var hit = matchByName(open.filter(function (x) { return done.indexOf(x) < 0; }), a, function (x) { return x.name; })[0];
            if (hit) done.push(hit); else missing.push(a);
        });
        if (!done.length) return null;                                               // not something in the house: let other commands try
        var before = JSON.parse(JSON.stringify(p)), t = Date.now();
        done.forEach(function (x) { x.usedUp = true; x.usedAt = t; x.updatedAt = t; });
        D.util.save("elaraPantry", p);
        var names = done.map(function (x) { return x.name; });
        D.log(listify(names) + (done.length === 1 ? " is" : " are") + " used up", "fa-box-open");
        remember(listify(names) + " in the house", null, null, function () { D.util.save("elaraPantry", before); });
        return listify(names) + (done.length === 1 ? " is" : " are") + " marked as used up." + (missing.length ? " I couldn't find " + listify(missing) + " in the house." : "") +
            " Say “add " + names[0].toLowerCase() + "” to put it on the shopping list, or “undo”.";
    }
    function deleteTask(text) {
        if (!D.can("tasks", "edit")) return noEdit("tasks");
        var list = D.tasks.all(), hits = matchByName(list.filter(function (t) { return t.status !== "Completed"; }), stripWhen(text), function (t) { return t.title; });
        if (!hits.length) return "I couldn't find an open task called “" + text + "”.";
        if (hits.length > 1 && norm(hits[0].title) !== norm(hits[1].title)) return "Which one: " + listify(hits.slice(0, 3).map(function (t) { return "“" + t.title + "”"; })) + "?";
        var t = hits[0];
        if (!D.tasks.canDelete(t)) return "Only the home owner or the person who added “" + t.title + "” can delete it.";
        D.tasks.save(list.filter(function (x) { return x !== t; }));
        D.log("deleted task “" + t.title + "”", "fa-trash");
        remember("the task “" + t.title + "”", null, null, function () { var l = D.tasks.all(); if (!l.some(function (x) { return x.id === t.id; })) { l.unshift(t); D.tasks.save(l); } });
        if (t.assigneeId && t.assigneeId !== D.me().id) D.notify({ to: [t.assigneeId], kind: "tasks", title: "Task removed", body: D.me().first + " deleted “" + t.title + "”.", href: "dashboard-tasks.html" });
        return "Deleted the task “" + t.title + "”. Say “undo” to bring it back.";
    }
    function deleteEvent(text, wholeSeries, raw) {
        if (!D.can("schedule", "edit")) return noEdit("the schedule");
        var day = parseDay(text), at = parseTimeFull(text), name = stripWhen(text).replace(/^(?:the|my|our)\s+/i, "");
        var all = D.util.load("elaraSchedules", []), nowKey = today(), nowHM = hm();
        var upcoming = all.filter(function (e) { return e.date > nowKey || (e.date === nowKey && (e.allDay || e.time >= nowHM)); });
        var hits = name ? matchByName(upcoming, name, function (e) { return e.title; }) : upcoming.slice();
        if (day) hits = hits.filter(function (e) { return e.date === day; });
        if (at) hits = hits.filter(function (e) { return e.time === at.time || (!at.explicit && e.time === D.util.pad(+at.time.slice(0, 2) + 12) + at.time.slice(2)); });
        if (!name && !day) return null;
        if (!hits.length) {
            // "remove the light bulbs" etc.: not an event, so don't claim it was one
            if (!/\b(event|appointment|meeting|calendar|schedule)\b/i.test(raw) && !day) return null;
            return "I couldn't find an upcoming event" + (name ? " called “" + name + "”" : "") + (day ? " on " + prettyDay(day) : "") + ".";
        }
        hits.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
        var first = hits[0];
        var sameEvent = hits.every(function (e) { return norm(e.title) === norm(first.title) && (e.series ? e.series === first.series : false); }) || hits.length === 1;
        if (!sameEvent && !wholeSeries) {
            var opts = hits.slice(0, 3).map(function (e) { return "“" + e.title + "” " + prettyDay(e.date) + " at " + e.time; });
            return "There's more than one: " + listify(opts) + ". Say which day, e.g. “cancel " + norm(first.title) + " on " + (first.date === today() ? "today" : new Date(first.date + "T12:00:00").toLocaleDateString("en", { weekday: "long" }).toLowerCase()) + "”.";
        }
        var gone = wholeSeries ? hits.filter(function (e) { return norm(e.title) === norm(first.title); }) : [first];
        if (wholeSeries && first.series) gone = all.filter(function (e) { return e.series === first.series && e.date >= first.date; });
        var ids = gone.map(function (e) { return e.id; });
        D.util.save("elaraSchedules", all.filter(function (e) { return ids.indexOf(e.id) < 0; }));
        D.log("deleted event “" + first.title + "”" + (gone.length > 1 ? " (" + gone.length + " dates)" : " on " + prettyDay(first.date)), "fa-trash");
        remember("“" + first.title + "”", "elaraSchedules", gone);
        var meId = D.me().id, tell = (first.involves || []).filter(function (id) { return id !== meId; });
        if (tell.length) D.notify({ to: tell, kind: "schedule", title: "Event cancelled", body: D.me().first + " cancelled “" + first.title + "” on " + prettyDay(first.date) + (gone.length > 1 ? " and its repeats" : "") + ".", href: "dashboard-schedule.html?date=" + first.date });
        var more = first.series && !wholeSeries ? all.filter(function (e) { return e.series === first.series && e.date > first.date; }).length : 0;
        return "Cancelled “" + first.title + "” " + (gone.length > 1 ? "(" + gone.length + " dates from " + prettyDay(first.date) + ")" : prettyDay(first.date) + " at " + first.time) + "." +
            (more ? " It repeats " + more + " more time" + (more === 1 ? "" : "s") + "; say “cancel every " + norm(first.title) + "” to remove those too." : "") + " Say “undo” to bring it back.";
    }

    function local(raw) {
        raw = clean(raw);
        var q = norm(raw), m, d, who;

        // add an event to the schedule: "add an event dentist tomorrow at 3pm", "schedule a braai on Saturday at 2 with Thabo and Lerato",
        // "put the car service on the calendar for Friday at 9", "book a doctor's appointment on the 12th at 10:30"
        var ev = eventCommand(raw);
        if (ev) return addEvent(ev.text);

        // undo the last thing deleted by voice
        if (/^(undo|undo that|undo it|bring it back|put it back|restore it|oops)$/i.test(raw)) return undoLast();
        // delete: events, shopping-list items, things in the house, tasks
        var del = deleteCommand(raw);
        if (del) return del;

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
            var date = parseDay(rest) || today(), saidTime = parseTime(rest), time = saidTime || "12:00", title = cap(stripWhen(rest));
            var nowD = new Date(), nowHM = (nowD.getHours() < 10 ? "0" : "") + nowD.getHours() + ":" + (nowD.getMinutes() < 10 ? "0" : "") + nowD.getMinutes();
            if (date < today()) return "That day has already passed. Give a day from today on.";
            if (date === today() && time <= nowHM) {
                if (saidTime) return time + " has already passed today. Say a later time, or “tomorrow at " + time + "”.";
                var nh = Math.min(23, nowD.getHours() + 1); time = (nh < 10 ? "0" : "") + nh + ":00";        // no time given: the next full hour
                if (nowD.getHours() >= 23) { date = D.util.dayKey(D.util.addDays(nowD, 1)); time = "09:00"; }
            }
            var away = D.tasks.awayReason && D.tasks.awayReason(assignee.userId, date);
            if (away) return away;
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
            var hits = list.filter(function (x) { return x.status !== "Completed" && norm(x.title).indexOf(needle) > -1; })
                .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
            if (!hits.length) return "I couldn't find an open task matching “" + m[1] + "”.";
            var t = hits.filter(function (x) { return !(D.tasks.canComplete && D.tasks.canComplete(x)); })[0];
            if (!t) return D.tasks.canComplete(hits[0]);
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
            if (!person.isMe) return "Only " + person.name + " can change their own status. Ask them to set it on the Schedule page.";
            var day = parseDay(m[2]) || today();
            if (day < today()) return "That day has already passed.";
            if (!D.can("schedule")) return "You don't have access to the schedule.";
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
        if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(q)) return "Hi " + D.me().first + "! I can add tasks and events, switch devices, suggest meals, check energy, the weather and your schedule. Just ask.";
        if (/\b(help|what can you do)\b/.test(q)) return "Try: “add task clean the garage for Thabo tomorrow at 10”, “turn off the geyser”, “add bread to the shopping list”, “what can I cook tonight”, “I'm busy on Friday”, “add an event dentist tomorrow at 3pm”, “schedule a braai on Saturday at 2 with Thabo”, “cancel the dentist on Friday”, “remove bread from the shopping list”, “what's on tomorrow” or “how much energy did we use”.";
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

    window.ElaraAssistant = { handle: handle, context: context, pantry: pantry, meals: localMeals, rankMeals: rankMeals, has: haveFn, recipes: RECIPES, mealReply: mealReply, parseDay: parseDay, parseTime: parseTime };
})();
