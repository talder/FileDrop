# Reverse Proxy Configuration

FileDrop is designed to work behind a reverse proxy. This guide covers common setups.

## Environment Variables

Set these on the FileDrop server:

```bash
TRUST_PROXY=true           # Trust X-Forwarded-* headers
SECURE_COOKIES=true        # Use Secure flag on session cookies (required for HTTPS)
```

## Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name filedrop.example.com;

    ssl_certificate     /etc/ssl/certs/filedrop.crt;
    ssl_certificate_key /etc/ssl/private/filedrop.key;

    client_max_body_size 100m;  # Must be >= your max upload size

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        # WebSocket support (for Next.js HMR in dev)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts for large uploads
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}

# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name filedrop.example.com;
    return 301 https://$server_name$request_uri;
}
```

## Apache

```apache
<VirtualHost *:443>
    ServerName filedrop.example.com

    SSLEngine on
    SSLCertificateFile    /etc/ssl/certs/filedrop.crt
    SSLCertificateKeyFile /etc/ssl/private/filedrop.key

    # Max upload size
    LimitRequestBody 104857600

    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-For "%{REMOTE_ADDR}s"

    # Timeout for large uploads
    ProxyTimeout 300
</VirtualHost>
```

Enable required modules:
```bash
a2enmod proxy proxy_http ssl headers
systemctl restart apache2
```

## Caddy

Caddy is the simplest option — it handles TLS automatically:

```caddyfile
filedrop.example.com {
    reverse_proxy localhost:3000

    # Increase upload limit
    request_body {
        max_size 100MB
    }
}
```

## Important Notes

1. **Upload size limits**: Your reverse proxy must allow at least the same body size as your FileDrop max file size setting (default 50MB). Both nginx and Apache default to much lower limits.

2. **Timeouts**: Large file uploads can take time. Increase proxy timeouts to at least 300 seconds.

3. **WebSocket**: If using the Next.js dev server behind the proxy, ensure WebSocket upgrade headers are forwarded (needed for HMR).

4. **HTTPS**: Always use HTTPS in production. Set `SECURE_COOKIES=true` to ensure session cookies have the Secure flag.

5. **IP forwarding**: The `X-Forwarded-For` and `X-Real-IP` headers are used for rate limiting and audit logging. Make sure your proxy sets these correctly.
