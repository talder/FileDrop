import nodemailer from "nodemailer";
import { readJsonConfig, writeJsonConfig } from "./config";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  adminEmail: string;
}

const SMTP_FILE = "smtp.json";

const DEFAULT_SMTP: SmtpConfig = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  pass: "",
  from: "",
  adminEmail: "",
};

export async function getSmtpConfig(): Promise<SmtpConfig> {
  return readJsonConfig<SmtpConfig>(SMTP_FILE, DEFAULT_SMTP);
}

export async function saveSmtpConfig(config: Partial<SmtpConfig>): Promise<SmtpConfig> {
  const current = await getSmtpConfig();
  const updated: SmtpConfig = {
    host: config.host ?? current.host,
    port: config.port ?? current.port,
    secure: config.secure ?? current.secure,
    user: config.user ?? current.user,
    pass: config.pass && config.pass !== "••••••••" ? config.pass : current.pass,
    from: config.from ?? current.from,
    adminEmail: config.adminEmail ?? current.adminEmail,
  };
  await writeJsonConfig(SMTP_FILE, updated);
  return updated;
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const cfg = await getSmtpConfig();
    if (!cfg.host || !cfg.from) return false;

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });

    await transporter.sendMail({ from: cfg.from, to, subject, html });
    return true;
  } catch (e) {
    console.error("[email] sendMail failed:", e);
    return false;
  }
}

/** Send a notification email for a file event */
export async function sendFileNotification(opts: {
  to: string;
  endpointSlug: string;
  event: "upload" | "download" | "failed";
  filename: string;
  originalFilename: string;
  fileSize: number;
  party: string;
  sourceIp: string;
  errorMessage?: string;
}): Promise<void> {
  const { to, endpointSlug, event, filename, originalFilename, fileSize, party, sourceIp, errorMessage } = opts;
  if (!to) return;

  const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
  const eventLabel = event === "upload" ? "File Uploaded" : event === "download" ? "File Downloaded" : "Upload Failed";
  const color = event === "failed" ? "#dc2626" : event === "upload" ? "#16a34a" : "#2563eb";
  const time = new Date().toISOString().replace("T", " ").substring(0, 19);

  const subject = `[FileDrop] ${eventLabel}: ${originalFilename} → ${endpointSlug}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px;">
      <div style="padding: 16px; background: ${color}; color: white; border-radius: 8px 8px 0 0;">
        <strong>${eventLabel}</strong>
      </div>
      <div style="padding: 16px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <table style="font-size: 14px; width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 6px 8px; color: #6b7280;">Endpoint</td><td style="padding: 6px 8px; font-weight: 600;">${endpointSlug}</td></tr>
          <tr><td style="padding: 6px 8px; color: #6b7280;">Original File</td><td style="padding: 6px 8px;">${originalFilename}</td></tr>
          ${filename !== originalFilename ? `<tr><td style="padding: 6px 8px; color: #6b7280;">Saved As</td><td style="padding: 6px 8px; font-family: monospace; font-size: 12px;">${filename}</td></tr>` : ""}
          <tr><td style="padding: 6px 8px; color: #6b7280;">Size</td><td style="padding: 6px 8px;">${sizeMB} MB</td></tr>
          <tr><td style="padding: 6px 8px; color: #6b7280;">Party</td><td style="padding: 6px 8px;">${party}</td></tr>
          <tr><td style="padding: 6px 8px; color: #6b7280;">Source IP</td><td style="padding: 6px 8px; font-family: monospace;">${sourceIp}</td></tr>
          <tr><td style="padding: 6px 8px; color: #6b7280;">Time</td><td style="padding: 6px 8px;">${time} UTC</td></tr>
          ${errorMessage ? `<tr><td style="padding: 6px 8px; color: #dc2626;">Error</td><td style="padding: 6px 8px; color: #dc2626;">${errorMessage}</td></tr>` : ""}
        </table>
      </div>
      <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">Sent by FileDrop</p>
    </div>
  `;

  sendMail(to, subject, html).catch((err) => {
    console.error("[email] Notification failed:", err);
  });
}
