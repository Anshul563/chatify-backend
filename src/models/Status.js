const mongoose = require("mongoose");

const statusSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // If part of a group status (optional)
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
    type: {
      type: String,
      enum: ["text", "image", "video"],
      default: "image",
    },
    content: { type: String, required: true }, // Image URL or Text Content
    caption: { type: String, default: "" },
    color: { type: String, default: "#000000" }, // Background color for text status
    viewers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Explicit Expiry Date for Logic
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

// TTL Index: Automatically delete document 0 seconds after 'expiresAt' time
statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Status = mongoose.model("Status", statusSchema);
module.exports = Status;
