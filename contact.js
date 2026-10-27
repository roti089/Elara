import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

/* Contact form: checked here AND by the database (elara-setup.sql), so bad data can't get in either way.
   Messages can only be written, never read back, by visitors. */
const cfg = window.ELARA_CONFIG || {};
const supabase = cfg.supabaseUrl ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const form = document.getElementById("contact-form");
const $ = (id) => document.getElementById(id);
const msg = $("formMsg");

const RULES = {
    Name: (v) => v.length < 2 || v.length > 50 ? "Your name must be 2 to 50 characters." : !/^[\p{L}][\p{L}\p{M}' .-]*$/u.test(v) ? "Please use letters only in your name." : "",
    Email: (v) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 120 ? "Please enter a valid email address." : "",
    Pnumber: (v) => !/^\+?[0-9]{10,15}$/.test(v) ? "Use 10 to 15 digits, e.g. 0821234567 or +27821234567." : "",
    Message: (v) => v.length < 10 ? "Your message must be at least 10 characters." : v.length > 500 ? "Your message can be at most 500 characters." : ""
};
function value(id) {
    const v = $(id).value.trim();
    return id === "Pnumber" ? v.replace(/[\s\-()]/g, "") : id === "Email" ? v.toLowerCase() : v.replace(/\s+/g, id === "Message" ? " " : " ");
}
function check(id) {
    const err = RULES[id](value(id));
    $(id + "-err").textContent = err;
    $(id).classList.toggle("invalid", !!err);
    $(id).setAttribute("aria-invalid", err ? "true" : "false");
    return !err;
}

/* phone: digits and one leading + only, as you type or paste */
$("Pnumber").addEventListener("input", (e) => {
    const raw = e.target.value, plus = raw.trim().charAt(0) === "+";
    e.target.value = (plus ? "+" : "") + raw.replace(/\D/g, "").slice(0, 15);
});
$("Message").addEventListener("input", () => { $("Message-count").textContent = $("Message").value.length + " / 500"; });
Object.keys(RULES).forEach((id) => $(id).addEventListener("blur", () => { if ($(id).value) check(id); }));

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = ""; msg.className = "form-msg";
    const ok = Object.keys(RULES).map(check).every(Boolean);
    if (!ok) { const first = form.querySelector(".invalid"); if (first) first.focus(); return; }

    // spam trap filled in, or sending too fast: act as if it worked
    if ($("website").value) { form.reset(); msg.textContent = "Thanks! Your message was sent."; msg.className = "form-msg ok"; return; }
    let last = 0; try { last = Number(localStorage.getItem("elaraContactSent") || 0); } catch (x) { /* ignore */ }
    if (Date.now() - last < 60000) { msg.textContent = "Please wait a minute before sending another message."; msg.className = "form-msg bad"; return; }
    if (!supabase) { msg.textContent = "Messages can't be sent right now. Please email us instead."; msg.className = "form-msg bad"; return; }

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Sending...";
    const { error } = await supabase.from("contacts").insert([{ name: value("Name"), email: value("Email"), phone: value("Pnumber"), message: value("Message") }]);
    btn.disabled = false; btn.textContent = "Send Now";

    if (error) {
        msg.textContent = /violates|check constraint/i.test(error.message) ? "Some details weren't accepted. Please check the form." : /fetch/i.test(error.message) ? "No connection. Please try again." : "Sorry, your message couldn't be sent. Please email us instead.";
        msg.className = "form-msg bad";
        return;
    }
    try { localStorage.setItem("elaraContactSent", String(Date.now())); } catch (x) { /* ignore */ }
    form.reset(); $("Message-count").textContent = "0 / 500";
    msg.textContent = "Thanks! Your message was sent. We'll reply as soon as we can."; msg.className = "form-msg ok";
});
