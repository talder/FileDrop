# FileDrop — External Party Integration Guide

This document explains how to upload files to the FileDrop service.

## Overview

You have been provided with:
1. A **drop URL** — the endpoint where you send files (e.g. `https://filedrop.example.com/api/drop/invoices`)
2. An **API key** — a secret token starting with `fd_` that authenticates your requests

## Authentication

All requests must include the API key in the `Authorization` header:

```
Authorization: Bearer fd_your_api_key_here
```

**Keep your API key secret.** Do not share it in public repositories, emails, or logs.

## Uploading Files

Send a `POST` request with the file(s) as `multipart/form-data`:

### Single file upload

```bash
curl -X POST https://filedrop.example.com/api/drop/invoices \
  -H "Authorization: Bearer fd_your_api_key_here" \
  -F "file=@/path/to/invoice.pdf"
```

### Multiple file upload

```bash
curl -X POST https://filedrop.example.com/api/drop/invoices \
  -H "Authorization: Bearer fd_your_api_key_here" \
  -F "file=@/path/to/file1.pdf" \
  -F "file=@/path/to/file2.xml"
```

### Using PowerShell

```powershell
$headers = @{
    "Authorization" = "Bearer fd_your_api_key_here"
}

$form = @{
    file = Get-Item -Path "C:\path\to\invoice.pdf"
}

Invoke-RestMethod -Uri "https://filedrop.example.com/api/drop/invoices" `
    -Method Post `
    -Headers $headers `
    -Form $form
```

### Using Python

```python
import requests

url = "https://filedrop.example.com/api/drop/invoices"
headers = {"Authorization": "Bearer fd_your_api_key_here"}

with open("invoice.pdf", "rb") as f:
    response = requests.post(url, headers=headers, files={"file": f})

print(response.json())
```

### Using C# / .NET

```csharp
using var client = new HttpClient();
client.DefaultRequestHeaders.Add("Authorization", "Bearer fd_your_api_key_here");

using var content = new MultipartFormDataContent();
using var fileStream = File.OpenRead(@"C:\path\to\invoice.pdf");
content.Add(new StreamContent(fileStream), "file", "invoice.pdf");

var response = await client.PostAsync("https://filedrop.example.com/api/drop/invoices", content);
var result = await response.Content.ReadAsStringAsync();
Console.WriteLine(result);
```

## Response Format

### Successful upload

```json
{
  "success": true,
  "received": 1,
  "failed": 0,
  "files": [
    {
      "filename": "2024-03-15T10-30-00-000Z_a1b2c3d4_invoice.pdf",
      "size": 245760,
      "id": 42
    }
  ]
}
```

### Partial success (some files failed)

```json
{
  "success": true,
  "received": 1,
  "failed": 1,
  "files": [{ "filename": "...", "size": 1024, "id": 43 }],
  "errors": ["File \"large.zip\" exceeds maximum size of 50.0MB"]
}
```

### Error responses

| Status | Meaning |
|--------|---------|
| 400 | Invalid request (no files, bad format) |
| 401 | Invalid, expired, or revoked API key |
| 403 | API key does not have access to this endpoint |
| 404 | Endpoint not found |
| 429 | Rate limit exceeded — wait and retry |
| 503 | Endpoint disabled or destination unavailable |

## Constraints

- **File size**: Each file has a maximum size limit (default 50 MB, may vary per endpoint). Check with your contact.
- **File types**: Some endpoints restrict allowed file extensions (e.g. `.pdf`, `.xml` only).
- **Rate limiting**: There is a per-key rate limit (default: 60 requests per minute).
- **Form field name**: Use `file` or `files` as the form field name.

## Health Check

You can verify the service is running:

```bash
curl https://filedrop.example.com/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-03-15T10:30:00.000Z",
  "version": "0.1.0"
}
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `401 Unauthorized` | Check that the API key is correct and not revoked/expired |
| `403 Forbidden` | Your key may not have access to this endpoint — contact the administrator |
| `429 Too Many Requests` | Slow down; check the `Retry-After` header |
| `503 Service Unavailable` | The endpoint is disabled or the storage destination is not accessible |
| Connection refused | Verify the URL and that the service is running |

## Contact

If you experience issues, contact the FileDrop administrator who provided your API key.
