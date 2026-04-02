"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.needsSetup) router.replace("/");
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, fullName }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Setup failed");
        return;
      }

      router.push("/login");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-alt">
      <div className="w-full max-w-sm">
        <div className="bg-surface rounded-xl shadow-lg p-8 border border-border">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-[var(--color-accent-light)] text-accent flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-text-primary">Welcome to FileDrop</h1>
            <p className="text-sm text-text-muted mt-1">Create your admin account to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="input-label">Full Name</label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Admin User"
              />
            </div>
            <div>
              <label className="input-label">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
              />
            </div>
            <div>
              <label className="input-label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
              />
            </div>
            <div>
              <label className="input-label">Confirm Password</label>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading}>
              {loading ? "Creating..." : "Create Admin Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
