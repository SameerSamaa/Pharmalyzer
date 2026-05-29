import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { sendEmail, buildResetEmail } from "../lib/email";

const router: IRouter = Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function appBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}`;
  return "http://localhost:5000";
}

const emailSchema = z.string().email("Please enter a valid email address");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
    "Password must contain at least one special character"
  );

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
});

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

// POST /api/auth/signup
router.post("/auth/signup", async (req, res): Promise<void> => {
  const result = signupSchema.safeParse(req.body);
  if (!result.success) {
    const firstError = result.error.issues[0]?.message ?? "Invalid input";
    res.status(400).json({ error: firstError });
    return;
  }

  const { email, password } = result.data;

  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({ email: email.toLowerCase(), passwordHash })
      .returning({ id: usersTable.id, email: usersTable.email });

    req.session.userId = user.id;
    res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    req.log.error({ err }, "Signup error");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { email, password } = result.data;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/auth/forgot-password
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const email = result.data.email.toLowerCase();
  // Always respond success to avoid revealing whether an account exists.
  const genericResponse = {
    ok: true,
    message: "If an account exists for that email, a reset link has been sent.",
  };

  try {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user) {
      res.json(genericResponse);
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await db.insert(passwordResetTokensTable).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
    });

    const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
    const { subject, html, text } = buildResetEmail(resetUrl);
    try {
      await sendEmail({ to: user.email, subject, html, text });
      req.log.info({ userId: user.id }, "Password reset email sent");
    } catch (sendErr) {
      // Don't leak account existence via a differential error response —
      // log the failure internally but still return the generic success.
      req.log.error({ err: sendErr, userId: user.id }, "Password reset email send failed");
    }

    res.json(genericResponse);
  } catch (err) {
    req.log.error({ err }, "Forgot password error");
    // Generic success here too, so failures don't reveal whether the email exists.
    res.json(genericResponse);
  }
});

// POST /api/auth/reset-password
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { token, password } = result.data;

  try {
    const tokenHash = hashToken(token);
    const now = new Date();

    // Atomically claim the token: only one concurrent request can flip usedAt
    // from null while it's still valid. The RETURNING row proves we won the race.
    const [claimed] = await db
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, now)
        )
      )
      .returning();

    if (!claimed) {
      res.status(400).json({ error: "This reset link is invalid or has expired." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, claimed.userId));

    // Invalidate any other outstanding reset tokens for this user so older
    // links can't be used after a successful reset.
    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokensTable.userId, claimed.userId),
          isNull(passwordResetTokensTable.usedAt)
        )
      );

    req.log.info({ userId: claimed.userId }, "Password reset completed");
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Reset password error");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/auth/logout
router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);

    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    res.json({ id: user.id, email: user.email });
  } catch (err) {
    req.log.error({ err }, "Auth/me error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
