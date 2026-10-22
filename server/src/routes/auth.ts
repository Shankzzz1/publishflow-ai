
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User, roles } from "../models/User.js";
import { authenticate, signToken, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(72)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72)
});

router.post("/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid registration details",
      details: parsed.error.flatten()
    });
    return;
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const existing = await User.exists({ email });

    if (existing) {
      res.status(409).json({ error: "Unable to register with that email" });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    // Public registration always creates an AUTHOR.
    const user = await User.create({
      name: parsed.data.name,
      email,
      passwordHash,
      role: "AUTHOR"
    });

    res.status(201).json({
      message: "Registration successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    // Handles concurrent registration attempts for the same email.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({ error: "Unable to register with that email" });
      return;
    }
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email or password" });
    return;
  }

  try {
    const user = await User.findOne({
      email: parsed.data.email.toLowerCase()
    }).select("+passwordHash");

    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = signToken(user.id, user.role);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await User.findById(authReq.user!.userId);

    if (!user) {
      res.status(401).json({ error: "User no longer exists" });
      return;
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
