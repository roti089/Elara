// Supabase Edge Function: elara-tuya
// Lets the dashboard list and switch the devices in your CBi Home app.
// CBi Home runs on the Tuya cloud, so this talks to the Tuya Cloud OpenAPI.
//
// NOT TESTED against a live Tuya account. Check the signing steps against the official Tuya
// "Cloud Development" docs for your data centre if a request is rejected.
//
// Secrets (supabase secrets set NAME=value):
//   TUYA_ACCESS_ID, TUYA_ACCESS_SECRET   from your Tuya IoT Platform cloud project
//   TUYA_UID                             the app-account UID linked to that project
//   TUYA_BASE_URL                        data centre, e.g. https://openapi.tuyaeu.com (Europe)
//   TUYA_ALLOWED_EMAILS                  optional, comma separated. Only these users may control the home.
//
// This controls the ONE Tuya account linked to your project (one household).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BASE = Deno.env.get("TUYA_BASE_URL") ?? "https://openapi.tuyaeu.com";
const ID = Deno.env.get("TUYA_ACCESS_ID") ?? "";
const SECRET = Deno.env.get("TUYA_ACCESS_SECRET") ?? "";
const UID = Deno.env.get("TUYA_UID") ?? "";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg))).toUpperCase();
}

async function tuya(method: string, path: string, body?: unknown, token = "") {
  const t = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const stringToSign = [method, await sha256(bodyStr), "", path].join("\n");
  const sign = await hmac(SECRET, ID + token + t + stringToSign);
  const headers: Record<string, string> = { client_id: ID, sign, t, sign_method: "HMAC-SHA256" };
  if (token) headers.access_token = token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: body ? bodyStr : undefined });
  return await res.json();
}

let cached: { token: string; exp: number } | null = null;
async function accessToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const j = await tuya("GET", "/v1.0/token?grant_type=1");
  if (!j.success) throw new Error(j.msg ?? "Could not get a Tuya token");
  cached = { token: j.result.access_token, exp: Date.now() + j.result.expire_time * 1000 };
  return cached.token;
}

const SWITCH_CODES = ["switch_1", "switch", "switch_led"];
function mapDevice(d: any) {
  const status: { code: string; value: unknown }[] = d.status ?? [];
  const sw = status.find((s) => SWITCH_CODES.includes(s.code));
  const cat = String(d.category ?? "");
  return {
    id: d.id, name: d.name, online: !!d.online, on: sw ? !!sw.value : false, code: sw?.code ?? "switch_1",
    icon: cat === "dj" || cat === "dd" ? "fa-lightbulb" : cat === "cz" ? "fa-plug" : "fa-plug",
    watts: cat === "dj" || cat === "dd" ? 10 : undefined,
  };
}

function emailFromJwt(req: Request): string {
  try {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email ?? "";
  } catch { return ""; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!ID || !SECRET || !UID) return json({ error: "Tuya secrets are not set" }, 500);

    const allowed = (Deno.env.get("TUYA_ALLOWED_EMAILS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(emailFromJwt(req).toLowerCase())) return json({ error: "Not allowed" }, 403);

    const body = await req.json();
    const token = await accessToken();

    const list = await tuya("GET", `/v1.0/users/${UID}/devices`, undefined, token);
    if (!list.success) return json({ error: list.msg ?? "Could not list devices" }, 502);
    const devices = (list.result ?? [])
      .filter((d: { category?: string }) => d.category !== "sp")   // "sp" = smart cameras: Elara has no camera feature
      .map(mapDevice);

    if (body.action === "list") return json({ devices });

    if (body.action === "set") {
      // only devices that really belong to this home can be switched
      if (!devices.some((d: { id: string }) => d.id === body.deviceId)) return json({ error: "Unknown device" }, 404);
      const r = await tuya("POST", `/v1.0/devices/${body.deviceId}/commands`,
        { commands: [{ code: body.code ?? "switch_1", value: !!body.value }] }, token);
      if (!r.success) return json({ error: r.msg ?? "Command failed" }, 502);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
