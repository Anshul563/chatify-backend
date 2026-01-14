const asyncHandler = require("express-async-handler");
const Status = require("../models/Status");
const Chat = require("../models/Chat");
const Group = require("../models/Group");

// @desc    Create a new status
// @route   POST /api/status
// @access  Protected
const createStatus = asyncHandler(async (req, res) => {
  const { type, content, caption, color, groupId } = req.body;

  if (!content) {
    res.status(400);
    throw new Error("Content is required");
  }

  // Calculate 24h Expiry
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  let statusData = {
    user: req.user._id,
    type,
    content,
    caption,
    color,
    expiresAt,
  };

  if (groupId) {
    // 1. Verify Group Exists
    const group = await Group.findOne({ chatId: groupId }); // Note: Our group logic links via Chat ID usually, but let's check inputs
    // Actually, usually groupId passed from frontend might be the Chat ID or the Group Doc ID.
    // Let's assume it's the Chat ID (which wraps the group).

    // Find the Chat to check membership
    const chat = await Chat.findOne({ _id: groupId, isGroupChat: true });

    if (!chat) {
      res.status(404);
      throw new Error("Group not found");
    }

    // Find Group Details to check Admins
    const groupDetails = await Group.findById(chat.groupDetails);

    if (!groupDetails) {
      res.status(404);
      throw new Error("Group details not found");
    }

    // 2. Check Admin Permissions
    // ensure admins array contains user id
    const isAdmin = groupDetails.admins.some(
      (adminId) => adminId.toString() === req.user._id.toString()
    );

    if (!isAdmin) {
      res.status(403);
      throw new Error("Only admins can post status to this group");
    }

    // Link to Group
    statusData.group = groupDetails._id;
  }

  const status = await Status.create(statusData);
  const fullStatus = await Status.findById(status._id)
    .populate("user", "firstName lastName username pic")
    .populate("group", "name icon");

  res.status(201).json(fullStatus);
});

// @desc    Get all valid statuses (Friends + Groups)
// @route   GET /api/status
// @access  Protected
const getStatuses = asyncHandler(async (req, res) => {
  const myId = req.user._id;

  // 1. Find all Chats (DMs and Groups) the user is part of
  const chats = await Chat.find({
    users: { $elemMatch: { $eq: myId } },
  }).populate("latestMessage");

  // 2. Extract User IDs (Friends) and Group IDs
  let friendIds = [];
  let groupIds = [];

  chats.forEach((chat) => {
    if (chat.isGroupChat) {
      if (chat.groupDetails) groupIds.push(chat.groupDetails);
    } else {
      chat.users.forEach((u) => {
        if (u.toString() !== myId.toString()) {
          friendIds.push(u);
        }
      });
    }
  });

  // Always include self
  friendIds.push(myId);

  // 3. Query Statuses
  // Condition:
  // (User is in friendIds AND group is null)  --> Personal Statuses of friends/self
  // OR
  // (Group is in groupIds) --> Group Statuses
  const statuses = await Status.find({
    $or: [
      { user: { $in: friendIds }, group: null },
      { group: { $in: groupIds } },
    ],
    expiresAt: { $gt: new Date() }, // Still valid
  })
    .populate("user", "firstName lastName username pic")
    .populate("group", "name icon")
    .populate("viewers", "firstName lastName username pic")
    .sort({ createdAt: -1 });

  res.json(statuses);
});

// @desc    Mark status as viewed
// @route   PUT /api/status/:id/view
// @access  Protected
const viewStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const status = await Status.findById(id);

  if (!status) {
    res.status(404);
    throw new Error("Status not found");
  }

  // Check if already viewed
  if (!status.viewers.includes(req.user._id)) {
    status.viewers.push(req.user._id);
    await status.save();
  }

  res.json({ message: "Viewed" });
});

// @desc    Toggle Like on Status
// @route   PUT /api/status/:id/like
// @access  Protected
const toggleLike = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const status = await Status.findById(id);

  if (!status) {
    res.status(404);
    throw new Error("Status not found");
  }

  const isLiked = status.likes.includes(userId);

  if (isLiked) {
    // Un-like
    status.likes = status.likes.filter(
      (id) => id.toString() !== userId.toString()
    );
  } else {
    // Like
    status.likes.push(userId);
  }

  await status.save();

  res.json(status.likes); // Return updated likes array
});

module.exports = { createStatus, getStatuses, viewStatus, toggleLike };
