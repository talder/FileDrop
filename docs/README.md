# FileDrop
FileDrop is a self-hosted file exchange and automation service built with Next.js. It supports:
- inbound file delivery from external parties (HTTP and embedded SFTP),
- outbound SFTP transfer jobs (pull/push),
- SOAP integration pipelines with optional FTP/FTPS delivery,
- operational logging, auditing, and admin management in one UI.

## Core capabilities
- **Drop endpoints** (`/api/drop/{slug}`) for external parties to upload files with API keys.
- **Embedded SFTP server** for inbound file delivery, authenticated with API keys.
- **Reusable remote connections**:
  - SFTP servers (used by Transfers),
  - SOAP endpoints (used by Integrations),
  - FTP/FTPS servers (optional delivery target for Integrations).
- **Transfers** for SFTP pull/push automation with selection rules, naming rules, conflict handling, and scheduler support.
- **Integrations** that read source files, POST to SOAP, optionally save responses locally, optionally deliver to FTP/FTPS, optionally archive or delete source files after success, and optionally post raw bytes to preserve source encoding.
- **Destinations** backed by Local paths, NFS, or SMB/CIFS (including mount/unmount and accessibility testing).
- **Local folder browser** for selecting destination paths under `/DATA`.
- **Remote SFTP browser** for exploring a server's folder tree and picking a transfer's remote path.
- **API key lifecycle** (generate, scoped access, revoke/delete, optional expiry).
- **User/session lifecycle** (setup, login/logout, admin-managed users, lockout/unlock, password reset).
- **Observability**:
  - file activity log,
  - connection log,
  - audit log,
  - transfer and integration run history,
  - optional VictoriaLogs forwarding.

## Quick start
### Prerequisites
- Node.js >= 24
- npm >= 10

### Install and run
```bash
git clone <repo-url> FileDrop
cd FileDrop
npm install
npm run dev
```

Open `http://localhost:3000`.
On first launch, create the initial admin via `/setup`.

### Production
```bash
npm run build
npm start
```

## UI pages and routes
| Path | Purpose |
|---|---|
| `/` | Dashboard: daily/total file stats, endpoint/key counts, recent file activity |
| `/endpoints` | Manage drop endpoints (slug, type, destination, limits, retrieval, notifications, naming) |
| `/destinations` | Manage local/NFS/SMB destinations, test, mount/unmount, and browse folders under `/DATA` |
| `/sftp-servers` | Manage reusable outbound SFTP server connections; browse a server's folders |
| `/transfers` | Manage SFTP transfer jobs (pull/push), schedules, run now, run history; browse the remote path |
| `/soap-connections` | Manage reusable SOAP endpoint definitions and connection tests |
| `/soap-endpoints` | Alias route that redirects to `/soap-connections` |
| `/ftp-connections` | Manage reusable FTP/FTPS server definitions and connection tests |
| `/ftp-servers` | Alias route that redirects to `/ftp-connections` |
| `/integrations` | Manage SOAP integrations (source selection, response save, FTP delivery, schedules, runs) |
| `/api-keys` | Generate, list, revoke, and delete API keys |
| `/connections` | Connection log (request-level visibility of inbound activity) |
| `/audit-log` | Audit trail for auth/admin/configuration actions |
| `/settings` | Tabs: General, Users, Security, Email, Logging |
| `/documentation` | In-app quick reference page |
| `/login` | User login |
| `/setup` | First-run admin setup |

## Functional workflows
### 1) Inbound files over HTTP
1. Create a **Destination**.
2. Create an **Endpoint** with slug + destination.
3. Generate an **API key** with access to that slug.
4. External party uploads using `POST /api/drop/{slug}` and `Authorization: Bearer fd_...`.

Optional endpoint behavior:
- extension whitelist,
- per-endpoint max file size override,
- file naming mode/pattern,
- retrieval enabled (`GET /api/drop/{slug}` and `/api/drop/{slug}/{filename}`),
- email notifications on `all` or `failures`.

### 2) Inbound files over embedded SFTP server
- Enable the embedded SFTP server via settings data (`sftpServerEnabled`, `sftpServerPort`) through `/api/settings` or config state.
- External party connects to FileDrop’s SFTP port.
- Use **API key as password**.
- Accessible SFTP directories are limited to endpoint slugs allowed by that API key.

### 3) SFTP Transfers (outbound jobs)
- A Transfer binds:
  - one SFTP server connection,
  - one destination,
  - direction (`pull` or `push`),
  - selection + naming + conflict policy + schedule.
