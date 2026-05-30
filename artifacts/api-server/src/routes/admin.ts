import { Router, type IRouter } from "express";
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
} from "../lib/auth";

const router: IRouter = Router();

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

    const token = createUserToken(user.id);
    res.json({ token, user_id: user.user_id, username: user.username });
  } catch (err) {
    req.log.error({ err }, "user login error");
    res.status(500).json({ error: "Login failed" });
  }
});

// Middleware to check admin token
function requireAdmin(req: Parameters<Parameters<typeof router.use>[0]>[0], res: Parameters<Parameters<typeof router.use>[0]>[1], next: Parameters<Parameters<typeof router.use>[0]>[2]): void {
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

// Get all users
router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.created_at);
    res.json(
      users.map((u) => ({
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

export default router;
