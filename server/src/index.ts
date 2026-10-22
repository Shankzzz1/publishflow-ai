
import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import mongoose, { Types, type FilterQuery } from "mongoose";
import { z } from "zod";

import { Manuscript, statuses } from "./models/Manuscript.js";
import type { ManuscriptStatus } from "./models/Manuscript.js";
import { User } from "./models/User.js";
import { authenticate, authorize } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";

const app = express();
const PORT = Number(process.env.PORT ?? 5000);

app.use(
  cors({
    origin: process.env.CLIENT_URL ?? "http://localhost:5173",
  })
);
app.use(express.json({ limit: "1mb" }));

type UserRole = "AUTHOR" | "OPERATIONS" | "ADMIN";

type AuthenticatedRequest = Request & {
  user?: {
    userId: string;
    role: UserRole;
  };
};

function currentUser(req: Request) {
  const user = (req as AuthenticatedRequest).user;

  if (!user) {
    throw new Error("Authenticated user missing from request");
  }

  return user;
}

function manuscriptScope(
  userId: string,
  role: UserRole
): FilterQuery<typeof Manuscript> {
  if (role === "ADMIN" || role === "OPERATIONS") {
    return {};
  }

  return {
    authorId: new Types.ObjectId(userId),
  };
}

function isStaff(role: UserRole) {
  return role === "ADMIN" || role === "OPERATIONS";
}

const createManuscriptSchema = z.object({
  title: z.string().trim().min(1).max(200),
  authorName: z.string().trim().max(120).optional(),
  genre: z.string().trim().max(80).default("Fiction"),
  content: z.string().max(100000).default(""),
});

const reviewSchema = z.object({
  comment: z.string().trim().min(1).max(5000),
  decision: z.enum(["CHANGES_REQUESTED", "APPROVED"]),
});

const revisionSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    genre: z.string().trim().max(80).optional(),
    content: z.string().max(100000).optional(),
    submissionNote: z.string().trim().max(5000).optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.genre !== undefined ||
      data.content !== undefined,
    {
      message: "Provide at least one field to update",
    }
  );

const transitions: Record<
  ManuscriptStatus,
  readonly ManuscriptStatus[]
> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["CHANGES_REQUESTED", "APPROVED"],
  CHANGES_REQUESTED: ["UNDER_REVIEW"],
  APPROVED: ["IN_PRODUCTION"],
  IN_PRODUCTION: ["QUALITY_CHECK"],
  QUALITY_CHECK: ["IN_PRODUCTION", "PUBLISHED"],
  PUBLISHED: [],
};

function isValidTransition(
  from: ManuscriptStatus,
  to: ManuscriptStatus
) {
  return transitions[from].includes(to);
}

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "publishflow-api",
  });
});

// Authentication routes
app.use("/api/v1/auth", authRoutes);

// All dashboard and manuscript routes require authentication.
app.use("/api/v1/dashboard", authenticate);
app.use("/api/v1/manuscripts", authenticate);

// Dashboard statistics
app.get("/api/v1/dashboard/stats", async (req, res, next) => {
  try {
    const user = currentUser(req);

    const scope = manuscriptScope(user.userId, user.role);

    const [total, submitted, underReview, changesRequested, approved, published] =
      await Promise.all([
        Manuscript.countDocuments(scope),
        Manuscript.countDocuments({
          ...scope,
          status: "SUBMITTED",
        }),
        Manuscript.countDocuments({
          ...scope,
          status: "UNDER_REVIEW",
        }),
        Manuscript.countDocuments({
          ...scope,
          status: "CHANGES_REQUESTED",
        }),
        Manuscript.countDocuments({
          ...scope,
          status: "APPROVED",
        }),
        Manuscript.countDocuments({
          ...scope,
          status: "PUBLISHED",
        }),
      ]);

    res.json({
      stats: {
        total,
        submitted,
        underReview,
        changesRequested,
        approved,
        published,
      },
    });
  } catch (error) {
    next(error);
  }
});

