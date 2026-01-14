const {
  registerUser,
  authUser,
  allUsers,
  getMe,
  updateUserProfile,
  updateFcmToken,
  checkUsernameAvailability,
  deleteUser,
  changeMobile,
} = require("../controllers/userController");
const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/check-username", checkUsernameAvailability);
router.route("/").post(registerUser).get(protect, allUsers);
router.post("/login", authUser);
router.get("/me", protect, getMe);
router.put("/profile", protect, updateUserProfile);
router.put("/fcm-token", protect, updateFcmToken);
router.put("/fcm-token", protect, updateFcmToken);
router.put("/change-mobile", protect, changeMobile);
router.delete("/delete", protect, deleteUser);

module.exports = router;
