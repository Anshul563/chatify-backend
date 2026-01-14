const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  allMessages,
  sendMessage,
  reactToMessage,
  deleteMessage,
} = require("../controllers/messageController");

const router = express.Router();

router.route("/:chatId").get(protect, allMessages);
router.route("/").post(protect, sendMessage);
router.route("/react/:id").put(protect, reactToMessage);
router.route("/delete/:id").put(protect, deleteMessage);

module.exports = router;
