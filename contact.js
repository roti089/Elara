import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://shyvyrvxashetxnmosnd.supabase.co";
const supabaseKey = "sb_publishable_8G0vG3r2UW8Sx-ltfWQazQ_l2oWS3NX";
const supabase = createClient(supabaseUrl, supabaseKey);

/* ---------- phone field: only digits and an optional leading + ---------- */
const phoneInput = document.getElementById("Pnumber");

if (phoneInput) {
    phoneInput.setAttribute("inputmode", "tel");
    phoneInput.setAttribute("maxlength", "16");
    phoneInput.setAttribute("autocomplete", "tel");

    // runs on typing and on paste: strips letters and symbols straight away
    phoneInput.addEventListener("input", () => {
        const raw = phoneInput.value;
        const hasPlus = raw.trim().charAt(0) === "+";
        const digits = raw.replace(/\D/g, "");
        phoneInput.value = (hasPlus ? "+" : "") + digits;
    });
}

document.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("Name").value.trim();
    const email = document.getElementById("Email").value.trim();
    const phone = document.getElementById("Pnumber").value.replace(/[\s\-()]/g, "");
    const message = document.getElementById("Message").value.trim();



    if (name.length < 2) {
        alert("Name must be at least 2 characters long.");
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
        alert("Please enter a valid email address.");
        return;
    }

    // digits only, optional leading +, 10 to 15 digits (e.g. 0821234567 or +27821234567)
    const phoneRegex = /^\+?[0-9]{10,15}$/;

    if (!phoneRegex.test(phone)) {
        alert("Please enter a valid phone number using digits only, e.g. 0821234567 or +27821234567.");
        return;
    }

    if (message.length < 10) {
        alert("Message must be at least 10 characters long.");
        return;
    }

 

    const { error } = await supabase
        .from("contacts")
        .insert([
            {
                name,
                email,
                phone,
                message
            }
        ]);

    if (error) {
        alert("Error sending message: " + error.message);
        return;
    }

    alert("Message sent successfully!");

  
    document.querySelector("form").reset();
});