const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  updateGroupSettings,
  makeGroupAdmin,
  removeGroupAdmin,
  removeFromGroup,
  deleteGroup,
  toggleMute,
  toggleSharePhone,
  blockUser,
  joinGroup,
  handleJoinRequest,
  toggleArchive,
  deleteUserChat,
} = require("../controllers/chatController");

const router = express.Router();

// All routes are protected
router.route("/").post(protect, accessChat);
router.route("/").get(protect, fetchChats);
router.route("/group").post(protect, createGroupChat);
router.route("/rename").put(protect, renameGroup);
router.route("/groupadd").put(protect, addToGroup);
router.route("/group/settings").put(protect, updateGroupSettings);
router.route("/group/make-admin").put(protect, makeGroupAdmin);
router.route("/group/remove-admin").put(protect, removeGroupAdmin);
router.route("/group/remove").put(protect, removeFromGroup);
router.route("/group/:chatId").delete(protect, deleteGroup);

router.route("/mute").put(protect, toggleMute);
router.route("/share-phone").put(protect, toggleSharePhone);
router.route("/block").put(protect, blockUser);
router.route("/join").put(protect, joinGroup);
router.route("/join-request").put(protect, handleJoinRequest);

router.route("/archive").put(protect, toggleArchive);
router.route("/delete").put(protect, deleteUserChat);

module.exports = router;
