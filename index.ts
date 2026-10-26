const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const requiredEnv = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
};

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

type TuyaResult = {
  success?: boolean;
  code?: number | string;
  msg?: string;
  result?: any;
};

let cachedToken = "";
let tokenExpiresAt = 0;

async function tuyaRequest(
  method: string,
  path: string,
  bodyText = "",
  accessToken = "",
): Promise<TuyaResult> {
  const baseUrl = requiredEnv("TUYA_BASE_URL").replace(/\/+$/, "");
  const clientId = requiredEnv("TUYA_ACCESS_ID");
  const clientSecret = requiredEnv("TUYA_ACCESS_SECRET");
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex(bodyText);
  const stringToSign = `${method}\n${bodyHash}\n\n${path}`;
  const signContent = accessToken
    ? `${clientId}${accessToken}${timestamp}${nonce}${stringToSign}`
    : `${clientId}${timestamp}${nonce}${stringToSign}`;
  const sign = await hmacSha256Hex(clientSecret, signContent);

  const headers: Record<string, string> = {
    "client_id": clientId,
    "sign": sign,
    "t": timestamp,
    "sign_method": "HMAC-SHA256",
    "nonce": nonce,
    "Accept": "application/json",
  };

  if (accessToken) headers["access_token"] = accessToken;
  if (bodyText) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: bodyText || undefined,
  });

  const result = await response.json().catch(() => ({})) as TuyaResult;

  if (!response.ok || result.success === false) {
    console.error("Tuya API request failed", {
      method,
      path,
      status: response.status,
      code: result.code,
    });
    throw new Error("Tuya Cloud rejected the request. Check the function logs.");
  }

  return result;
}

async function getTuyaToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const result = await tuyaRequest("GET", "/v1.0/token?grant_type=1");
  const token = result.result?.access_token;
  const expiresIn = Number(result.result?.expire_time ?? 3600);

  if (!token || typeof token !== "string") {
    throw new Error("Tuya did not return an access token.");
  }

  cachedToken = token;
  tokenExpiresAt = Date.now() + Math.max(60, expiresIn - 120) * 1000;
  return cachedToken;
}

async function authenticatedUser(request: Request): Promise<any> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Sign in to Elara before connecting your devices.");
  }

  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      "Authorization": authorization,
      "apikey": anonKey,
    },
  });

  if (!response.ok) {
    throw new Error("Your Elara session is invalid or expired. Please sign in again.");
  }

  const user = await response.json();
  if (!user?.id) throw new Error("A valid signed-in Elara user is required.");

  const allowlist = (Deno.env.get("TUYA_ALLOWED_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (
    allowlist.length > 0 &&
    (!user.email || !allowlist.includes(user.email.toLowerCase()))
  ) {
    throw new Error("This Elara account is not allowed to control these devices.");
  }

  return user;
}

async function getDevices(token: string): Promise<any[]> {
  const uid = requiredEnv("TUYA_UID");
  const path = `/v1.0/users/${encodeURIComponent(uid)}/devices?page_no=1&page_size=100`;
  const result = await tuyaRequest("GET", path, "", token);
  const items = Array.isArray(result.result)
    ? result.result
    : Array.isArray(result.result?.list)
    ? result.result.list
    : [];

  return items;
}

function switchCode(device: any): string | null {
  const statuses = Array.isArray(device.status) ? device.status : [];
  for (const candidate of ["switch_1", "switch", "switch_led"]) {
    if (statuses.some((status: any) => status.code === candidate)) {
      return candidate;
    }
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    await authenticatedUser(request);

    const body = await request.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return jsonResponse({ error: "A valid action is required." }, 400);
    }

    if (body.action !== "list" && body.action !== "set") {
      return jsonResponse({ error: "Unsupported action." }, 400);
    }

    const token = await getTuyaToken();
    const devices = await getDevices(token);

    if (body.action === "list") {
      const supportedDevices = devices
        .map((device: any) => {
          const code = switchCode(device);
          if (!code || !device.id) return null;

          const status = device.status.find((item: any) => item.code === code);

          return {
            id: String(device.id),
            name: String(device.name ?? "Smart device"),
            online: Boolean(device.online),
            on: Boolean(status?.value),
            code,
            icon: device.icon ?? "",
          };
        })
        .filter(Boolean);

      return jsonResponse({ devices: supportedDevices });
    }

    if (
      typeof body.deviceId !== "string" ||
      !body.deviceId ||
      typeof body.code !== "string" ||
      typeof body.value !== "boolean"
    ) {
      return jsonResponse({
        error: "A device ID, supported switch code, and boolean value are required.",
      }, 400);
    }

    const device = devices.find((item: any) => String(item.id) === body.deviceId);
    if (!device) {
      return jsonResponse({ error: "That device is not linked to this Tuya account." }, 403);
    }

    const supportedCode = switchCode(device);
    if (!supportedCode || body.code !== supportedCode) {
      return jsonResponse({ error: "That device switch control is not supported." }, 400);
    }

    const commandPath =
      `/v1.0/devices/${encodeURIComponent(body.deviceId)}/commands`;
    const commandBody = JSON.stringify({
      commands: [{ code: supportedCode, value: body.value }],
    });

    await tuyaRequest("POST", commandPath, commandBody, token);
    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status = message.includes("Sign in") ||
        message.includes("session is invalid") ||
        message.includes("signed-in") ||
        message.includes("not allowed")
      ? 401
      : message.startsWith("Missing server configuration:")
      ? 500
      : 502;

    console.error("Elara Tuya function error:", message);
    return jsonResponse({ error: message }, status);
  }
});
