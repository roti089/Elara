/* ==========================================================
   ELARA CONFIG  -  edit this file only
   Load it BEFORE elara-data.js on every dashboard page.
========================================================== */
window.ELARA_CONFIG = {

    /* ---- Supabase (same project your login / sign-up pages use) ----
       Project URL and the publishable (anon) key. Never put the service_role key here. */
    supabaseUrl:     "https://shyvyrvxashetxnmosnd.supabase.co",
    supabaseAnonKey: "sb_publishable_8G0vG3r2UW8Sx-ltfWQazQ_l2oWS3NX",

    /* ---- Pages (all pages live in the same folder) ---- */
    loginPage:     "Loginpage.html",
    dashboardPage: "dashboard-content.html",

    /* true  = pages bounce to the login page when nobody is logged in
       false = pages open without login, using demo data (handy while developing) */
    requireLogin: true,

    /* ---- Energy ---- */
    tariffPerKwh: 2.5,            // Rand per kWh, used for the cost estimates
    tuyaPollSeconds: 60,          // how often an open Elara screen reads the switches (one Tuya API call each time)
    serverAutomations: false,     // true once the elara-tuya scheduled job is running (README, step 8): then automations
                                  // run on the server only, even when nobody has Elara open

    /* ---- Weather fallback when no location is known ---- */
    defaultCity: "Johannesburg",
    defaultLat:  -26.2041,
    defaultLon:   28.0473,

    /* ---- Server functions (see README-SETUP.md). Leave "" for any you haven't deployed. ---- */
    inviteEndpoint: "https://shyvyrvxashetxnmosnd.supabase.co/functions/v1/bright-action",   // emails invitations
    tuyaEndpoint:   "https://shyvyrvxashetxnmosnd.supabase.co/functions/v1/elara-tuya",      // CBi / Tuya devices
    aiEndpoint:     "https://shyvyrvxashetxnmosnd.supabase.co/functions/v1/elara-ai",        // Elara AI answers
    pushEndpoint:   "https://shyvyrvxashetxnmosnd.supabase.co/functions/v1/elara-push",      // notifications to other members
    icsEndpoint:    "https://shyvyrvxashetxnmosnd.supabase.co/functions/v1/elara-ics",       // calendar link import

    /* Public VAPID key for push notifications when Elara is closed.*/
    vapidPublicKey: "BFTxNX8Yp0_DH1nfTklDDu4Qk_KKRPhC2yI8WNocwb-7GqE1G8p9solUi_9_YEwWTir2X5dYYesSnvFLyPP6cJo"
};
