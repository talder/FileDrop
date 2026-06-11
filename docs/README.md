# FileDrop

A secure web service for receiving files from external parties via HTTP and for moving files to/from SFTP servers. Features a management UI for configuring drop endpoints, SFTP transfers, file destinations (local, NFS, SMB), users, and API keys.

## Features

- **Named drop endpoints** — Create URLs like `/api/drop/invoices` for external parties to upload files over HTTP
- **SFTP Servers** — Save reusable SFTP connections (host, port, username, password/private key) once and reference them from any transfer
- **Transfers** — Move files from or to an SFTP server (no slug required): pull remote files into a destination, or push files from a destination to a remote server. Supports file selection, conflict policy, scheduling, and manual runs
- **Inbound SFTP server** — Accept files pushed by external parties to FileDrop's embedded SFTP server (configured as an `sftp-server` endpoint)
- **Flexible destinations** — Store files on local disk, NFS shares, or SMB/CIFS shares
- **Secure API keys** — Cryptographically generated keys (SHA-256 hashed), scoped to specific endpoints
- **Dashboard** — Real-time file activity log, stats, and mount health indicators
- **User management** — Local user accounts with bcrypt passwords, account lockout
- **VictoriaLogs forwarding** — Optionally ship all events (uploads, transfers, connections, audit actions) to a VictoriaLogs server via syslog (UDP/TCP) or HTTP
- **17 themes** — Light and dark theme variants (matching doc-it UI)
- **Reverse proxy ready** — Works behind nginx, Apache, or Caddy
- **Configurable limits** — Max file size (global + per-endpoint), rate limiting, file extension filtering

## Quick Start

### Prerequisites

- Node.js >= 24.0.0
- npm >= 10.0.0

### Installation

```bash
git clone <repo-url> FileDrop
cd FileDrop
npm install
```

### Development

```bash
npm run dev
```

Open http://localhost:3000. On first visit, you'll be prompted to create an admin account.

### Production

```bash
npm run build
npm start
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `TRUST_PROXY` | `false` | Trust X-Forwarded-* headers |
| `SECURE_COOKIES` | auto | Force secure cookies (`true`/`false`) |
| `FILEDROP_ENC_KEY` | random | 64-char hex key for SMB password encryption. **Set this in production** for persistence across restarts. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### In-App Settings

Configurable via Settings > General:

- **Max file size** — Global default (50 MB). Can be overridden per endpoint.
- **File retention** — Days to keep files (0 = forever).
- **Rate limit** — Requests per minute per API key (default: 60).

Configurable via Settings > Logging (see [Event Logging](#event-logging-victorialogs)):

- **VictoriaLogs forwarding** — Enable/disable, host, port, and protocol (syslog UDP/TCP or HTTP JSON).

## Architecture

### Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Backend**: Next.js API routes (Node.js)
- **Database**: SQLite via better-sqlite3 (KV store + tables for logs/keys)
- **Auth**: bcrypt password hashing, httpOnly session cookies
- **Icons**: lucide-react

### Data Storage

- `config/filedrop.db` — SQLite database containing:
  - `kv` table — JSON config (users, sessions, endpoints, destinations, SFTP connections, transfers, settings)
  - `api_keys` table — API keys (SHA-256 hashed)
  - `file_log` table — Upload / transfer audit log
  - `transfer_runs` table — One row per transfer run (status, file counts, bytes, error)

### File Upload Flow

1. External party sends `POST /api/drop/{slug}` with `Authorization: Bearer fd_...`
2. Server validates: API key → not revoked/expired → has access to endpoint → file size/extension checks
3. File written to the configured destination with a timestamped unique filename
4. JSON receipt returned; entry logged to `file_log`

## Pages

| Path | Description |
|------|-------------|
| `/` | Dashboard — stats cards, file activity log |
| `/endpoints` | Manage drop endpoints — HTTP API + inbound SFTP server (CRUD, enable/disable, copy URL) |
| `/sftp-servers` | Manage reusable SFTP server connections (CRUD, test) |
| `/transfers` | Manage SFTP transfers (direction, selection, schedule, conflict policy, run now, run history) |
| `/destinations` | Manage file destinations (local/NFS/SMB, mount/unmount) |
| `/api-keys` | Generate and manage API keys for external parties |
| `/settings` | General settings, users, security, email, and logging config |
| `/login` | Login page |
| `/setup` | First-run admin creation wizard |

## API Reference

### Public Endpoints (API key auth)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/drop/{slug}` | Upload files (multipart/form-data) |
| `GET` | `/api/health` | Health check (no auth) |

### Admin Endpoints (session auth)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/auth/me` | Current user info |
| `POST` | `/api/auth/setup` | First-run admin creation |
| `GET/POST` | `/api/endpoints` | List / create endpoints |
| `GET/PUT/DELETE` | `/api/endpoints/{id}` | Get / update / delete endpoint |
| `GET/POST` | `/api/sftp-connections` | List / create reusable SFTP connections |
| `GET/PUT/DELETE` | `/api/sftp-connections/{id}` | Get / update / delete connection (DELETE blocked while a transfer references it) |
| `POST` | `/api/sftp-connections/{id}/test` | Test connectivity (use `id=new` to test unsaved params) |
| `GET/POST` | `/api/transfers` | List / create transfers |
| `GET/PUT/DELETE` | `/api/transfers/{id}` | Get / update / delete transfer |
| `POST` | `/api/transfers/{id}/run` | Run a transfer now (manual trigger) |
| `GET` | `/api/transfers/{id}/runs` | Transfer run history |
| `GET/POST` | `/api/destinations` | List / create destinations |
| `GET/PUT/DELETE` | `/api/destinations/{id}` | Get / update / delete destination |
| `POST` | `/api/destinations/{id}/mount` | Mount NFS/SMB share |
| `POST` | `/api/destinations/{id}/unmount` | Unmount share |
| `POST` | `/api/destinations/{id}/test` | Test destination accessibility |
| `GET/POST` | `/api/api-keys` | List / generate API keys |
| `DELETE/PATCH` | `/api/api-keys/{id}` | Delete / revoke key |
| `GET` | `/api/logs` | File activity log (with filtering) |
| `GET/PUT` | `/api/settings` | Get / update app settings |
| `POST` | `/api/settings/smtp/test` | Send a test email |
| `POST` | `/api/settings/victorialogs/test` | Send a test event to VictoriaLogs |
| `GET/POST` | `/api/users` | List / create users |
| `DELETE/PATCH` | `/api/users/{username}` | Delete / unlock / reset password |

