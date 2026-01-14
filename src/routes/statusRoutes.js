const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createStatus,
  getStatuses,
  viewStatus,
  toggleLike,
} = require("../controllers/statusController");

const router = express.Router();

router.route("/").post(protect, createStatus).get(protect, getStatuses);
router.route("/:id/view").put(protect, viewStatus);
router.route("/:id/like").put(protect, toggleLike);

module.exports = router;