// List manuscripts with optional search and status filtering
app.get("/api/v1/manuscripts", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const scope = manuscriptScope(user.userId, user.role);

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";

    const status =
      typeof req.query.status === "string"
        ? req.query.status
        : undefined;

    if (status && !statuses.includes(status as ManuscriptStatus)) {
      res.status(400).json({ error: "Invalid manuscript status" });
      return;
    }

    const filter: FilterQuery<typeof Manuscript> = {
      ...scope,
    };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { authorName: { $regex: search, $options: "i" } },
        { genre: { $regex: search, $options: "i" } },
      ];
    }

    const manuscripts = await Manuscript.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      manuscripts: manuscripts.map((manuscript) => ({
        ...manuscript,
        id: manuscript._id.toString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Get a single manuscript.
// Authors can only access their own manuscripts; staff can access all.
app.get("/api/v1/manuscripts/:id", async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ error: "Invalid manuscript ID" });
    return;
  }

  try {
    const user = currentUser(req);

    const manuscript = await Manuscript.findOne({
      _id: req.params.id,
      ...manuscriptScope(user.userId, user.role),
    }).lean();

    if (!manuscript) {
      res.status(404).json({ error: "Manuscript not found" });
      return;
    }

    res.json({
      manuscript: {
        ...manuscript,
        id: manuscript._id.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create a manuscript.
// The author's identity comes from the authenticated account.
app.post("/api/v1/manuscripts", async (req, res, next) => {
  try {
    const parsed = createManuscriptSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid manuscript data",
        details: parsed.error.flatten(),
      });
      return;
    }

    const user = currentUser(req);

    const account = await User.findById(user.userId);

    if (!account) {
      res.status(401).json({ error: "User account not found" });
      return;
    }

    const authorName =
      user.role === "AUTHOR"
        ? account.name
        : parsed.data.authorName?.trim() || account.name;

    const now = new Date();

    const manuscript = await Manuscript.create({
      title: parsed.data.title,
      authorName,
      authorId: user.role === "AUTHOR" ? account._id : null,
      genre: parsed.data.genre,
      content: parsed.data.content,
      status: "SUBMITTED",
      history: [
        {
          toStatus: "SUBMITTED",
          changedBy: user.userId,
          createdAt: now,
        },
      ],
      revisions: [
        {
          version: 1,
          title: parsed.data.title,
          genre: parsed.data.genre,
          content: parsed.data.content,
          submissionNote: "Initial submission",
          submittedBy: user.userId,
          submittedAt: now,
        },
      ],
    });

    res.status(201).json({ manuscript });
  } catch (error) {
    next(error);
  }
});

// Staff reviews a manuscript and either requests changes or approves it.
app.post(
  "/api/v1/manuscripts/:id/reviews",
  authorize("OPERATIONS", "ADMIN"),
  async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ error: "Invalid manuscript ID" });
      return;
    }

    const parsed = reviewSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid review data",
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const user = currentUser(req);

      const manuscript = await Manuscript.findById(req.params.id);

      if (!manuscript) {
        res.status(404).json({ error: "Manuscript not found" });
        return;
      }

      if (manuscript.status !== "UNDER_REVIEW") {
        res.status(409).json({
          error: "Only manuscripts under review can receive a decision",
        });
        return;
      }

      const decision = parsed.data.decision;

      if (!isValidTransition(manuscript.status, decision)) {
        res.status(400).json({
          error: `Invalid transition from ${manuscript.status} to ${decision}`,
        });
        return;
      }

      const previousStatus = manuscript.status;
      const now = new Date();

      manuscript.reviewComments.push({
        comment: parsed.data.comment,
        createdBy: user.userId,
        createdAt: now,
      });

      manuscript.history.push({
        fromStatus: previousStatus,
        toStatus: decision,
        changedBy: user.userId,
        createdAt: now,
      });

      manuscript.status = decision;

      await manuscript.save();

      res.json({ manuscript });
    } catch (error) {
      next(error);
    }
  }
);

