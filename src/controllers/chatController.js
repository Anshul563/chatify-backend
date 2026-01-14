const asyncHandler = require("express-async-handler");
const Chat = require("../models/Chat");
const User = require("../models/User");
const Group = require("../models/Group");

// @desc    Create or fetch One-to-One Chat
// @route   POST /api/chat
// @access  Protected
const accessChat = asyncHandler(async (req, res) => {
  const { userId, foundByMobile } = req.body;

  if (!userId) {
    console.log("UserId param not sent with request");
    return res.sendStatus(400);
  }

  // 1. Check if chat exists
  var isChat = await Chat.find({
    isGroupChat: false,
    $and: [
      { users: { $elemMatch: { $eq: req.user._id } } },
      { users: { $elemMatch: { $eq: userId } } },
    ],
  })
    .populate("users", "-password")
    .populate("latestMessage");

  isChat = await User.populate(isChat, {
    path: "latestMessage.sender",
    select: "firstName lastName email pic",
  });

  if (isChat.length > 0) {
    // Chat exists. check foundByMobile logic
    let chat = isChat[0];
    if (foundByMobile) {
      // If found by mobile, ensure target user's phone is shared (since we know it)
      // Add userId (Target) to sharedPhoneNumbers if not present
      if (!chat.sharedPhoneNumbers.includes(userId)) {
        chat = await Chat.findByIdAndUpdate(
          chat._id,
          {
            $addToSet: { sharedPhoneNumbers: userId },
          },
          { new: true }
        )
          .populate("users", "-password")
          .populate("latestMessage");
      }

      // AUTO-RESTORE: If deleted by user, remove from deletedBy
      if (chat.deletedBy && chat.deletedBy.includes(req.user._id)) {
        await Chat.findByIdAndUpdate(chat._id, {
          $pull: { deletedBy: req.user._id },
        });
      }
    }
    res.send(chat);
  } else {
    // 2. Create Chat
    var chatData = {
      chatName: "sender",
      isGroupChat: false,
      users: [req.user._id, userId],
      sharedPhoneNumbers: foundByMobile ? [userId] : [], // If found by mobile, share target's phone
    };

    try {
      const createdChat = await Chat.create(chatData);
      const FullChat = await Chat.findOne({ _id: createdChat._id }).populate(
        "users",
        "-password"
      );
      res.status(200).json(FullChat);
    } catch (error) {
      res.status(400);
      throw new Error(error.message);
    }
  }
});

