import "dotenv/config";
import mongoose from "mongoose";
import { Manuscript } from "./models/Manuscript.js";

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing");
  await mongoose.connect(process.env.MONGODB_URI);
  if (await Manuscript.countDocuments() > 0) { console.log("Seed skipped: existing data found"); return; }
  const examples = [
    ["The Quiet Horizon", "Ananya Mehta", "Fiction", "SUBMITTED"],
    ["Small Habits, Big Change", "Rohan Desai", "Self-help", "UNDER_REVIEW"],
    ["Building with Intention", "Mira Shah", "Business", "IN_PRODUCTION"],
    ["A Map of Ordinary Days", "Kabir Rao", "Poetry", "PUBLISHED"],
    ["The Curious Blue Kite", "Neha Kulkarni", "Children's", "APPROVED"]
  ];
  await Manuscript.insertMany(examples.map(([title, authorName, genre, status]) => ({ title, authorName, genre, status, history: [{ toStatus: status, changedBy: "seed" }] })));
  console.log("Seeded five demo manuscripts");
}
main().catch(console.error).finally(() => mongoose.disconnect());
