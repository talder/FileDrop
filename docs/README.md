# FileDrop

A secure web service for receiving files from external parties and external parties via HTTP. Features a management UI for configuring drop endpoints, file destinations (local, NFS, SMB), users, and API keys.

## Features

- **Named drop endpoints** — Create URLs like `/api/drop/invoices` for external parties to upload files
- **Flexible destinations** — Store files on local disk, NFS shares, or SMB/CIFS shares
- **Secure API keys** — Cryptographically generated keys (SHA-256 hashed), scoped to specific endpoints
- **Dashboard** — Real-time file activity log, stats, and mount health indicators
- **User management** — Local user accounts with bcrypt passwords, account lockout
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

## Architecture

### Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Backend**: Next.js API routes (Node.js)
- **Database**: SQLite via better-sqlite3 (KV store + tables for logs/keys)
- **Auth**: bcrypt password hashing, httpOnly session cookies
- **Icons**: lucide-react

### Data Storage

- `config/filedrop.db` — SQLite database containing:
  - `kv` table — JSON config (users, sessions, endpoints, destinations, settings)
  - `api_keys` table — API keys (SHA-256 hashed)
  - `file_log` table — Upload audit log

### File Upload Flow

1. External party sends `POST /api/drop/{slug}` with `Authorization: Bearer fd_...`
2. Server validates: API key → not revoked/expired → has access to endpoint → file size/extension checks
3. File written to the configured destination with a timestamped unique filename
4. JSON receipt returned; entry logged to `file_log`

## Pages

| Path | Description |
|------|-------------|
| `/` | Dashboard — stats cards, file activity log |
| `/endpoints` | Manage drop endpoints (CRUD, enable/disable, copy URL) |
| `/destinations` | Manage file destinations (local/NFS/SMB, mount/unmount) |
| `/api-keys` | Generate and manage API keys for external parties |
| `/settings` | General settings, user management, security config |
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
| `GET/POST` | `/api/destinations` | List / create destinations |
| `GET/PUT/DELETE` | `/api/destinations/{id}` | Get / update / delete destination |
| `POST` | `/api/destinations/{id}/mount` | Mount NFS/SMB share |
| `POST` | `/api/destinations/{id}/unmount` | Unmount share |
| `POST` | `/api/destinations/{id}/test` | Test destination accessibility |
| `GET/POST` | `/api/api-keys` | List / generate API keys |
| `DELETE/PATCH` | `/api/api-keys/{id}` | Delete / revoke key |
| `GET` | `/api/logs` | File activity log (with filtering) |
| `GET/PUT` | `/api/settings` | Get / update app settings |
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
