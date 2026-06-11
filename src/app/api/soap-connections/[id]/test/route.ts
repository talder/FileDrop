import { NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";
import { getCurrentUser } from "@/lib/auth";
import { getSoapConnectionById } from "@/lib/soap-connections";
import { decryptPassword } from "@/lib/destinations";

const EMPTY_ENVELOPE =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
  "<soap:Body/></soap:Envelope>";

/** POST a minimal SOAP envelope using Node's built-in http/https. */
function soapTestPost(opts: {
  url: string;
  authBasic: string;
  soapAction: string;
  ignoreTlsErrors: boolean;
  signal: AbortSignal;
}): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    let endpoint: URL;
    try {
      endpoint = new URL(opts.url);
    } catch {
      reject(new Error(`invalid URL: ${opts.url}`));
      return;
    }
    const isHttps = endpoint.protocol === "https:";
    const transport = isHttps ? https : http;
    const payload = Buffer.from(EMPTY_ENVELOPE, "utf8");
    const headers: Record<string, string> = {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: opts.soapAction,
      Authorization: `Basic ${opts.authBasic}`,
      "Content-Length": String(payload.byteLength),
    };
    const reqOpts: https.RequestOptions = {
      method: "POST",
      hostname: endpoint.hostname,
      port: endpoint.port || (isHttps ? 443 : 80),
      path: `${endpoint.pathname}${endpoint.search}`,
      headers,
      signal: opts.signal,
    };
    if (isHttps && opts.ignoreTlsErrors) {
      reqOpts.agent = new https.Agent({ rejectUnauthorized: false });
    }
    const req = transport.request(reqOpts, (res) => {
      res.resume(); // drain so the socket closes
      res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // Allow testing a brand-new connection (id === "new") using inline params,
  // or an existing saved connection with optional inline credential overrides.
  const saved = id === "new" ? null : await getSoapConnectionById(id);
  if (!saved && id !== "new") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url: string | undefined = body.url ?? saved?.url;
  const username: string | undefined = body.username ?? saved?.username;
  const password: string | undefined = body.password
    ? body.password
    : saved?.passwordEncrypted
      ? (decryptPassword(saved.passwordEncrypted) ?? undefined)
      : undefined;
  const soapAction: string = body.soapAction ?? saved?.soapAction ?? "";
  const ignoreTlsErrors: boolean =
    body.ignoreTlsErrors !== undefined ? body.ignoreTlsErrors === true : saved?.ignoreTlsErrors === true;

  if (!url || !username) {
    return NextResponse.json({ success: false, error: "URL and username are required" }, { status: 400 });
  }

  const authBasic = Buffer.from(`${username}:${password ?? ""}`).toString("base64");
  const startedAt = Date.now();
  try {
    const result = await soapTestPost({
      url,
      authBasic,
      soapAction,
      ignoreTlsErrors,
      signal: AbortSignal.timeout(30000),
    });
    const responseTimeMs = Date.now() - startedAt;
    // HTTP 500 from SAP still proves connectivity (SOAP fault); only report failure for non-2xx.
    const ok = result.status >= 200 && result.status < 600; // any SAP response = reachable
    return NextResponse.json({
      success: ok,
      statusCode: result.status,
      responseTimeMs,
      error: ok ? undefined : `HTTP ${result.status}`,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      responseTimeMs: Date.now() - startedAt,
      error: (err as Error).message,
    });
  }
}