- Supports manual runs and scheduled runs.
- Stores run history and updates last-run status on each transfer row.

### 4) SOAP Integrations
- An Integration binds:
  - source destination + selection,
  - one SOAP connection,
  - optional local response destination + response naming,
  - optional FTP/FTPS delivery target,
  - optional archiving (timestamped, to a subfolder) or deletion of source files after success,
  - optional byte-accurate posting of the source file (raw envelope mode only),
  - optional schedule and notifications.
- Supports manual and scheduled runs with run history.

## Scheduling model
Transfers and Integrations share the same scheduling model:
- `enabled: false` → manual only.
- Interval mode: every `N` `seconds` / `minutes` / `hours` / `days`.
- Daily-time support: for `days`, optional `atTime` (`HH:MM`) for fixed-time execution.
- Minimum interval for `seconds` is **5**.
- Changing schedule/enable state re-arms scheduler behavior.

## File selection, naming, and conflict handling
### Selection modes
- `all`
- `single`
- `glob`
- `list`
- optional extension filtering and optional recursion.

### Naming
Modes:
- `original`
- `mask`

Common mask tokens:
- `{ORIGINAL}`, `{EXT}`
- `{YYYY}`, `{YY}`, `{MM}`, `{DD}`
- `{HH}`, `{mm}`, `{ss}`
- `{UUID}`, `{UUID8}`, `{SEQ}`

### Conflict policy (Transfers)
- `skip`
- `rename`
- `overwrite`

## Local folder browser (`/DATA`)
The destination path browser is intentionally constrained to `/DATA`.

Where to find it:
- **Destinations page header**: `Browse /DATA` button.
- **Destination create/edit modal**: `Browse /DATA` next to local path / mount point.

Behavior:
- Shows directories only.
- Supports child navigation, parent navigation, and root jump.
- Rejects paths outside `/DATA`.

## Remote SFTP browser
Browse a saved SFTP server's directory tree to discover and copy remote paths.

Where to find it:
- **SFTP Servers page**: `Browse` action on a server row (copies the chosen path to the clipboard).
- **Transfer create/edit modal**: `Browse` next to **Remote Path** (fills in the selected folder).

Behavior:
- Lists one directory level at a time (folders and files), with child/parent navigation and a jump to the login directory.
- Resolves the starting path to an absolute path; defaults to the connection's login directory.
- Reuses the saved connection's stored credentials; no password re-entry.

## API reference
### Public (no auth)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Basic service status and timestamp |

### API key auth (external parties)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/drop/{slug}` | Upload one or many files (`multipart/form-data`, `file`/`files` fields) |
| `GET` | `/api/drop/{slug}` | List files for endpoint (only if endpoint retrieval is enabled) |
| `GET` | `/api/drop/{slug}/{filename}` | Download a file (only if endpoint retrieval is enabled) |

