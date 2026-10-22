
import "dotenv/config";
import mongoose from "mongoose";
import { User, roles, type UserRole } from "./models/User.js";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("This development utility cannot run in production.");
  }

  const email = process.env.PROMOTE_EMAIL?.trim().toLowerCase();
  const role = process.env.PROMOTE_ROLE?.trim();

  if (!email || !role || !roles.includes(role as UserRole)) {
    throw new Error(
      "Set PROMOTE_EMAIL and PROMOTE_ROLE. " +
      "PROMOTE_ROLE must be OPERATIONS or ADMIN."
    );
  }

  if (role === "AUTHOR") {
    throw new Error("This utility is only for promoting staff accounts.");
  }

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing from the environment.");
  }

  await mongoose.connect(mongoUri);

  try {
    const user = await User.findOne({ email });

    if (!user) {
      throw new Error(
        `No account found for ${email}. Register that account first.`
      );
    }

    user.role = role as UserRole;
    await user.save();

    console.log(`Updated ${user.email} to role ${user.role}.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Promotion failed."
  );
  process.exitCode = 1;
});