// @desc    Fetch all chats for a user
// @route   GET /api/chat
// @access  Protected
const fetchChats = asyncHandler(async (req, res) => {
  try {
    Chat.find({
      users: { $elemMatch: { $eq: req.user._id } },
      deletedBy: { $ne: req.user._id }, // Exclude chats deleted by this user
    })
      .populate("users", "-password")
      .populate({
        path: "groupDetails",
        populate: { path: "admins", select: "-password" },
      })
      .populate("latestMessage")
      .sort({ updatedAt: -1 }) // Sort by Newest first
      .then(async (results) => {
        results = await User.populate(results, {
          path: "latestMessage.sender",
          select: "name pic email",
        });
        res.status(200).send(results);
      });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Create New Group Chat
// @route   POST /api/chat/group
// @access  Protected
const createGroupChat = asyncHandler(async (req, res) => {
  if (!req.body.users || !req.body.name) {
    return res.status(400).send({ message: "Please Fill all the fields" });
  }

  // Parse stringified JSON array from frontend
  var users = JSON.parse(req.body.users);

  if (users.length < 1) {
    return res
      .status(400)
      .send("More than 2 users are required to form a group chat");
  }

  users.push(req.user); // Add current user (admin) to the list

  try {
    const groupChat = await Chat.create({
      chatName: req.body.name,
      users: users,
      isGroupChat: true,
    });

    const groupDetails = await Group.create({
      chatId: groupChat._id,
      name: req.body.name,
      admins: [req.user._id],
      settings: {
        isPrivate: req.body.isPrivate || false,
      },
    });

    const fullGroupChat = await Chat.findByIdAndUpdate(
      groupChat._id,
      { groupDetails: groupDetails._id },
      { new: true }
    )
      .populate("users", "-password")
      .populate({
        path: "groupDetails",
        populate: { path: "admins", select: "-password" },
      });

    res.status(200).json(fullGroupChat);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Rename Group
// @route   PUT /api/chat/rename
// @access  Protected
const renameGroup = asyncHandler(async (req, res) => {
  const { chatId, chatName } = req.body;

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { chatName: chatName },
    { new: true }
  )
    .populate("users", "-password")
    .populate({
      path: "groupDetails",
      populate: { path: "admins", select: "-password" },
    });

  // Also update Group model
  if (updatedChat && updatedChat.groupDetails) {
    await Group.findByIdAndUpdate(
      updatedChat.groupDetails._id || updatedChat.groupDetails,
      { name: chatName }
    );
  }

  if (!updatedChat) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
    res.json(updatedChat);
  }
});

// @desc    Add user to Group
// @route   PUT /api/chat/groupadd
// @access  Protected (Admin only logic can be added here)
const addToGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  const added = await Chat.findByIdAndUpdate(
    chatId,
    { $push: { users: userId } },
    { new: true }
  )
    .populate("users", "-password")
    .populate({
      path: "groupDetails",
      populate: { path: "admins", select: "-password" },
    });

  if (!added) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
    res.json(added);
  }
});

const Message = require("../models/Message");

// Helper to create system message
const createSystemMessage = async (chatId, content) => {
  try {
    await Message.create({
      sender: null, // System message has no sender (or use a special system ID)
      content: content,
      chat: chatId,
      type: "system", // We need to handle this in frontend
    });
  } catch (error) {
    console.error("Failed to create system message:", error);
  }
};

// @desc    Update Group Settings (Image, About, Toggles)
// @route   PUT /api/chat/group/settings
// @access  Protected (Admins only)
const updateGroupSettings = asyncHandler(async (req, res) => {
  const { chatId, about, chatImage, onlyAdminsCanMessage, hideMembersList } =
    req.body;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const updateFields = {};
  let systemMsg = "";

  if (about !== undefined) {
    updateFields.description = about; // Mapping 'about' to 'description'
    systemMsg += `Group about updated. `;
  }
  if (chatImage !== undefined) {
    updateFields.icon = chatImage; // Mapping 'chatImage' to 'icon'
    systemMsg += `Group icon updated. `;
  }
  if (onlyAdminsCanMessage !== undefined) {
    updateFields["settings.onlyAdminsPost"] = onlyAdminsCanMessage;
    systemMsg += onlyAdminsCanMessage
      ? "Only admins can send messages now. "
      : "All members can send messages now. ";
  }
  if (hideMembersList !== undefined) {
    updateFields["settings.hideMembers"] = hideMembersList;
    systemMsg += hideMembersList
      ? "Members list is now hidden for non-admins. "
      : "Members list is visible to everyone. ";
  }
  if (req.body.isPrivate !== undefined) {
    updateFields["settings.isPrivate"] = req.body.isPrivate;
    systemMsg += req.body.isPrivate
      ? "Group is now Private. "
      : "Group is now Public. ";
  }

  // Update Group Model
  await Group.findByIdAndUpdate(chat.groupDetails, updateFields, { new: true });

  // Return updated full chat
  const updatedChat = await Chat.findById(chatId)
    .populate("users", "-password")
    .populate({
      path: "groupDetails",
      populate: { path: "admins", select: "-password" },
    });

  if (systemMsg) {
    await createSystemMessage(chatId, systemMsg.trim());
  }
  res.json(updatedChat);
});

// @desc    Make User Admin
// @route   PUT /api/chat/group/make-admin
// @access  Protected (Admins only)
const makeGroupAdmin = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  await Group.findByIdAndUpdate(
    chat.groupDetails,
    { $addToSet: { admins: userId } }, // Use addToSet to prevent duplicates
    { new: true }
  );

  const updatedChat = await Chat.findById(chatId)
    .populate("users", "-password")
    .populate({
      path: "groupDetails",
      populate: { path: "admins", select: "-password" },
    });

  // Find the user name for better message
  const user = updatedChat.users.find((u) => u._id.toString() === userId);
  const userName = user ? user.name : "A member";
  await createSystemMessage(chatId, `${userName} is now an admin.`);
  res.json(updatedChat);
});