### Session auth (admin UI/API)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login and set session cookie |
| `POST` | `/api/auth/logout` | Logout and clear session cookie |
| `GET` | `/api/auth/me` | Current session user (`needsSetup` support) |
| `POST` | `/api/auth/setup` | Create initial admin account (first run only) |
| `GET/POST` | `/api/endpoints` | List/create drop endpoints |
| `GET/PUT/DELETE` | `/api/endpoints/{id}` | Read/update/delete endpoint |
| `GET/POST` | `/api/destinations` | List/create destinations |
| `GET/PUT/DELETE` | `/api/destinations/{id}` | Read/update/delete destination |
| `POST` | `/api/destinations/{id}/test` | Test destination accessibility |
| `POST` | `/api/destinations/{id}/mount` | Mount NFS/SMB destination |
| `POST` | `/api/destinations/{id}/unmount` | Unmount NFS/SMB destination |
| `GET` | `/api/destinations/browse?path=...` | Browse directories under `/DATA` |
| `GET/POST` | `/api/sftp-connections` | List/create SFTP server connections |
| `GET/PUT/DELETE` | `/api/sftp-connections/{id}` | Read/update/delete SFTP connection |
| `POST` | `/api/sftp-connections/{id}/test` | Test SFTP connection (`id=new` supports unsaved values) |
| `POST` | `/api/sftp-connections/{id}/browse` | List one remote directory level (`id=new` supports unsaved values) |
| `GET/POST` | `/api/transfers` | List/create transfers |
| `GET/PUT/DELETE` | `/api/transfers/{id}` | Read/update/delete transfer |
| `POST` | `/api/transfers/{id}/run` | Run transfer now |
| `GET` | `/api/transfers/{id}/runs` | Transfer run history (`limit` query) |
| `GET/POST` | `/api/soap-connections` | List/create SOAP connections |
| `GET/PUT/DELETE` | `/api/soap-connections/{id}` | Read/update/delete SOAP connection |
| `POST` | `/api/soap-connections/{id}/test` | Test SOAP endpoint (`id=new` supports unsaved values) |
| `GET/POST` | `/api/ftp-connections` | List/create FTP/FTPS connections |
| `GET/PUT/DELETE` | `/api/ftp-connections/{id}` | Read/update/delete FTP/FTPS connection |
| `POST` | `/api/ftp-connections/{id}/test` | Test FTP/FTPS connection (`id=new` supports unsaved values) |
| `GET/POST` | `/api/integrations` | List/create integrations |
| `GET/PUT/DELETE` | `/api/integrations/{id}` | Read/update/delete integration |
| `POST` | `/api/integrations/{id}/run` | Run integration now |
| `GET` | `/api/integrations/{id}/runs` | Integration run history (`limit` query) |
| `GET/POST` | `/api/api-keys` | List/generate API keys |
| `PATCH/DELETE` | `/api/api-keys/{id}` | Revoke/update endpoints or delete key |
| `GET` | `/api/logs` | File activity logs and statistics (`stats=true`) |
| `GET` | `/api/connections` | Connection log |
| `GET` | `/api/audit` | Audit log |
| `GET/PUT` | `/api/settings` | Read/update app settings |
| `GET/PUT` | `/api/settings/smtp` | Read/update SMTP settings |
| `POST` | `/api/settings/smtp/test` | Send SMTP test email |
| `POST` | `/api/settings/victorialogs/test` | Send VictoriaLogs test event |
| `GET/POST` | `/api/users` | List/create users |
| `PATCH/DELETE` | `/api/users/{username}` | Unlock/reset password or delete user |

### Useful query parameters
- `/api/logs`: `limit`, `offset`, `endpoint`, `status`, `search`, `stats=true`
- `/api/connections`: `limit`, `offset`, `ip`, `search`
- `/api/audit`: `limit`, `offset`, `actor`, `action`, `search`
- `/api/transfers/{id}/runs`: `limit` (1–200)
- `/api/integrations/{id}/runs`: `limit` (1–200)
- `/api/destinations/browse`: `path` (must resolve inside `/DATA`)

## Settings and configuration
### Environment variables
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | App listen port |
| `SECURE_COOKIES` | auto | Force secure session cookie behavior (`true`/`false`) |
| `FILEDROP_ENC_KEY` | generated/persisted | 64-char hex key for credential encryption consistency across restarts/instances |

### Settings UI tabs
- **General**
  - app name,
  - global max file size,
  - file retention days.
- **Users**
  - list users,
  - add user,
  - unlock locked user,
  - delete user (except self).
- **Security**
  - rate limit per API key (requests/minute).
- **Email**
  - SMTP host/port/credentials/sender/admin email,
  - SMTP send-test action.
- **Logging**
  - VictoriaLogs forwarding toggle + host/port/protocol,
  - test event action.

## Data storage
All configuration and logs are persisted in `config/filedrop.db` (SQLite, WAL mode).

Main tables:
- `kv` (JSON-backed config objects: users, sessions, endpoints, destinations, connections, transfers, integrations, settings)
- `api_keys`
- `file_log`
- `connection_log`
- `audit_log`
- `transfer_runs`
- `integration_runs`

## Security model
- API keys are generated securely and stored as SHA-256 hashes.
- Plain API key value is shown only once at creation.
- User passwords are bcrypt-hashed.
- Login lockout occurs after repeated failures (admin unlock supported).
- Auth endpoints are IP rate-limited.
- Drop uploads are API-key rate-limited.
- Stored credentials (SMB/SFTP/FTP/SOAP secrets) are encrypted (AES-256-GCM).
- Session cookies are `httpOnly` and session lifetime includes idle/absolute expiry controls.
- Security headers are configured in `next.config.ts` (frame/csp/hsts/etc.).

## Logging and observability
- **Dashboard**: live counters + latest file activity.
- **Connection Log**: inbound request metadata and status.
- **Audit Log**: auth/admin/config actions.
- **Run history**: transfer and integration executions with status and counts.
- **VictoriaLogs** (optional): forwards operational events over syslog UDP/TCP or HTTP.

## Reverse proxy and external-party usage
- Reverse proxy deployment details: see `docs/REVERSE-PROXY.md`.
- External client upload guide: see `docs/EXTERNAL-PARTY-GUIDE.md`.
