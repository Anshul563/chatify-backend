const asyncHandler = require("express-async-handler");
const Call = require("../models/Call");
const User = require("../models/User");

// @desc    Log a new call (or update existing if needed, but usually new)
// @route   POST /api/call
// @access  Protected
const logCall = asyncHandler(async (req, res) => {
  const { receiverId, type, status, duration } = req.body;

  if (!receiverId) {
    res.status(400);
    throw new Error("Receiver ID required");
  }

  var newCall = {
    caller: req.user._id,
    receiver: receiverId,
    type: type || "audio",
    status: status || "completed",
    duration: duration || 0,
    startTime: new Date(),
    endTime: new Date(), // Approximate for log
  };

  try {
    var call = await Call.create(newCall);
    call = await call.populate(
      "caller",
      "firstName lastName pic username mobile"
    );
    call = await call.populate(
      "receiver",
      "firstName lastName pic username mobile"
    );
    res.status(200).json(call);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Get Call History for user (incoming & outgoing)
// @route   GET /api/call
// @access  Protected
const getCallHistory = asyncHandler(async (req, res) => {
  try {
    const calls = await Call.find({
      $or: [{ caller: req.user._id }, { receiver: req.user._id }],
    })
      .populate("caller", "firstName lastName pic username mobile")
      .populate("receiver", "firstName lastName pic username mobile")
      .sort({ createdAt: -1 });

    res.status(200).send(calls);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

module.exports = { logCall, getCallHistory };
