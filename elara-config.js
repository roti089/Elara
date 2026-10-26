/* ==========================================================
   ELARA CONFIG  -  edit this file only
   Load it BEFORE elara-data.js on every dashboard page.
========================================================== */
window.ELARA_CONFIG = {

    /* ---- Supabase (same project your login / sign-up pages use) ----
       Project URL and the *anon public* key (Settings > API).
       The anon key is designed to be public; never put the service_role key here. */
    supabaseUrl:     "https://shyvyrvxashetxnmosnd.supabase.co",
    supabaseAnonKey: "sb_publishable_8G0vG3r2UW8Sx-ltfWQazQ_l2oWS3NX",

    /* ---- Pages (paths are relative to the dashboard pages) ---- */
    loginPage:     "Loginpage.html",
    dashboardPage: "dashboard-content.html",

    /* true  = pages bounce to the login page when nobody is logged in
       false = pages still open without login (handy while developing)
       Login now redirects to the dashboard, so this is switched on. */
    requireLogin: true,

    /* ---- Energy ---- */
    tariffPerKwh: 2.5,            // Rand per kWh, used for the cost estimates

    /* ---- Weather fallback if the browser location is blocked ---- */
    defaultCity: "Johannesburg",
    defaultLat:  -26.2041,
    defaultLon:   28.0473,

    /* ---- Optional server functions (see README-SETUP.md) ----
       Leave empty until you deploy them. */
    inviteEndpoint: "https://shyvyrvxashetxnmosnd.supabase.co/functions/v1/bright-action",           // Edge Function URL that EMAILS household invitations (elara-invite)
    aiEndpoint:   "",             // Supabase Edge Function URL for the AI assistant
    tuyaEndpoint: ""              // Supabase Edge Function URL for CBi / Tuya device control
};