// An author submits a revised version after changes are requested.
app.post(
  "/api/v1/manuscripts/:id/revisions",
  authorize("AUTHOR"),
  async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ error: "Invalid manuscript ID" });
      return;
    }

    const parsed = revisionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid revision data",
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const user = currentUser(req);

      // The author can only revise a manuscript they own.
      const manuscript = await Manuscript.findOne({
        _id: req.params.id,
        authorId: new Types.ObjectId(user.userId),
      });

      if (!manuscript) {
        res.status(404).json({ error: "Manuscript not found" });
        return;
      }

      if (manuscript.status !== "CHANGES_REQUESTED") {
        res.status(409).json({
          error: "Revisions are only allowed when changes have been requested",
        });
        return;
      }

      const previousStatus = manuscript.status;
      const now = new Date();

      // Apply supplied changes while preserving omitted fields.
      if (parsed.data.title !== undefined) {
        manuscript.title = parsed.data.title;
      }

      if (parsed.data.genre !== undefined) {
        manuscript.genre = parsed.data.genre;
      }

      if (parsed.data.content !== undefined) {
        manuscript.content = parsed.data.content;
      }

      // Use the highest existing version to avoid duplicate version numbers.
      const version =
        manuscript.revisions.reduce(
          (highest, revision) => Math.max(highest, revision.version),
          0
        ) + 1;

      manuscript.revisions.push({
        version,
        title: manuscript.title,
        genre: manuscript.genre,
        content: manuscript.content,
        submissionNote: parsed.data.submissionNote ?? "",
        submittedBy: user.userId,
        submittedAt: now,
      });

      manuscript.status = "UNDER_REVIEW";

      manuscript.history.push({
        fromStatus: previousStatus,
        toStatus: "UNDER_REVIEW",
        changedBy: user.userId,
        createdAt: now,
      });

      await manuscript.save();

      res.json({ manuscript });
    } catch (error) {
      next(error);
    }
  }
);

// General status updates are staff-only.
// Review decisions must use the dedicated /reviews endpoint.
app.patch(
  "/api/v1/manuscripts/:id/status",
  authorize("OPERATIONS", "ADMIN"),
  async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ error: "Invalid manuscript ID" });
      return;
    }

    const bodySchema = z.object({
      status: z.enum(statuses),
    });

    const parsed = bodySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid status",
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const user = currentUser(req);

      const manuscript = await Manuscript.findById(req.params.id);

      if (!manuscript) {
        res.status(404).json({ error: "Manuscript not found" });
        return;
      }

      const nextStatus = parsed.data.status;
      const previousStatus = manuscript.status;

      if (
        previousStatus === "UNDER_REVIEW" &&
        (nextStatus === "CHANGES_REQUESTED" ||
          nextStatus === "APPROVED")
      ) {
        res.status(400).json({
          error: "Use the reviews endpoint to request changes or approve a manuscript",
        });
        return;
      }

      if (!isValidTransition(previousStatus, nextStatus)) {
        res.status(400).json({
          error: `Invalid transition from ${previousStatus} to ${nextStatus}`,
        });
        return;
      }

      manuscript.status = nextStatus;
      manuscript.history.push({
        fromStatus: previousStatus,
        toStatus: nextStatus,
        changedBy: user.userId,
        createdAt: new Date(),
      });

      await manuscript.save();

      res.json({ manuscript });
    } catch (error) {
      next(error);
    }
  }
);

// Not found
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Central error handler
app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(error);

    if (error instanceof mongoose.Error.VersionError) {
      res.status(409).json({
        error: "This manuscript was updated by another request. Refresh and try again.",
      });
      return;
    }

    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({
        error: "Database validation failed",
        details: error.message,
      });
      return;
    }

    if (error instanceof mongoose.Error.CastError) {
      res.status(400).json({ error: "Invalid data format" });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
);

async function startServer() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing from the environment");
  }

  await mongoose.connect(mongoUri);

  const server = app.listen(PORT, () => {
    console.log(`PublishFlow API running at http://localhost:${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received. Shutting down...`);

    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

startServer().catch((error) => {
  console.error("Failed to start PublishFlow API:", error);
  process.exit(1);
});
