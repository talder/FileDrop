"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { FILE_NAMING_TOKENS } from "@/lib/file-naming";
import type { SanitizedUser } from "@/lib/types";
import packageJson from "../../../package.json";

const FILE_NAMING_TOKEN_DESCRIPTIONS: Record<string, string> = {
  "{ORIGINAL}": "Original filename without extension",
  "{EXT}": "Extension with dot (.pdf)",
  "{YYYY}": "4-digit year",
  "{YY}": "2-digit year",
  "{MM}": "2-digit month",
  "{DD}": "2-digit day",
  "{HH}": "2-digit hour (24h)",
  "{mm}": "2-digit minute",
  "{ss}": "2-digit second",
  "{UUID}": "Full UUID",
  "{UUID8}": "First 8 chars of UUID",
  "{SEQ}": "Sequence number",
};

const APP_VERSION = `v${packageJson.version}`;

/** Accent colors shared with the Flow Map node kinds, for visual consistency. */
const C = {
  party: "#6366f1",
  endpoint: "#0ea5e9",
  destination: "#10b981",
  transfer: "#f59e0b",
  integration: "#8b5cf6",
  sftp: "#ef4444",
  soap: "#ec4899",
  ftp: "#14b8a6",
};

/** In-page table of contents. */
const TOC: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "concepts", label: "Key concepts" },
  { id: "architecture", label: "Architecture" },
  { id: "quick-start", label: "Quick start (A → Z)" },
  { id: "destinations", label: "Destinations" },
  { id: "endpoints", label: "Endpoints" },
  { id: "api-keys", label: "API Keys" },
  { id: "tags", label: "Tags" },
  { id: "uploading", label: "Uploading (HTTP API)" },
  { id: "sftp-server", label: "SFTP server (inbound)" },
  { id: "retrieving", label: "Retrieving files" },
  { id: "sftp-servers", label: "SFTP Servers (outbound)" },
  { id: "transfers", label: "Transfers" },
  { id: "soap-endpoints", label: "SOAP Endpoints" },
  { id: "ftp-servers", label: "FTP Servers" },
  { id: "integrations", label: "Integrations" },
  { id: "file-naming", label: "File naming" },
  { id: "scheduling", label: "Scheduling" },
  { id: "folder-watcher", label: "Folder watcher" },
  { id: "retry", label: "Retry & dead-letter" },
  { id: "notifications", label: "Notifications & webhooks" },
  { id: "monitoring", label: "Monitoring" },
  { id: "settings", label: "Settings" },
  { id: "health", label: "Health check" },
  { id: "reverse-proxy", label: "Reverse proxy" },
  { id: "api-security", label: "API key security" },
  { id: "changelog", label: "Changelog" },
];

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
          <div className="max-w-4xl mx-auto">
            <h1 className="page-title mb-1">Documentation</h1>
            <p className="text-sm text-text-muted mb-6">A complete guide to every module in FileDrop and how files flow from A → Z. {APP_VERSION}</p>

            <Toc />

            {/* ─────────────── Overview ─────────────── */}
            <Section id="overview" title="Overview">
              <p>
                FileDrop is a self-hosted file-exchange platform. It both <strong>receives</strong> files
                from external parties (over HTTP or SFTP) and <strong>moves / processes</strong> files to
                other systems (SFTP, SOAP, FTP) on a schedule or when folders change.
              </p>
              <p className="mt-2">Everything is organized into modules reachable from the left sidebar. They fall into four groups:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary mt-2">
                <li><strong>Receive</strong> — Endpoints, API Keys (inbound uploads from external parties)</li>
                <li><strong>Store</strong> — Destinations, Data (where files live on disk / NFS / SMB)</li>
                <li><strong>Move &amp; process</strong> — Transfers, Integrations, plus the SFTP/SOAP/FTP server connections they use</li>
                <li><strong>Observe &amp; operate</strong> — Dashboard, Flow Map, Connections, Audit Log, Tags, Settings</li>
              </ul>
            </Section>

            {/* ─────────────── Key concepts ─────────────── */}
            <Section id="concepts" title="Key concepts">
              <DefRow term="Endpoint">A named, externally-reachable surface for receiving files — either an HTTP <code>/api/drop/&#123;slug&#125;</code> URL or a directory on the embedded SFTP server.</DefRow>
              <DefRow term="Destination">A storage location files are written to or read from: a local path, an NFS export, or an SMB share.</DefRow>
              <DefRow term="API Key">A secret token an external party uses to authenticate. Scoped to specific endpoints.</DefRow>
              <DefRow term="Transfer">A scheduled SFTP job that pulls files from, or pushes files to, a remote SFTP server.</DefRow>
              <DefRow term="Integration">A pipeline that reads local files, POSTs them to a SOAP endpoint, optionally saves the response and pushes it to FTP.</DefRow>
              <DefRow term="Connection">A saved, reusable remote server (SFTP / SOAP / FTP) referenced by Transfers and Integrations.</DefRow>
              <DefRow term="Tag">A colored label that groups items across modules, used to filter the Flow Map.</DefRow>
            </Section>

            {/* ─────────────── Architecture ─────────────── */}
            <Section id="architecture" title="Architecture — how files move">
              <p>The core data flow, end to end:</p>
              <ArchitectureDiagram />
              <p className="mt-4 text-sm text-text-muted">
                Inbound files are received by an <span style={{ color: C.endpoint }}>Endpoint</span> (guarded by an
                {" "}<span style={{ color: C.party }}>API Key</span>), written into a
                {" "}<span style={{ color: C.destination }}>Destination</span>, and can then be forwarded onward by a
                {" "}<span style={{ color: C.transfer }}>Transfer</span> or
                {" "}<span style={{ color: C.integration }}>Integration</span> to remote SFTP / SOAP / FTP systems.
              </p>
            </Section>

            {/* ─────────────── Quick start ─────────────── */}
            <Section id="quick-start" title="Quick start — set up a connection A → Z">
              <p>Follow this flow to take an external party from zero to successfully dropping files:</p>
              <SetupFlow />
            </Section>

            {/* ─────────────── Destinations ─────────────── */}
            <ModuleCard id="destinations" title="Destinations" where="Destinations" color={C.destination}>
              <p>Storage targets for files. Every Endpoint, Transfer, and Integration reads from or writes to a Destination.</p>
              <DefRow term="local">An absolute path on the FileDrop host.</DefRow>
              <DefRow term="nfs">An NFS export (<code>remoteHost</code> + <code>remotePath</code>) mounted at a local mount point; extra <code>mountOptions</code> like <code>vers=4,rw</code> are supported.</DefRow>
              <DefRow term="smb">An SMB/CIFS share (<code>remoteHost</code> + share name) with <code>smbDomain</code>, <code>smbUsername</code>, and an encrypted password.</DefRow>
              <p className="mt-2 text-sm text-text-muted">
                NFS/SMB destinations can be mounted, unmounted, and tested from the UI. Passwords are stored
                AES-256-GCM encrypted. Use the <strong>Data</strong> page to browse what is actually on disk.
              </p>
            </ModuleCard>

            {/* ─────────────── Endpoints ─────────────── */}
            <ModuleCard id="endpoints" title="Endpoints" where="Endpoints" color={C.endpoint}>
              <p>An endpoint is where files come in. Two types:</p>
              <DefRow term="api">HTTP upload/download at <code>/api/drop/&#123;slug&#125;</code>.</DefRow>
              <DefRow term="sftp-server">A directory inside the embedded SFTP server that external parties connect into.</DefRow>
              <SubSection>Per-endpoint options</SubSection>
              <DefRow term="destination + subdirectory">Where matched files are written.</DefRow>
              <DefRow term="filters (routing)">An ordered list of rules. Each rule matches on filename <em>wildcards</em> (<code>*</code>/<code>?</code>) and/or <em>extensions</em> and routes matches into a <code>targetSubdirectory</code>. The first matching rule wins; if none match, the endpoint&apos;s default subdirectory is used.</DefRow>
              <DefRow term="allowedExtensions">Whitelist of extensions (empty = allow all).</DefRow>
              <DefRow term="maxFileSize">Per-endpoint size cap in bytes (0 = use the global default).</DefRow>
              <DefRow term="fileNaming">Keep the original name or apply a mask (see File naming).</DefRow>
              <DefRow term="allowRetrieval">Allow API-key holders to list and download files back.</DefRow>
              <DefRow term="rejectDuplicates">Reject an upload whose SHA-256 matches a previous successful upload to this endpoint.</DefRow>
              <DefRow term="retentionDays">Per-endpoint retention override (otherwise the global setting applies).</DefRow>
              <DefRow term="notifications / webhook">Email and/or webhook on upload success/failure (see Notifications).</DefRow>
              <DefRow term="enabled">Disabled endpoints reject uploads with HTTP 503.</DefRow>
            </ModuleCard>

            {/* ─────────────── API Keys ─────────────── */}
            <ModuleCard id="api-keys" title="API Keys" where="API Keys" color={C.party}>
              <p>Secrets that authenticate external parties. Generate one per party, scope it to the endpoint(s) it may use, and share it.</p>
              <DefRow term="partyName">A human label for the holder (e.g. &quot;ACME Corp&quot;).</DefRow>
              <DefRow term="allowedEndpoints">The endpoint slugs this key can access (<code>*</code> = all).</DefRow>
              <DefRow term="expiresAt">Optional expiry date — after which the key is rejected.</DefRow>
              <DefRow term="revoke">Revoke instantly at any time.</DefRow>
              <p className="mt-2 text-sm text-text-muted">The plaintext key is shown <strong>once</strong> at creation; only a SHA-256 hash is stored. See API key security below.</p>
            </ModuleCard>

            {/* ─────────────── Tags ─────────────── */}
            <ModuleCard id="tags" title="Tags" where="Tags" color="#64748b">
              <p>User-defined colored labels that group related items <em>across</em> modules — endpoints, destinations, transfers, integrations, and the SFTP/SOAP/FTP connections.</p>
              <p className="mt-2 text-sm text-text-muted">Select a tag in the <strong>Flow Map</strong> to highlight just that group and its immediate neighbors.</p>
            </ModuleCard>

            {/* ─────────────── Uploading (HTTP API) ─────────────── */}
            <Section id="uploading" title="Uploading files (HTTP API)">
              <p>External parties send files via <code>POST</code> to their drop endpoint with their API key. Use form field <code>file</code> (or <code>files</code>); multiple files per request are supported.</p>
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

              <SubSection>Response &amp; status codes</SubSection>
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
                <StatusRow code="200" meaning="Upload successful (at least one file written)" />
                <StatusRow code="400" meaning="Invalid request, or every file failed (see details[])" />
                <StatusRow code="401" meaning="Missing / invalid / expired / revoked API key" />
                <StatusRow code="403" meaning="API key has no access to this endpoint" />
                <StatusRow code="404" meaning="Endpoint not found" />
                <StatusRow code="429" meaning="Rate limit exceeded — wait and retry" />
                <StatusRow code="503" meaning="Endpoint disabled or destination unavailable" />
              </div>
              <p className="mt-3 text-sm text-text-muted">
                Each file is validated in order: rate limit → endpoint access → size → extension → duplicate check →
                filter routing → write with the configured file-naming mask.
              </p>
            </Section>

            {/* ─────────────── SFTP server (inbound) ─────────────── */}
            <Section id="sftp-server" title="SFTP server (inbound)">
              <p>When the embedded SFTP server is enabled (app settings <code>sftpServerEnabled</code> / <code>sftpServerPort</code>), parties with an <code>sftp-server</code> endpoint can connect with their API key as the password:</p>
              <CodeBlock title="Connect via SFTP" lang="bash">{`sftp -P 2222 anyuser@your-filedrop-host
# Password: their API key (fd_...)`}</CodeBlock>
              <p className="mt-2">After connecting they see a directory per endpoint they may access. Upload into the matching directory:</p>
              <CodeBlock title="SFTP upload" lang="bash">{`sftp> cd invoices
sftp> put document.pdf
sftp> bye`}</CodeBlock>
              <p className="mt-2 text-sm text-text-muted">This embedded server is for parties connecting <strong>into</strong> FileDrop. To have FileDrop connect <strong>out</strong> to a remote SFTP server, use SFTP Servers + Transfers below.</p>
            </Section>

            {/* ─────────────── Retrieving ─────────────── */}
            <Section id="retrieving" title="Retrieving files">
              <p>If <code>allowRetrieval</code> is enabled on an endpoint, API-key holders can list and download files:</p>
              <CodeBlock title="List files" lang="bash">{`curl ${baseUrl}/api/drop/{endpoint-slug} \\
  -H "Authorization: Bearer fd_your_api_key_here"`}</CodeBlock>
              <CodeBlock title="Download a file" lang="bash">{`curl -O ${baseUrl}/api/drop/{endpoint-slug}/{filename} \\
  -H "Authorization: Bearer fd_your_api_key_here"`}</CodeBlock>
            </Section>

            {/* ─────────────── SFTP Servers (outbound) ─────────────── */}
            <ModuleCard id="sftp-servers" title="SFTP Servers (saved connections)" where="SFTP Servers" color={C.sftp}>
              <p>Reusable remote SFTP servers that FileDrop connects <strong>out</strong> to. Each is referenced by one or more Transfers; the remote path and direction live on the Transfer, not here.</p>
              <DefRow term="host / port / username">Connection coordinates.</DefRow>
              <DefRow term="password / privateKey">Authenticate with a password (encrypted at rest) and/or a PEM private key.</DefRow>
              <p className="mt-2 text-sm text-text-muted">Use <strong>Test</strong> to verify connectivity and <strong>Browse</strong> to pick a remote path interactively.</p>
            </ModuleCard>

            {/* ─────────────── Transfers ─────────────── */}
            <ModuleCard id="transfers" title="Transfers" where="Transfers" color={C.transfer}>
              <p>Scheduled SFTP jobs that move files between a local Destination and a remote SFTP Server.</p>
              <DefRow term="direction">{`"pull" = remote → destination; "push" = destination → remote.`}</DefRow>
              <DefRow term="connection + remotePath">Which saved SFTP Server, and the remote directory (source for pull, target for push).</DefRow>
              <DefRow term="destination + subdirectory">The local side (target for pull, source for push).</DefRow>
              <DefRow term="selection">Which files to move: <code>all</code>, a <code>single</code> name, a <code>glob</code> (e.g. <code>*.xml</code>), or an explicit <code>list</code>; with optional extension filter and recursion.</DefRow>
              <DefRow term="fileNaming">Naming applied to files written on the target side.</DefRow>
              <DefRow term="conflictPolicy">On a name clash at the target: <code>overwrite</code>, <code>rename</code>, or <code>skip</code>.</DefRow>
              <DefRow term="deleteSourceAfterTransfer">Remove each source file once it transfers successfully.</DefRow>
              <DefRow term="schedule / watch">Run automatically on an interval, or (push only) when the local source folder changes.</DefRow>
              <DefRow term="retryPolicy / notifications / webhook">Per-file retries with dead-letter, plus email/webhook alerts.</DefRow>
              <p className="mt-2 text-sm text-text-muted">Run manually anytime; every run is recorded with per-file counts and status (success / partial / failed).</p>
            </ModuleCard>

            {/* ─────────────── SOAP Endpoints ─────────────── */}
            <ModuleCard id="soap-endpoints" title="SOAP Endpoints" where="SOAP Endpoints" color={C.soap}>
              <p>Saved SOAP/HTTP targets that Integrations POST to.</p>
              <DefRow term="url / username / password">Full endpoint URL (with port) and Basic-auth credentials (encrypted at rest).</DefRow>
              <DefRow term="soapAction">Value for the <code>SOAPAction</code> header (empty if not required).</DefRow>
              <DefRow term="envelopeMode">{`"raw" = the source file IS the full SOAP envelope; "template" = wrap the file at the {PAYLOAD} placeholder in envelopeTemplate. The {FILENAME} token is also available.`}</DefRow>
              <DefRow term="extractBody">When saving the response, strip the outer Envelope/Body, or keep the full document.</DefRow>
              <DefRow term="ignoreTlsErrors">Accept self-signed / internal certificates.</DefRow>
            </ModuleCard>

            {/* ─────────────── FTP Servers ─────────────── */}
            <ModuleCard id="ftp-servers" title="FTP Servers" where="FTP Servers" color={C.ftp}>
              <p>Saved FTP/FTPS servers that Integrations push responses to.</p>
              <DefRow term="host / port / username / password">Connection coordinates (password encrypted at rest).</DefRow>
              <DefRow term="secure">Use FTPS (FTP over TLS).</DefRow>
              <DefRow term="ignoreTlsErrors">Skip TLS certificate verification.</DefRow>
            </ModuleCard>

            {/* ─────────────── Integrations ─────────────── */}
            <ModuleCard id="integrations" title="Integrations" where="Integrations" color={C.integration}>
              <p>A pipeline job. For each selected source file it runs these steps:</p>
              <IntegrationPipeline />
              <SubSection>Key options</SubSection>
              <DefRow term="source + sourceSelection">Local destination/subdirectory to read from, and which files to pick.</DefRow>
              <DefRow term="soapConnection">The SOAP endpoint to call.</DefRow>
              <DefRow term="outboundFileNaming">Name the source file as forwarded to SOAP (exposed via the <code>&#123;FILENAME&#125;</code> token and the <code>Content-Disposition</code> header).</DefRow>
              <DefRow term="response destination + responseFileNaming">Optionally save the SOAP response locally with a chosen name.</DefRow>
              <DefRow term="ftpConnection + ftpRemotePath">Optionally push the response to an FTP server.</DefRow>
              <DefRow term="deleteSourceAfterRun / archivePolicy">After success, delete the source or move it to an archive subfolder (archive takes precedence).</DefRow>
              <DefRow term="postSourceAsBytes">Post the raw source bytes unchanged (raw envelope mode) instead of a UTF-8 round-trip.</DefRow>
              <DefRow term="schedule / watch / retryPolicy / notifications">Same automation, retry, and alerting options as Transfers.</DefRow>
            </ModuleCard>

            {/* ─────────────── File naming ─────────────── */}
            <Section id="file-naming" title="File naming">
              <p>Endpoints, transfers, and integrations can rewrite filenames with a mask. Available tokens:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
                {FILE_NAMING_TOKENS.map((token) => (
                  <Token key={token} name={token} desc={FILE_NAMING_TOKEN_DESCRIPTIONS[token] || ""} />
                ))}
              </div>
              <p className="mt-3 text-sm text-text-muted">Click a token to copy it. Example: <code>{"{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}"}</code> → <code>20240315-103045_invoice.pdf</code></p>
            </Section>

            {/* ─────────────── Scheduling ─────────────── */}
            <Section id="scheduling" title="Scheduling">
              <p>Transfers and Integrations can run automatically on an interval handled by the built-in scheduler.</p>
              <DefRow term="every + unit">Interval count and unit: <code>seconds</code>, <code>minutes</code>, <code>hours</code>, or <code>days</code>.</DefRow>
              <DefRow term="atTime">For the <code>days</code> unit, the time of day (<code>HH:MM</code>) to run.</DefRow>
              <p className="mt-2 text-sm text-text-muted">A new scheduled run is skipped if the previous run of the same job is still in progress.</p>
            </Section>

            {/* ─────────────── Folder watcher ─────────────── */}
            <Section id="folder-watcher" title="Folder watcher">
              <p>Instead of (or in addition to) a schedule, a job can trigger when its local source folder changes.</p>
              <DefRow term="enabled">Watch the local source folder and fire a run after files appear/change.</DefRow>
              <DefRow term="recursive">Include subfolders.</DefRow>
              <DefRow term="debounceMs">Quiet period after the last change before a run is triggered (avoids firing mid-copy).</DefRow>
              <p className="mt-2 text-sm text-text-muted">
                Watching needs a local source, so it applies to <strong>push</strong> transfers and <strong>all</strong> integrations.
                Pull transfers read from a remote server and cannot be watched. Internal archive / dead-letter folders are ignored to avoid self-triggering loops.
              </p>
            </Section>

            {/* ─────────────── Retry & dead-letter ─────────────── */}
            <Section id="retry" title="Retry & dead-letter">
              <p>Transfers and Integrations can retry individual file operations and quarantine files that never succeed.</p>
              <DefRow term="enabled">Turn on retry/dead-letter for the job.</DefRow>
              <DefRow term="maxAttempts">Total attempts per file, including the first.</DefRow>
              <DefRow term="backoffSeconds">Delay between attempts (linear backoff).</DefRow>
              <DefRow term="deadLetterSubdirectory">Folder (under the source root) that exhausted files are moved into; defaults to <code>_dead-letter</code>.</DefRow>
            </Section>

            {/* ─────────────── Notifications & webhooks ─────────────── */}
            <Section id="notifications" title="Notifications & webhooks">
              <p>Endpoints, Transfers, and Integrations can each notify on activity.</p>
              <SubSection>Email</SubSection>
              <DefRow term="email">Address to notify (requires SMTP configured in Settings → Email).</DefRow>
              <DefRow term="on">When to send: <code>all</code>, <code>failures</code>, or <code>none</code>.</DefRow>
              <SubSection>Webhook</SubSection>
              <DefRow term="url">Endpoint that receives a JSON <code>POST</code>.</DefRow>
              <DefRow term="on">Same <code>all</code> / <code>failures</code> / <code>none</code> selector.</DefRow>
              <DefRow term="secret">Optional shared secret used to sign the request.</DefRow>
              <p className="mt-3 text-sm text-text-secondary">Event names sent in the webhook payload:</p>
              <div className="mt-1">
                <DefRow term="endpoint.upload.*">{`.succeeded / .failed — per HTTP upload`}</DefRow>
                <DefRow term="transfer.run.*">{`.succeeded / .failed — per transfer run`}</DefRow>
                <DefRow term="integration.run.*">{`.succeeded / .failed — per integration run`}</DefRow>
              </div>
            </Section>

            {/* ─────────────── Monitoring ─────────────── */}
            <Section id="monitoring" title="Monitoring & operations">
              <DefRow term="Dashboard">At-a-glance counts and recent activity across the system.</DefRow>
              <DefRow term="Flow Map">A visual topology of every connector, job, and storage node. Drag to rearrange (positions persist), filter by Tag, and export an A4 PNG.</DefRow>
              <DefRow term="Data">Browse the underlying <code>/DATA</code> tree and your destinations; upload and download files directly.</DefRow>
              <DefRow term="Connections">A log of inbound HTTP requests to the drop API (IP, party, status, response time).</DefRow>
              <DefRow term="Audit Log">Who did what — configuration changes and file uploads, with actor and source IP.</DefRow>
              <p className="mt-2 text-sm text-text-muted">When VictoriaLogs is enabled, uploads, transfers, connections, and audit events are also forwarded there (see Settings → Logging).</p>
            </Section>

            {/* ─────────────── Settings ─────────────── */}
            <Section id="settings" title="Settings">
              <DefRow term="General">App name, global max file size, and file retention (days; 0 = keep forever).</DefRow>
              <DefRow term="Users">Add/remove users, promote/demote admins, and unlock locked-out accounts.</DefRow>
              <DefRow term="Security">Per-key rate limit (requests/minute) and changing your own password.</DefRow>
              <DefRow term="Email">SMTP host/port/credentials and a test-send, used by email notifications.</DefRow>
              <DefRow term="Logging">VictoriaLogs forwarding: host, port, and protocol (HTTP JSON, syslog UDP, or syslog TCP), with a test.</DefRow>
              <p className="mt-2 text-sm text-text-muted">The embedded SFTP server (<code>sftpServerEnabled</code> / <code>sftpServerPort</code>) is part of the application settings and pairs with <code>sftp-server</code> endpoints.</p>
            </Section>

            {/* ─────────────── Health ─────────────── */}
            <Section id="health" title="Health check">
              <CodeBlock title="Check if the service is running (no auth required)" lang="bash">{`curl ${baseUrl}/api/health`}</CodeBlock>
            </Section>

            {/* ─────────────── Reverse proxy ─────────────── */}
            <Section id="reverse-proxy" title="Reverse proxy">
              <p>FileDrop works behind nginx, Apache, or Caddy. Set these environment variables:</p>
              <CodeBlock title="Environment" lang="bash">{`TRUST_PROXY=true
SECURE_COOKIES=true`}</CodeBlock>
              <p className="mt-2 text-sm text-text-muted">Important: set <code>client_max_body_size</code> (nginx) or <code>LimitRequestBody</code> (Apache) to at least your max upload size.</p>
            </Section>

            {/* ─────────────── API key security ─────────────── */}
            <Section id="api-security" title="API key security">
              <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                <li>Keys are generated with <code>crypto.randomBytes(48)</code> — 384 bits of entropy</li>
                <li>Only a SHA-256 hash is stored; the plaintext is shown <strong>once</strong> at creation</li>
                <li>Each key is scoped to specific endpoints — it cannot access others</li>
                <li>Keys can have an expiry date and can be revoked instantly</li>
                <li>Rate limiting is enforced per key (default: 60 requests/minute)</li>
                <li>Remote-server passwords (SFTP/SOAP/FTP/SMB) are stored AES-256-GCM encrypted</li>
              </ul>
            </Section>

            {/* ─────────────── Changelog ─────────────── */}
            <Section id="changelog" title={`Changelog (${APP_VERSION})`}>
              <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                <li>Documentation rewritten to cover every module, with an architecture diagram and an A → Z setup flow.</li>
                <li>Flow Map: exported A4 PNG now renders edge lines reliably.</li>
                <li>Scheduler: folder watcher triggers push transfers and integrations on local file changes (optionally recursive).</li>
                <li>Integrations: configurable outbound source filename via the <code>&#123;FILENAME&#125;</code> token and <code>Content-Disposition</code>.</li>
                <li>Flow Map: tiered layout, bidirectional edges, draggable nodes with saved positions.</li>
              </ul>
            </Section>

            <div className="h-12" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── presentational helpers ───────────────────────────── */

function Toc() {
  return (
    <nav className="mb-8 rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">On this page</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
        {TOC.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="text-sm text-accent hover:underline truncate">{t.label}</a>
        ))}
      </div>
    </nav>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-4">
      <h2 className="text-lg font-semibold text-text-primary mb-3 pb-2 border-b border-border">{title}</h2>
      <div className="text-sm text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

/** A module section with a colored accent and a "where to find it" pill. */
function ModuleCard({ id, title, where, color, children }: { id: string; title: string; where: string; color: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-4">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border" style={{ borderBottomColor: color }}>
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          {title}
        </h2>
        <Pill color={color}>{where}</Pill>
      </div>
      <div className="text-sm text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function SubSection({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-text-primary mt-4 mb-1">{children}</h3>;
}

function Pill({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: color ? `${color}1a` : "var(--color-muted)", color: color || "var(--color-text-muted)" }}
    >
      {children}
    </span>
  );
}

