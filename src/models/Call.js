const mongoose = require("mongoose");

const callSchema = mongoose.Schema(
  {
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: { type: String, enum: ["audio", "video"], default: "audio" },
    status: {
      type: String,
      enum: ["ongoing", "completed", "missed", "rejected"],
      default: "ongoing",
    },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    duration: { type: Number, default: 0 }, // in seconds
  },
  {
    timestamps: true,
  }
);

const Call = mongoose.model("Call", callSchema);
module.exports = Call;
