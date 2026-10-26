// Supabase Edge Function: elara-invite
// Sends a real invitation EMAIL to a household member using Supabase Auth's invite feature.
//
// Deploy (CLI):        supabase functions deploy elara-invite
// Or in the dashboard: Edge Functions > Deploy a new function > paste this file.
// No secrets to set: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// IMPORTANT: emails are only delivered if your Supabase project can send mail.
// Without custom SMTP, Supabase only emails people on your project's team (and only ~2 per hour).
// Set up SMTP at Authentication > Emails > SMTP Settings (Brevo, Resend, SendLayer, ... all work).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // only logged-in people may send invitations
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    const { data: caller, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !caller?.user) return json({ error: "Please log in again." }, 401);

    const { email, name, role, redirectTo } = await req.json();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? ""))) return json({ error: "That email address looks wrong." }, 400);
    if (redirectTo && !/^https?:\/\//i.test(String(redirectTo))) return json({ error: "Bad redirect address." }, 400);

    const { error } = await admin.auth.admin.inviteUserByEmail(String(email).trim(), {
      redirectTo: redirectTo || undefined,
      data: {
        full_name: String(name ?? "").slice(0, 80),
        invited_by: caller.user.email,
        invited_role: String(role ?? "member"),
      },
    });

    if (error) {
      const msg = error.message ?? "Invitation failed";
      if ((error as { code?: string }).code === "email_exists" || /already.*registered/i.test(msg)) {
        return json({ error: "That person already has an Elara account.", code: "exists" }, 409);
      }
      return json({ error: msg }, 400);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