// @desc    Remove Admin Status
// @route   PUT /api/chat/group/remove-admin
// @access  Protected (Admins only)
const removeGroupAdmin = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  await Group.findByIdAndUpdate(
    chat.groupDetails,
    { $pull: { admins: userId } },
    { new: true }
  );

  const updatedChat = await Chat.findById(chatId)
    .populate("users", "-password")
    .populate({
      path: "groupDetails",
      populate: { path: "admins", select: "-password" },
    });

  const user = updatedChat.users.find((u) => u._id.toString() === userId);
  const userName = user ? user.name : "A member";
  await createSystemMessage(chatId, `${userName} is no longer an admin.`);
  res.json(updatedChat);
});

// @desc    Remove User from Group
// @route   PUT /api/chat/group/remove
// @access  Protected (Admins only)
const removeFromGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  // 1. Remove from Chat (users array)
  const chat = await Chat.findByIdAndUpdate(
    chatId,
    { $pull: { users: userId } },
    { new: true }
  );

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  // 2. Remove from Group (admins array if they were admin)
  await Group.findByIdAndUpdate(
    chat.groupDetails,
    { $pull: { admins: userId } },
    { new: true }
  );

  const updatedChat = await Chat.findById(chatId)
    .populate("users", "-password")
    .populate({
      path: "groupDetails",
      populate: { path: "admins", select: "-password" },
    });

  if (!updatedChat) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
    // If user removed themselves or was removed, we can optionally notify
    await createSystemMessage(chatId, `A member left the group.`);
    res.json(updatedChat);
  }
});

// @desc    Delete Group (Admin only)
// @route   DELETE /api/chat/group/:chatId
// @access  Protected
const deleteGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  // Verify Admin
  // Note: Middleware protects route, but we need to check if req.user is group admin
  // Since we rely on Chat.groupDetails -> Group.admins handling, let's fetch Group
  const group = await Group.findById(chat.groupDetails);

  if (!group) {
    // Fallback if loose link
    await Chat.findByIdAndDelete(chatId);
    return res.json({ message: "Group Removed" });
  }

  const isAdmin = group.admins.some(
    (a) => a.toString() === req.user._id.toString()
  );
  if (!isAdmin) {
    res.status(401);
    throw new Error("Only admins can delete the group");
  }

  await Group.findByIdAndDelete(chat.groupDetails);
  await Chat.findByIdAndDelete(chatId);
  await Message.deleteMany({ chat: chatId });

  res.json({ message: "Group Deleted Successfully" });
});

// @desc    Toggle Mute Chat
// @route   PUT /api/chat/mute
// @access  Protected
const toggleMute = asyncHandler(async (req, res) => {
  const { chatId } = req.body;
  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const userId = req.user._id;
  const isMuted = chat.mutedBy && chat.mutedBy.includes(userId);

  if (isMuted) {
    // Unmute
    await Chat.findByIdAndUpdate(chatId, {
      $pull: { mutedBy: userId },
    });
    res.json({ message: "Chat Unmuted", isMuted: false });
  } else {
    // Mute
    await Chat.findByIdAndUpdate(chatId, {
      $addToSet: { mutedBy: userId },
    });
    res.json({ message: "Chat Muted", isMuted: true });
  }
});

// @desc    Toggle Share Phone Number
// @route   PUT /api/chat/share-phone
// @access  Protected
const toggleSharePhone = asyncHandler(async (req, res) => {
  const { chatId } = req.body;
  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const userId = req.user._id;
  const isShared =
    chat.sharedPhoneNumbers && chat.sharedPhoneNumbers.includes(userId);

  if (isShared) {
    // Stop Sharing
    await Chat.findByIdAndUpdate(chatId, {
      $pull: { sharedPhoneNumbers: userId },
    });
    res.json({ message: "Stopped Sharing Phone", isShared: false });
  } else {
    // Share
    await Chat.findByIdAndUpdate(chatId, {
      $addToSet: { sharedPhoneNumbers: userId },
    });
    res.json({ message: "Phone Shared", isShared: true });
  }
});

// @desc    Block/Unblock User
// @route   PUT /api/chat/block
// @access  Protected
const blockUser = asyncHandler(async (req, res) => {
  const { userId: targetIds } = req.body;
  // Support blocking single or list (though simple block usually single)
  // Let's assume targetId is passed.
  const targetId = targetIds;

  const user = await User.findById(req.user._id);

  const isBlocked = user.blockedUsers && user.blockedUsers.includes(targetId);

  if (isBlocked) {
    // Unblock
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { blockedUsers: targetId },
    });
    res.json({ message: "User Unblocked", isBlocked: false });
  } else {
    // Block
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { blockedUsers: targetId },
    });
    res.json({ message: "User Blocked", isBlocked: true });
  }
});

