const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    gender: { type: String, default: "Not Specified" },
    pic: {
      type: String,
      default:
        "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg",
    },
    isAdmin: { type: Boolean, default: false }, // Useful for system-wide admin
    about: { type: String, default: "Hey there! I am using Chatify." },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    lastUsernameChange: { type: Date },
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    fcmToken: { type: String }, // For Push Notifications
    privacy: {
      searchByUsername: { type: Boolean, default: true },
      searchByMobile: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

// 1. Encrypt password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// 2. Method to verify password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
module.exports = User;
