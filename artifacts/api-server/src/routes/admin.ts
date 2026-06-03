import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  verifyAdminPassword,
  createAdminToken,
  createUserToken,
  validateToken,
  generateUserId,
  generatePassword,
  hashPassword,
  verifyPassword,
  changeAdminPassword,
} from "../lib/auth";
import { getSystemStats, clearAllBuffers } from "../lib/tickStream";
import { recordTrade, getCommissionStats, clearCommissionStore } from "../lib/commission-store";

const router: IRouter = Router();

// ── In-memory session store: user_id → token ──────────────────────────────
// Tracks ONE active session per user. Admin logins are exempt.
const activeSessions = new Map<string, string>();

// ── Helper to evict expired sessions periodically ─────────────────────────
setInterval(() => {
  for (const [uid, tok] of activeSessions) {
    const s = validateToken(tok);
    if (!s) activeSessions.delete(uid);
  }
}, 60 * 1000);

// Admin login
router.post("/admin/login", async (req, res): Promise<void> => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: "password required" });
    return;
  }
  if (!verifyAdminPassword(password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = createAdminToken();
  res.json({ token, role: "admin" });
});

// User login
router.post("/user/login", async (req, res): Promise<void> => {
  const { user_id, password } = req.body as { user_id?: string; password?: string };
  if (!user_id || !password) {
    res.status(400).json({ error: "user_id and password required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.user_id, user_id));

    if (!user || !user.active) {
      res.status(401).json({ error: "Invalid credentials or account revoked" });
      return;
    }

    if (!verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Block duplicate logins — one active session per user_id
    const existingToken = activeSessions.get(user_id);
    if (existingToken) {
      const existing = validateToken(existingToken);
      if (existing) {
        res.status(409).json({ error: "Account already logged in from another device. Log out there first, or wait 24 hours for the session to expire." });
        return;
      }
      // Token expired — clean it up
      activeSessions.delete(user_id);
    }

    const token = createUserToken(user.id);
    activeSessions.set(user_id, token);
    res.json({ token, user_id: user.user_id, username: user.username });
  } catch (err) {
    req.log.error({ err }, "user login error");
    res.status(500).json({ error: "Login failed" });
  }
});

// User logout — clears the session so they can log in from another device
router.post("/user/logout", (req, res): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");
  if (token) {
    const session = validateToken(token);
    if (session) {
      // Find the user_id associated with this token and remove
      for (const [uid, tok] of activeSessions) {
        if (tok === token) { activeSessions.delete(uid); break; }
      }
    }
  }
  res.json({ ok: true });
});

// Admin can force-logout a specific user_id (kicks them out immediately)
router.delete("/admin/sessions/:user_id", requireAdmin, (req, res): void => {
  const uid = Array.isArray(req.params.user_id) ? req.params.user_id[0] : req.params.user_id;
  activeSessions.delete(uid);
  res.json({ ok: true, message: `Session for ${uid} cleared` });
});

// Admin — view all active sessions
router.get("/admin/sessions", requireAdmin, (_req, res): void => {
  const list = Array.from(activeSessions.entries()).map(([uid, tok]) => {
    const s = validateToken(tok);
    return { user_id: uid, valid: !!s };
  });
  res.json({ active_sessions: list, count: list.length });
});

// Middleware to check admin token
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const session = validateToken(token);
  if (!session || session.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// Change admin PIN
router.patch("/admin/pin", requireAdmin, async (req, res): Promise<void> => {
  const { new_pin } = req.body as { new_pin?: string };
  if (!new_pin || new_pin.trim().length < 4) {
    res.status(400).json({ error: "new_pin must be at least 4 characters" });
    return;
  }
  changeAdminPassword(new_pin.trim());
  res.json({ message: "PIN updated successfully" });
});

// Get all users
router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.created_at);
    res.json(
      users.map((u: typeof users[number]) => ({
        id: u.id,
        user_id: u.user_id,
        username: u.username,
        active: u.active,
        created_at: u.created_at.toISOString(),
        revoked_at: u.revoked_at ? u.revoked_at.toISOString() : null,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "get users error");
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Create user (generate user ID)
router.post("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const { username } = req.body as { username?: string };
  if (!username) {
    res.status(400).json({ error: "username required" });
    return;
  }

  try {
    const userId = generateUserId();
    const rawPassword = generatePassword();
    const passwordHash = hashPassword(rawPassword);

    const [user] = await db
      .insert(usersTable)
      .values({
        user_id: userId,
        username,
        password_hash: passwordHash,
        active: true,
      })
      .returning();

    res.status(201).json({
      id: user.id,
      user_id: user.user_id,
      username: user.username,
      active: user.active,
      created_at: user.created_at.toISOString(),
      revoked_at: null,
      // Include the raw password ONLY once at creation
      generated_password: rawPassword,
    });
  } catch (err) {
    req.log.error({ err }, "create user error");
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Delete user
router.delete("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  try {
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.sendStatus(204);
  } catch (err) {
    req.log.error({ err, id }, "delete user error");
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Revoke user
router.patch("/admin/users/:id/revoke", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  try {
    const [user] = await db
      .update(usersTable)
      .set({ active: false, revoked_at: new Date() })
      .where(eq(usersTable.id, id))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      user_id: user.user_id,
      username: user.username,
      active: user.active,
      created_at: user.created_at.toISOString(),
      revoked_at: user.revoked_at ? user.revoked_at.toISOString() : null,
    });
  } catch (err) {
    req.log.error({ err, id }, "revoke user error");
    res.status(500).json({ error: "Failed to revoke user" });
  }
});

// ─── System health & diagnostics ──────────────────────────────────────────────
router.get("/admin/system-health", requireAdmin, (_req, res): void => {
  res.json(getSystemStats());
});

// Manual buffer clear (also triggered automatically every 15 hours)
router.post("/admin/clear-cache", requireAdmin, (_req, res): void => {
  clearAllBuffers();
  res.json({ ok: true, message: "All in-memory buffers cleared. Streams will re-warm within seconds." });
});

// Test any internal API endpoint — returns status, latency, and key count
router.post("/admin/test-endpoint", requireAdmin, async (req, res): Promise<void> => {
  const { path: urlPath } = req.body as { path?: string };
  if (!urlPath) { res.status(400).json({ error: "path required" }); return; }
  const port = process.env.PORT ?? "8080";
  const full  = `http://localhost:${port}${urlPath.startsWith("/api") ? urlPath : `/api${urlPath}`}`;
  const start = Date.now();
  try {
    const r = await fetch(full, { signal: AbortSignal.timeout(8000) });
    const latency = Date.now() - start;
    let data: unknown;
    try { data = await r.json(); } catch { data = null; }
    const keys = data && typeof data === "object" ? Object.keys(data as object) : [];
    res.json({ ok: r.ok, status: r.status, latency_ms: latency, keys, url: full });
  } catch (err) {
    res.json({ ok: false, status: 0, latency_ms: Date.now() - start, error: String(err), url: full });
  }
});

// ── Commission analytics ───────────────────────────────────────────────────────

// POST /api/trade-event — unauthenticated beacon from frontend after each buy
router.post("/trade-event", (req, res): void => {
  const { symbol, contract_type, stake, buy_price, payout, markup_pct } = req.body as {
    symbol?: string; contract_type?: string; stake?: number;
    buy_price?: number; payout?: number; markup_pct?: number;
  };
  if (symbol && contract_type && buy_price) {
    recordTrade({
      symbol:        String(symbol),
      contract_type: String(contract_type),
      stake:         Number(stake) || 0,
      buy_price:     Number(buy_price),
      payout:        Number(payout) || 0,
      markup_pct:    Number(markup_pct) || 4,
    });
  }
  res.json({ ok: true });
});

// GET /api/admin/commissions — admin only, returns aggregated commission analytics
router.get("/admin/commissions", requireAdmin, (_req, res): void => {
  res.json(getCommissionStats());
});

// DELETE /api/admin/commissions — admin only, clears commission store
router.delete("/admin/commissions", requireAdmin, (_req, res): void => {
  clearCommissionStore();
  res.json({ ok: true, message: "Commission store cleared" });
});

// Quick connectivity test — tests Deriv public WS availability
router.get("/admin/diagnostics", requireAdmin, async (_req, res): Promise<void> => {
  const stats = getSystemStats();
  const port  = process.env.PORT ?? "8080";
  const base  = `http://localhost:${port}`;

  const testEndpoints = [
    { name: "Health Check",         path: "/api/health" },
    { name: "Active Symbols",       path: "/api/active-symbols" },
    { name: "Digit Analysis R_50",  path: "/api/digit-analysis?symbol=R_50&count=100" },
    { name: "Wide Eye R_50",        path: "/api/wide-eye-analysis?symbol=R_50&count=100" },
    { name: "Even/Odd R_50",        path: "/api/even-odd-analysis?symbol=R_50&count=100" },
    { name: "Match/Differ R_50",    path: "/api/match-differ-signals?symbol=R_50" },
    { name: "AI Signals R_50",      path: "/api/ai-signals?symbol=R_50" },
  ];

  const results = await Promise.allSettled(
    testEndpoints.map(async (ep) => {
      const start = Date.now();
      const r = await fetch(`${base}${ep.path}`, { signal: AbortSignal.timeout(6000) });
      return { name: ep.name, ok: r.ok, status: r.status, latency_ms: Date.now() - start };
    })
  );

  res.json({
    system: stats,
    endpoints: results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { name: testEndpoints[i].name, ok: false, status: 0, latency_ms: 0, error: String(r.reason) }
    ),
  });
});

export default router;