// @desc    Join Group (via QR)
// @route   PUT /api/chat/join
// @access  Protected
const joinGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.body;
  const userId = req.user._id;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  // Check if already member
  if (chat.users.includes(userId)) {
    return res.status(400).json({ message: "You are already in this group" });
  }

  const group = await Group.findById(chat.groupDetails);

  if (group.settings.isPrivate) {
    // Check if already requested
    if (group.joinRequests && group.joinRequests.includes(userId)) {
      return res.status(400).json({ message: "Join request already sent" });
    }

    await Group.findByIdAndUpdate(group._id, {
      $push: { joinRequests: userId },
    });

    // Notify Admins? (Future scope)
    res.json({ message: "Join request sent to admins", status: "requested" });
  } else {
    // Public - Join immediately
    await Chat.findByIdAndUpdate(chatId, {
      $push: { users: userId },
    });

    await createSystemMessage(
      chatId,
      `${req.user.firstName} joined via QR code.`
    );

    const fullChat = await Chat.findById(chatId)
      .populate("users", "-password")
      .populate({
        path: "groupDetails",
        populate: { path: "admins", select: "-password" },
      });

    res.json({ message: "Joined group", status: "joined", chat: fullChat });
  }
});

// @desc    Handle Join Request (Accept/Reject)
// @route   PUT /api/chat/join-request
// @access  Protected (Admin)
const handleJoinRequest = asyncHandler(async (req, res) => {
  const { chatId, userId, action } = req.body; // action: 'accept' | 'reject'

  const chat = await Chat.findById(chatId);
  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const group = await Group.findById(chat.groupDetails);

  // Auth Check
  const isAdmin = group.admins.some(
    (a) => a.toString() === req.user._id.toString()
  );
  if (!isAdmin) {
    res.status(401);
    throw new Error("Admins only");
  }

  if (action === "accept") {
    // Add to Chat users
    await Chat.findByIdAndUpdate(chatId, { $push: { users: userId } });
    // Remove from Requests
    await Group.findByIdAndUpdate(group._id, {
      $pull: { joinRequests: userId },
    });

    // Notify
    const user = await User.findById(userId);
    await createSystemMessage(
      chatId,
      `${user.firstName} join request accepted.`
    );

    res.json({ message: "Request Accepted" });
  } else {
    // Reject - just remove from requests
    await Group.findByIdAndUpdate(group._id, {
      $pull: { joinRequests: userId },
    });
    res.json({ message: "Request Rejected" });
  }
});

// @desc    Toggle Archive Chat
// @route   PUT /api/chat/archive
// @access  Protected
const toggleArchive = asyncHandler(async (req, res) => {
  const { chatId } = req.body;
  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const userId = req.user._id;
  const isArchived = chat.archivedBy && chat.archivedBy.includes(userId);

  if (isArchived) {
    // Unarchive
    await Chat.findByIdAndUpdate(chatId, {
      $pull: { archivedBy: userId },
    });
    res.json({ message: "Chat Unarchived", isArchived: false });
  } else {
    // Archive
    await Chat.findByIdAndUpdate(chatId, {
      $addToSet: { archivedBy: userId },
    });
    res.json({ message: "Chat Archived", isArchived: true });
  }
});

// @desc    Delete Chat (Soft Delete for User)
// @route   PUT /api/chat/delete
// @access  Protected
const deleteUserChat = asyncHandler(async (req, res) => {
  const { chatId } = req.body;
  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const userId = req.user._id;

  // Add to deletedBy
  await Chat.findByIdAndUpdate(chatId, {
    $addToSet: { deletedBy: userId },
    $pull: { archivedBy: userId }, // Optional: User might want to remove from archive if deleted
  });

  res.json({ message: "Chat Deleted", isDeleted: true });
});

module.exports = {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
  updateGroupSettings,
  makeGroupAdmin,
  removeGroupAdmin,
  deleteGroup,
  toggleMute,
  toggleSharePhone,
  blockUser,
  joinGroup,
  handleJoinRequest,
  toggleArchive,
  deleteUserChat,
};
