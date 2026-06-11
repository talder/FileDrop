import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSoapConnectionById } from "@/lib/soap-connections";
import { decryptPassword } from "@/lib/destinations";

const EMPTY_ENVELOPE =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
  "<soap:Body/></soap:Envelope>";

/**
 * Build an undici dispatcher that skips TLS verification. undici is loaded
 * dynamically (via a non-literal specifier) so the build does not hard-depend
 * on it; if it is unavailable the request proceeds without a custom dispatcher.
 */
async function buildInsecureDispatcher(): Promise<unknown | undefined> {
  try {
    const moduleName: string = "undici";
    const undici = (await import(moduleName)) as { Agent: new (opts: unknown) => unknown };
    return new undici.Agent({ connect: { rejectUnauthorized: false } });
  } catch {
    return undefined;
  }
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
      ? decryptPassword(saved.passwordEncrypted) ?? undefined
      : undefined;
  const soapAction: string = body.soapAction ?? saved?.soapAction ?? "";
  const ignoreTlsErrors: boolean =
    body.ignoreTlsErrors !== undefined ? body.ignoreTlsErrors === true : saved?.ignoreTlsErrors === true;

  if (!url || !username) {
    return NextResponse.json({ success: false, error: "URL and username are required" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "text/xml; charset=utf-8",
    SOAPAction: soapAction,
    Authorization: "Basic " + Buffer.from(`${username}:${password ?? ""}`).toString("base64"),
  };

  const init: RequestInit & { dispatcher?: unknown } = {
    method: "POST",
    headers,
    body: EMPTY_ENVELOPE,
    signal: AbortSignal.timeout(30000),
  };

  if (ignoreTlsErrors) {
    const dispatcher = await buildInsecureDispatcher();
    if (dispatcher) init.dispatcher = dispatcher;
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(url, init);
    const responseTimeMs = Date.now() - startedAt;
    // A SOAP fault (HTTP 500) still proves connectivity, but report non-2xx as a
    // failure so the operator can see the status code.
    return NextResponse.json({
      success: res.ok,
      statusCode: res.status,
      responseTimeMs,
      error: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      responseTimeMs: Date.now() - startedAt,
      error: (err as Error).message,
    });
  }
}
