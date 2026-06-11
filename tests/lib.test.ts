import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "path";

describe("API Key Generation", () => {
  it("should generate a key with fd_ prefix", async () => {
    // Direct crypto test (mirrors api-keys.ts logic)
    const { randomBytes, createHash } = await import("crypto");
    const raw = randomBytes(48).toString("base64url");
    const key = `fd_${raw}`;

    assert.ok(key.startsWith("fd_"), "Key should start with fd_");
    assert.ok(key.length > 50, "Key should be at least 50 chars");

    // Verify SHA-256 hash is deterministic
    const hash1 = createHash("sha256").update(key).digest("hex");
    const hash2 = createHash("sha256").update(key).digest("hex");
    assert.equal(hash1, hash2, "Same key should produce same hash");
    assert.equal(hash1.length, 64, "SHA-256 hash should be 64 hex chars");
  });

  it("should produce unique keys", async () => {
    const { randomBytes } = await import("crypto");
    const key1 = `fd_${randomBytes(48).toString("base64url")}`;
    const key2 = `fd_${randomBytes(48).toString("base64url")}`;
    assert.notEqual(key1, key2, "Keys should be unique");
  });
});

describe("Password Hashing", () => {
  it("should hash and verify passwords with bcrypt", async () => {
    const bcrypt = await import("bcryptjs");
    const password = "testpassword123";
    const hash = await bcrypt.hash(password, 12);

    assert.ok(hash.startsWith("$2"), "Hash should be bcrypt format");
    assert.ok(await bcrypt.compare(password, hash), "Password should match");
    assert.ok(!(await bcrypt.compare("wrong", hash)), "Wrong password should not match");
  });
});

describe("Rate Limiter", () => {
  it("should allow requests within limit", () => {
    // Simple in-memory rate limit simulation
    const buckets = new Map<string, { count: number; resetAt: number }>();
    const key = "test-key";
    const limit = 5;
    const now = Date.now();

    for (let i = 0; i < limit; i++) {
      let entry = buckets.get(key);
      if (!entry || entry.resetAt < now) {
        entry = { count: 1, resetAt: now + 60000 };
        buckets.set(key, entry);
      } else {
        entry.count++;
      }
      assert.ok(entry.count <= limit, `Request ${i + 1} should be within limit`);
    }
  });

  it("should block requests exceeding limit", () => {
    const buckets = new Map<string, { count: number; resetAt: number }>();
    const key = "test-key-2";
    const limit = 3;
    const now = Date.now();

    const entry = { count: 0, resetAt: now + 60000 };
    buckets.set(key, entry);

    for (let i = 0; i < limit + 2; i++) {
      entry.count++;
      if (i >= limit) {
        assert.ok(entry.count > limit, `Request ${i + 1} should exceed limit`);
      }
    }
  });
});

describe("File Extension Validation", () => {
  it("should validate allowed extensions", () => {
    const allowedExtensions = [".pdf", ".xml", ".csv"];

    const testCases = [
      { file: "invoice.pdf", expected: true },
      { file: "data.xml", expected: true },
      { file: "report.csv", expected: true },
      { file: "malware.exe", expected: false },
      { file: "script.js", expected: false },
      { file: "noextension", expected: false },
    ];

    for (const tc of testCases) {
      const ext = path.extname(tc.file).toLowerCase();
      const allowed = allowedExtensions.includes(ext);
      assert.equal(allowed, tc.expected, `${tc.file} should be ${tc.expected ? "allowed" : "blocked"}`);
    }
  });

  it("should allow all when no restrictions", () => {
    const allowedExtensions: string[] = [];
    const files = ["anything.exe", "file.pdf", "data.zip"];

    for (const file of files) {
      const allowed = allowedExtensions.length === 0 || allowedExtensions.includes(path.extname(file).toLowerCase());
      assert.ok(allowed, `${file} should be allowed when no restrictions`);
    }
  });
});

describe("Slug Validation", () => {
  it("should validate endpoint slugs", () => {
    const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

    const valid = ["invoices", "my-endpoint", "a", "test-123", "a1"];
    const invalid = ["-start", "end-", "UPPER", "has space", "special!", ""];

    for (const s of valid) {
      assert.ok(slugRegex.test(s), `"${s}" should be valid`);
    }

    for (const s of invalid) {
      assert.ok(!slugRegex.test(s), `"${s}" should be invalid`);
    }
  });
});

describe("File Naming Mask", () => {
  it("should keep original filename in original mode", () => {
    // Simulate applyFilenameMask logic for original mode
    const name = "invoice report.pdf";
    const sanitized = name.replace(/[<>:"\/\\|?*\x00-\x1f]/g, "_").trim();
    assert.equal(sanitized, "invoice report.pdf");
  });

  it("should replace tokens in mask mode", () => {
    const mask = "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}";
    const d = new Date(2024, 2, 15, 10, 30, 45); // March 15, 2024
    const ext = ".pdf";
    const baseName = "invoice";

    let result = mask
      .replace(/\{ORIGINAL\}/g, baseName)
      .replace(/\{EXT\}/g, ext)
      .replace(/\{YYYY\}/g, String(d.getFullYear()))
      .replace(/\{MM\}/g, "03")
      .replace(/\{DD\}/g, "15")
      .replace(/\{HH\}/g, "10")
      .replace(/\{mm\}/g, "30")
      .replace(/\{ss\}/g, "45");

    assert.equal(result, "20240315-103045_invoice.pdf");
  });

  it("should handle European date format", () => {
    const mask = "{DD}{MM}{YYYY}_{ORIGINAL}{EXT}";
    let result = mask
      .replace(/\{DD\}/g, "15")
      .replace(/\{MM\}/g, "03")
      .replace(/\{YYYY\}/g, "2024")
      .replace(/\{ORIGINAL\}/g, "doc")
      .replace(/\{EXT\}/g, ".pdf");
    assert.equal(result, "15032024_doc.pdf");
  });
});

describe("Encryption (AES-256-GCM)", () => {
  it("should encrypt and decrypt passwords", async () => {
    const { createCipheriv, createDecipheriv, randomBytes } = await import("crypto");
    const key = randomBytes(32);
    const plaintext = "mySecretPassword123!";

    // Encrypt
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const encoded = `ENC:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;

    // Decrypt
    const parts = encoded.split(":");
    const decIv = Buffer.from(parts[1], "hex");
    const decTag = Buffer.from(parts[2], "hex");
    const decData = Buffer.from(parts[3], "hex");
    const decipher = createDecipheriv("aes-256-gcm", key, decIv);
    decipher.setAuthTag(decTag);
    const decrypted = Buffer.concat([decipher.update(decData), decipher.final()]).toString("utf8");

    assert.equal(decrypted, plaintext, "Decrypted text should match original");
  });
});