## Security

- API keys are generated with `crypto.randomBytes(48)` and stored as SHA-256 hashes
- Plaintext keys are shown only once at creation
- Passwords hashed with bcrypt (12 rounds)
- Account lockout after 5 failed login attempts
- Rate limiting per API key and per IP (auth endpoints)
- SMB credentials encrypted with AES-256-GCM
- Security headers: X-Frame-Options, CSP, HSTS, etc.
- Session idle timeout (1 hour) and absolute timeout (8 hours)

## SFTP: Inbound vs. Outbound

FileDrop handles SFTP in two distinct ways:

- **Inbound SFTP server (Endpoints)** — FileDrop runs an embedded SFTP server. External parties connect to it and push files, which are written to the endpoint's destination. Configure this as an endpoint with type `sftp-server`. Enable/port are set under Settings (`sftpServerEnabled` / `sftpServerPort`). This is *not* a transfer and does not use a saved SFTP connection.
- **Outbound transfers (SFTP Servers + Transfers)** — FileDrop connects *out* to a remote SFTP server (defined as a reusable **SFTP Server** connection) to pull files in or push files out. These are configured as **Transfers** and have no slug.

### Transfers

A transfer references one saved **SFTP Server** connection and one **Destination**, and has a direction:

- **Pull** — list files on the remote `remotePath`, select a subset, and download them into the destination (optionally under a subdirectory). Optionally delete the source files after a successful transfer.
- **Push** — read files from the destination and upload them to the remote `remotePath`.

**File selection** modes (each can be combined with an optional extension filter):

- `all` — every file in the path (optionally recursive)
- `single` — one named file (by name or relative path)
- `glob` — a `*`/`?` wildcard pattern matched against the file name
- `list` — an explicit list of names / relative paths

**File naming** reuses the destination filename mask (`original` or a `mask` with `{YYYY}`, `{MM}`, `{DD}`, `{HH}`, `{mm}`, `{ss}`, `{ORIGINAL}`, `{EXT}`, `{UUID8}` tokens).

**Conflict policy** (when the target name already exists): `skip` (default), `overwrite`, or `rename` (append ` (n)` before the extension).

**Scheduling** uses simple presets rather than cron: run every *N* `seconds` / `minutes` / `hours` / `days`. For `days` you may also set an `atTime` (`HH:MM`) to run at a fixed time of day. The minimum interval for `seconds` is 5. Schedules can be disabled, leaving the transfer manual-only ("Run now"). Changing a schedule in the UI re-arms the scheduler immediately.

Each run records a row in `transfer_runs` (status `success` / `partial` / `failed`, file counts, bytes, error) viewable from the transfer's run history.

### Migration from legacy SFTP endpoints

Endpoints that previously used the SFTP *client* model (type `sftp` with polling) are migrated automatically on startup: each becomes a reusable SFTP Server connection plus a Transfer (polling interval → a `seconds` schedule, `deleteAfterTransfer` → delete-source). Duplicate connections (same host/port/username) are de-duplicated, and the legacy endpoints are removed.

## Event Logging (VictoriaLogs)

FileDrop can forward every event to a [VictoriaLogs](https://docs.victoriametrics.com/VictoriaLogs/) server: file uploads/transfers, outbound connections, audit actions, and transfer-run completions. Forwarding is **best-effort and non-blocking** — it never throws into or slows down a request or transfer path.

Configure under **Settings > Logging**:

- **Enable** — master on/off (enabled by default; a host must be set to actually send)
- **Host** — VictoriaLogs server (default `vxvictorialog01`)
- **Port** — `514` for syslog, `9428` for the HTTP JSON API
- **Protocol** — `syslog-udp` (default), `syslog-tcp`, or `http`

Use the **Send Test** button (or `POST /api/settings/victorialogs/test`) to verify connectivity. Records carry `app=filedrop`, `category`, `level`, and event-specific fields. Syslog transports send RFC5424 messages whose MSG is the JSON record; HTTP uses the `/insert/jsonline` ingestion endpoint.

## Reverse Proxy

See [REVERSE-PROXY.md](./REVERSE-PROXY.md) for nginx, Apache, and Caddy configuration examples.

## External Party Guide

See [EXTERNAL-PARTY-GUIDE.md](./EXTERNAL-PARTY-GUIDE.md) — a standalone document you can share with external parties explaining how to use the API.

## NFS/SMB Mount Management

The app can manage NFS and SMB mounts. This requires appropriate system permissions:

- **macOS**: Uses `mount_nfs` / `mount_smbfs` / `umount`
- **Linux**: Uses `mount -t nfs` / `mount -t cifs` / `umount`

For production, consider:
- Running the app with `sudo` or configuring `sudoers` for mount commands
- Pre-configuring mounts in `/etc/fstab` and using `mount -a`
- Setting `FILEDROP_ENC_KEY` for persistent SMB password encryption
