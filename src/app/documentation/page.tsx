"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import type { SanitizedUser } from "@/lib/types";

export default function DocumentationPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.needsSetup) router.replace("/setup");
      else if (!d.user) router.replace("/login");
      else setUser(d.user);
    });
  }, [router]);

  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };

  if (!user) return <div className="flex items-center justify-center h-screen bg-surface-alt"><p className="text-text-muted">Loading...</p></div>;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-filedrop-server.com";

  return (
    <div className="flex flex-col h-screen">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="page-container">
          <div className="max-w-3xl mx-auto">
            <h1 className="page-title mb-6">Documentation</h1>

            {/* Quick Start */}
            <Section title="Quick Start">
              <p>FileDrop is a secure file drop service. External parties upload files via HTTP API or SFTP using an API key. Files are stored in configured destinations (local, NFS, SMB).</p>
              <Steps steps={[
                "Create a Destination (Settings → Destinations) — where files will be stored",
                "Create an Endpoint (Endpoints page) — the URL slug external parties will use",
                "Generate an API Key (API Keys page) — assign it to the endpoint(s)",
                "Share the API key and drop URL with the external party",
              ]} />
            </Section>

            {/* Uploading Files */}
            <Section title="Uploading Files (HTTP API)">
              <p>External parties send files via <code>POST</code> to your drop endpoint with their API key:</p>
              <CodeBlock title="Single file upload (curl)" lang="bash">{`curl -X POST ${baseUrl}/api/drop/{endpoint-slug} \\
  -H "Authorization: Bearer fd_your_api_key_here" \\
  -F "file=@/path/to/document.pdf"`}</CodeBlock>

              <CodeBlock title="Multiple files" lang="bash">{`curl -X POST ${baseUrl}/api/drop/{endpoint-slug} \\
  -H "Authorization: Bearer fd_your_api_key_here" \\
  -F "file=@file1.pdf" \\
  -F "file=@file2.xml"`}</CodeBlock>

              <CodeBlock title="PowerShell" lang="powershell">{`$headers = @{ "Authorization" = "Bearer fd_your_api_key_here" }
$form = @{ file = Get-Item -Path "C:\\path\\to\\document.pdf" }

Invoke-RestMethod -Uri "${baseUrl}/api/drop/{endpoint-slug}" \`
  -Method Post -Headers $headers -Form $form`}</CodeBlock>

              <CodeBlock title="Python" lang="python">{`import requests

url = "${baseUrl}/api/drop/{endpoint-slug}"
headers = {"Authorization": "Bearer fd_your_api_key_here"}

with open("document.pdf", "rb") as f:
    r = requests.post(url, headers=headers, files={"file": f})
print(r.json())`}</CodeBlock>

              <CodeBlock title="C# / .NET" lang="csharp">{`using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer fd_your_api_key_here");

using var content = new MultipartFormDataContent();
using var stream = File.OpenRead(@"C:\\path\\to\\document.pdf");
content.Add(new StreamContent(stream), "file", "document.pdf");

var response = await client.PostAsync("${baseUrl}/api/drop/{endpoint-slug}", content);
Console.WriteLine(await response.Content.ReadAsStringAsync());`}</CodeBlock>
            </Section>

            {/* Response Format */}
            <Section title="Response Format">
              <CodeBlock title="Successful upload" lang="json">{`{
  "success": true,
  "received": 1,
  "failed": 0,
  "files": [
    {
      "filename": "20240315-103045_a1b2c3d4_document.pdf",
      "originalFilename": "document.pdf",
      "size": 245760,
      "id": 42
    }
  ]
}`}</CodeBlock>
              <div className="mt-4 space-y-2">
                <StatusRow code="200" meaning="Upload successful" />
                <StatusRow code="400" meaning="Invalid request (no files, bad format)" />
                <StatusRow code="401" meaning="Invalid, expired, or revoked API key" />
                <StatusRow code="403" meaning="API key doesn't have access to this endpoint" />
                <StatusRow code="404" meaning="Endpoint not found" />
                <StatusRow code="429" meaning="Rate limit exceeded — wait and retry" />
                <StatusRow code="503" meaning="Endpoint disabled or destination unavailable" />
              </div>
            </Section>

            {/* Retrieving Files */}
            <Section title="Retrieving Files">
              <p>If file retrieval is enabled on an endpoint, API key holders can list and download files:</p>
              <CodeBlock title="List files" lang="bash">{`curl ${baseUrl}/api/drop/{endpoint-slug} \\
  -H "Authorization: Bearer fd_your_api_key_here"`}</CodeBlock>
              <CodeBlock title="Download a file" lang="bash">{`curl -O ${baseUrl}/api/drop/{endpoint-slug}/{filename} \\
  -H "Authorization: Bearer fd_your_api_key_here"`}</CodeBlock>
            </Section>

            {/* SFTP */}
            <Section title="SFTP Server">
              <p>If the embedded SFTP server is enabled (Settings → General), external parties can connect via SFTP:</p>
              <CodeBlock title="Connect via SFTP" lang="bash">{`sftp -P 2222 anyuser@your-filedrop-host
# Password: their API key (fd_...)`}</CodeBlock>
              <p className="mt-2">Once connected, they see directories for each endpoint they have access to. Upload files into the appropriate directory:</p>
              <CodeBlock title="SFTP upload" lang="bash">{`sftp> cd invoices
sftp> put document.pdf
sftp> bye`}</CodeBlock>
            </Section>

            {/* Health Check */}
            <Section title="Health Check">
              <CodeBlock title="Check if the service is running (no auth required)" lang="bash">{`curl ${baseUrl}/api/health`}</CodeBlock>
            </Section>

            {/* File Naming */}
            <Section title="File Naming">
              <p>Each endpoint can be configured with a file naming mask. Available tokens:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
                <Token name="{ORIGINAL}" desc="Original filename without extension" />
                <Token name="{EXT}" desc="Extension with dot (.pdf)" />
                <Token name="{YYYY}" desc="4-digit year" />
                <Token name="{YY}" desc="2-digit year" />
                <Token name="{MM}" desc="2-digit month" />
                <Token name="{DD}" desc="2-digit day" />
                <Token name="{HH}" desc="2-digit hour (24h)" />
                <Token name="{mm}" desc="2-digit minute" />
                <Token name="{ss}" desc="2-digit second" />
                <Token name="{UUID}" desc="Full UUID" />
                <Token name="{UUID8}" desc="First 8 chars of UUID" />
                <Token name="{SEQ}" desc="Sequence number" />
              </div>
              <p className="mt-3 text-sm text-text-muted">Example: <code>{"{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}"}</code> → <code>20240315-103045_invoice.pdf</code></p>
            </Section>

            {/* API Keys Security */}
            <Section title="API Key Security">
              <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                <li>Keys are generated with <code>crypto.randomBytes(48)</code> — 384 bits of entropy</li>
                <li>Only a SHA-256 hash is stored; the plaintext is shown <strong>once</strong> at creation</li>
                <li>Each key is scoped to specific endpoints — it cannot access other endpoints</li>
                <li>Keys can have an expiry date and can be revoked instantly</li>
                <li>Rate limiting is enforced per key (default: 60 requests/minute)</li>
              </ul>
            </Section>

            {/* Polling */}
            <Section title="Polling (Pull Mode)">
              <p>Endpoints can be configured to poll a source directory for new files at a configurable interval. Supported sources:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary mt-2">
                <li><strong>Local / NFS / SMB</strong> — watches a directory path for new files</li>
                <li><strong>SFTP</strong> — connects to a remote SFTP server and pulls files</li>
              </ul>
              <p className="mt-2 text-sm text-text-muted">Optionally, source files can be deleted after successful transfer.</p>
            </Section>

            {/* Reverse Proxy */}
            <Section title="Reverse Proxy">
              <p>FileDrop works behind nginx, Apache, or Caddy. Set these environment variables:</p>
              <CodeBlock title="Environment" lang="bash">{`TRUST_PROXY=true
SECURE_COOKIES=true`}</CodeBlock>
              <p className="mt-2 text-sm text-text-muted">Important: set <code>client_max_body_size</code> (nginx) or <code>LimitRequestBody</code> (Apache) to at least your max upload size.</p>
            </Section>

            <div className="h-12" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-text-primary mb-3 pb-2 border-b border-border">{title}</h2>
      <div className="text-sm text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function CodeBlock({ title, lang, children }: { title: string; lang: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = children;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
    }
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-muted)] rounded-t-lg border border-b-0 border-border">
        <span className="text-xs font-medium text-text-muted">{title}</span>
        <button onClick={copy} className="text-xs text-text-muted hover:text-accent transition-colors">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono bg-[var(--color-input-bg)] border border-border rounded-b-lg overflow-x-auto whitespace-pre-wrap text-text-primary">{children}</pre>
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-3 space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 text-sm">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">{i + 1}</span>
          <span className="text-text-secondary pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function StatusRow({ code, meaning }: { code: string; meaning: string }) {
  const color = code.startsWith("2") ? "badge-success" : code.startsWith("4") ? "badge-danger" : "badge-warning";
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`badge ${color}`} style={{ minWidth: 36, justifyContent: "center" }}>{code}</span>
      <span className="text-text-secondary">{meaning}</span>
    </div>
  );
}

function Token({ name, desc }: { name: string; desc: string }) {
  return (
    <>
      <code className="text-xs text-accent">{name}</code>
      <span className="text-text-muted">{desc}</span>
    </>
  );
}
