const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const router = express.Router();

// 1. Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Configure Storage Engine
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "chatify_uploads", // Folder name in Cloudinary Dashboard
    allowed_formats: ["jpg", "png", "jpeg", "mp4", "mov", "avi", "mkv"],
    resource_type: "auto",
  },
});

const upload = multer({ storage: storage });

// 3. Upload Route
// Frontend sends file with key "file"
router.post("/", upload.single("file"), (req, res) => {
  try {
    // Multer + Cloudinary middleware automatically uploads the file
    // and attaches the result to req.file
    res.json({
      url: req.file.path,
      type: req.file.mimetype.startsWith("video") ? "video" : "image",
    });
  } catch (error) {
    res.status(500).json({ error: "Upload failed" });
  }
});

module.exports = router;
