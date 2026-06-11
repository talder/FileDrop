import { createHmac } from "crypto";
import type { WebhookNotificationConfig } from "./types";
import { forwardToVictoriaLogs } from "./victorialog";

function shouldSend(config: WebhookNotificationConfig | undefined, failed: boolean): boolean {
  if (!config || !config.url || config.on === "none") return false;
  return config.on === "all" || (config.on === "failures" && failed);
}

export async function sendWebhookNotification(opts: {
  config?: WebhookNotificationConfig;
  event: string;
  failed: boolean;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { config, event, failed, payload } = opts;
  if (!shouldSend(config, failed)) return;

  const ts = new Date().toISOString();
  const body = JSON.stringify({
    event,
    sentAt: ts,
    ...payload,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-FileDrop-Event": event,
    "X-FileDrop-Timestamp": ts,
  };

  if (config?.secret) {
    const sig = createHmac("sha256", config.secret).update(`${ts}.${body}`).digest("hex");
    headers["X-FileDrop-Signature"] = `sha256=${sig}`;
  }

  try {
    const response = await fetch(config!.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      forwardToVictoriaLogs("webhook", {
        message: `webhook ${event} failed with HTTP ${response.status}`,
        event,
        url: config!.url,
        statusCode: response.status,
      }, "warn");
    }
  } catch (error) {
    forwardToVictoriaLogs("webhook", {
      message: `webhook ${event} failed: ${(error as Error).message}`,
      event,
      url: config!.url,
      errorMessage: (error as Error).message,
    }, "warn");
  }
}