/** A term/definition row used for option lists. */
function DefRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3 py-1.5 border-b border-border/40 last:border-0">
      <code className="text-xs text-accent sm:min-w-[180px] sm:shrink-0">{term}</code>
      <span className="text-sm text-text-secondary">{children}</span>
    </div>
  );
}

function FlowBox({ title, subtitle, color }: { title: string; subtitle?: string; color: string }) {
  return (
    <div
      className="rounded-lg border border-border bg-surface px-3 py-2 text-center min-w-[112px]"
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <div className="text-xs font-semibold text-text-primary leading-tight">{title}</div>
      {subtitle && <div className="text-[10px] text-text-muted mt-0.5 leading-tight">{subtitle}</div>}
    </div>
  );
}

function Arrow() {
  return <div className="text-text-muted text-lg leading-none select-none px-0.5" aria-hidden>→</div>;
}

function ArchitectureDiagram() {
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-alt p-4">
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        <FlowBox title="External party" subtitle="or internal system" color={C.party} />
        <Arrow />
        <FlowBox title="Endpoint" subtitle="API · SFTP server" color={C.endpoint} />
        <Arrow />
        <FlowBox title="Destination" subtitle="local · NFS · SMB" color={C.destination} />
        <Arrow />
        <FlowBox title="Transfer / Integration" subtitle="schedule · watch" color={C.transfer} />
        <Arrow />
        <FlowBox title="Remote systems" subtitle="SFTP · SOAP · FTP" color={C.soap} />
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-text-muted">
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <span className="font-semibold text-text-secondary">Guarded by</span> — API Keys (scoped per endpoint), rate limiting, size/extension/duplicate checks
        </div>
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <span className="font-semibold text-text-secondary">Observed by</span> — Dashboard · Flow Map · Connections · Audit Log · VictoriaLogs
        </div>
      </div>
    </div>
  );
}

