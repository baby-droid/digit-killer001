import crypto from "crypto";

const ADMIN_PASSWORD = "AHMED2005";
const ADMIN_TOKEN = crypto.randomBytes(32).toString("hex");

// In-memory session store (tokens expire after 24h)
const sessionStore = new Map<string, { role: string; userId?: number; expiresAt: number }>();

export function verifyAdminPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export function createAdminToken(): string {
  const token = `admin_${crypto.randomBytes(24).toString("hex")}`;
  sessionStore.set(token, {
    role: "admin",
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  return token;
}

export function createUserToken(userId: number): string {
  const token = `user_${crypto.randomBytes(24).toString("hex")}`;
  sessionStore.set(token, {
    role: "user",
    userId,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  return token;
}

export function validateToken(token: string): { role: string; userId?: number } | null {
  const session = sessionStore.get(token);
  if (!session || Date.now() > session.expiresAt) {
    sessionStore.delete(token);
    return null;
  }
  return { role: session.role, userId: session.userId };
}

export function generateUserId(): string {
  return `DK${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export function generatePassword(): string {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "DIGIT_KILLER_SALT").digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

void ADMIN_TOKEN; // suppress unused warning
