const express = require("express");
const router = express.Router();
const systemController = require("../controllers/systemController");

router.get("/version", systemController.getAppVersion);

module.exports = router;
