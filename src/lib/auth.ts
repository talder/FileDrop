import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { readJsonConfig, writeJsonConfig } from "./config";
import type { User, Session, SanitizedUser } from "./types";

const USERS_FILE = "users.json";
const SESSIONS_FILE = "sessions.json";
const COOKIE_NAME = "filedrop-session";
const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

// --- Password ---

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  storedHash: string
): Promise<boolean> {
  return bcrypt.compare(plain, storedHash);
}

// --- Users ---

export async function getUsers(): Promise<User[]> {
  return readJsonConfig<User[]>(USERS_FILE, []);
}

export async function writeUsers(users: User[]): Promise<void> {
  await writeJsonConfig(USERS_FILE, users);
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
}

export async function hasUsers(): Promise<boolean> {
  const users = await getUsers();
  return Array.isArray(users) && users.length > 0;
}

export function sanitizeUser(user: User): SanitizedUser {
  const { passwordHash, ...safe } = user;
  return safe;
}

// --- Sessions ---

async function getSessions(): Promise<Record<string, Session>> {
  return readJsonConfig<Record<string, Session>>(SESSIONS_FILE, {});
}

async function writeSessions(sessions: Record<string, Session>): Promise<void> {
  await writeJsonConfig(SESSIONS_FILE, sessions);
}

export async function createSession(username: string): Promise<string> {
  const sessionId = randomUUID();
  const sessions = await getSessions();
  const now = new Date();
  sessions[sessionId] = {
    username,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    lastActivityAt: now.toISOString(),
  };
  await writeSessions(sessions);
  return sessionId;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sessions = await getSessions();
  delete sessions[sessionId];
  await writeSessions(sessions);
}

export async function getSessionUser(sessionId: string): Promise<User | null> {
  const sessions = await getSessions();
  const session = sessions[sessionId];
  if (!session) return null;

  const now = new Date();

  if (session.expiresAt && new Date(session.expiresAt) < now) {
    delete sessions[sessionId];
    await writeSessions(sessions);
    return null;
  }

  if (session.lastActivityAt) {
    const lastActivity = new Date(session.lastActivityAt);
    if (now.getTime() - lastActivity.getTime() > IDLE_TIMEOUT_MS) {
      delete sessions[sessionId];
      await writeSessions(sessions);
      return null;
    }
  }

  session.lastActivityAt = now.toISOString();
  await writeSessions(sessions);

  return getUserByUsername(session.username);
}

// --- Current user ---

export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);
    if (sessionCookie?.value) return getSessionUser(sessionCookie.value);
    return null;
  } catch {
    return null;
  }
}

export async function getCurrentSanitizedUser(): Promise<SanitizedUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return sanitizeUser(user);
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

export function useSecureCookies(request: Request): boolean {
  if (process.env.SECURE_COOKIES === "false") return false;
  if (process.env.SECURE_COOKIES === "true") return true;
  if (process.env.NODE_ENV !== "production") return false;
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  try { return new URL(request.url).protocol === "https:"; } catch { return true; }
}

const MAX_FAILED_ATTEMPTS = 5;

export { MAX_FAILED_ATTEMPTS };
