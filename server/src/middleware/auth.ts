
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { roles, type UserRole } from "../models/User.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: UserRole;
  };
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to a random secret of at least 32 characters");
  }
  return secret;
}

export function signToken(userId: string, role: UserRole): string {
  return jwt.sign({ role }, getJwtSecret(), {
    subject: userId,
    expiresIn: "1h",
    issuer: "publishflow-api",
    audience: "publishflow-client"
  });
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      issuer: "publishflow-api",
      audience: "publishflow-client"
    });

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string" ||
      !roles.includes(payload.role as UserRole)
    ) {
      res.status(401).json({ error: "Invalid authentication token" });
      return;
    }

    req.user = {
      userId: payload.sub,
      role: payload.role as UserRole
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}