function IntegrationPipeline() {
  return (
    <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap rounded-lg border border-border bg-surface-alt p-4">
      <FlowBox title="1. Read" subtitle="local source file" color={C.destination} />
      <Arrow />
      <FlowBox title="2. POST" subtitle="SOAP endpoint" color={C.soap} />
      <Arrow />
      <FlowBox title="3. Save" subtitle="response (optional)" color={C.destination} />
      <Arrow />
      <FlowBox title="4. Push" subtitle="FTP (optional)" color={C.ftp} />
      <Arrow />
      <FlowBox title="5. Archive" subtitle="or delete source" color={C.transfer} />
    </div>
  );
}

/** A → Z setup as a numbered vertical flow. */
function SetupFlow() {
  const stages: { title: string; where?: string; body: React.ReactNode }[] = [
    { title: "Create a Destination", where: "Destinations", body: <>Choose where files will be stored — a local path, NFS export, or SMB share. Test that it&apos;s accessible.</> },
    { title: "Create an Endpoint", where: "Endpoints", body: <>Pick the type (API or SFTP server) and the destination. Set allowed extensions, max size, file naming, and any routing filters. Enable retrieval / duplicate rejection if needed.</> },
    { title: "Generate an API Key", where: "API Keys", body: <>Scope it to the new endpoint and copy the plaintext key now — it&apos;s shown only once.</> },
    { title: "(Optional) Group with a Tag", where: "Tags", body: <>Tag the endpoint and destination so they&apos;re easy to find and filter on the Flow Map.</> },
    { title: "Share access with the party", body: <>Send them the drop URL (<code>/api/drop/&#123;slug&#125;</code>) or SFTP host, plus their API key.</> },
    { title: "Party uploads files", body: <>Over HTTP or SFTP. FileDrop validates the key, applies limits and filters, and writes the file with the configured name.</> },
    { title: "Verify & get notified", where: "Dashboard · Data · Audit", body: <>Confirm arrival in Data / Dashboard, review Connections &amp; Audit Log, and wire up email/webhook notifications.</> },
    { title: "(Optional) Forward onward", where: "Transfers · Integrations", body: <>Move received files to a remote SFTP server, or run them through a SOAP → FTP integration — on a schedule or folder watch.</> },
  ];
  return (
    <ol className="mt-4 relative border-l-2 border-border ml-3">
      {stages.map((s, i) => (
        <li key={i} className="mb-5 ml-6">
          <span className="absolute -left-[15px] flex items-center justify-center w-7 h-7 rounded-full bg-accent text-white text-xs font-bold ring-4 ring-[var(--color-bg)]">{i + 1}</span>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-text-primary">{s.title}</h3>
            {s.where && <Pill>{s.where}</Pill>}
          </div>
          <p className="text-sm text-text-secondary mt-0.5">{s.body}</p>
        </li>
      ))}
    </ol>
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
        <span className="text-xs font-medium text-text-muted">{title}{lang ? ` · ${lang}` : ""}</span>
        <button onClick={copy} className="text-xs text-text-muted hover:text-accent transition-colors">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono bg-[var(--color-input-bg)] border border-border rounded-b-lg overflow-x-auto whitespace-pre-wrap text-text-primary">{children}</pre>
    </div>
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
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(true);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = name;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
    }
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <>
      <button type="button" className="text-xs text-accent text-left hover:underline" onClick={copy}>
        {copied ? `${name} copied` : name}
      </button>
      <span className="text-text-muted">{desc}</span>
    </>
  );
}
