
import mongoose, { Schema } from "mongoose";

export const statuses = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "PUBLISHED",
] as const;

export type ManuscriptStatus = (typeof statuses)[number];

const statusHistorySchema = new Schema(
  {
    fromStatus: { type: String, enum: statuses, default: undefined },
    toStatus: { type: String, enum: statuses, required: true },
    changedBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { _id: true }
);

const reviewCommentSchema = new Schema(
  {
    comment: { type: String, required: true, trim: true, maxlength: 5000 },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { _id: true }
);

const revisionSchema = new Schema(
  {
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    genre: { type: String, default: "Fiction", maxlength: 80 },
    content: { type: String, default: "", maxlength: 100000 },
    submissionNote: { type: String, default: "", trim: true, maxlength: 5000 },
    submittedBy: { type: String, required: true },
    submittedAt: { type: Date, default: Date.now, required: true },
  },
  { _id: true }
);

const manuscriptSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    authorName: { type: String, required: true, trim: true, maxlength: 120 },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    genre: { type: String, default: "Fiction", maxlength: 80 },
    content: { type: String, default: "", maxlength: 100000 },
    status: {
      type: String,
      enum: statuses,
      default: "SUBMITTED",
      required: true,
    },
    history: { type: [statusHistorySchema], default: [] },
    reviewComments: { type: [reviewCommentSchema], default: [] },
    revisions: { type: [revisionSchema], default: [] },
  },
  {
    timestamps: true,
    versionKey: "__v",
    optimisticConcurrency: true,
  }
);

manuscriptSchema.index({ status: 1, createdAt: -1 });
manuscriptSchema.index({ authorId: 1, createdAt: -1 });

export const Manuscript = mongoose.model("Manuscript", manuscriptSchema);
