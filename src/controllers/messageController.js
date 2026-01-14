const asyncHandler = require("express-async-handler");
const Message = require("../models/Message");
const User = require("../models/User");
const Chat = require("../models/Chat");

// @desc    Get all Messages
// @route   GET /api/message/:chatId
// @access  Protected
const allMessages = asyncHandler(async (req, res) => {
  try {
    const messages = await Message.find({ chat: req.params.chatId })
      // FIX 1: Changed "name" to "firstName lastName username"
      .populate("sender", "firstName lastName username pic email")
      .populate("chat")
      .populate({
        path: "replyTo",
        select: "content type sender",
        populate: {
          path: "sender",
          select: "firstName lastName username pic email",
        },
      }); // Deep Populate Reply context

    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Create New Message
// @route   POST /api/message
// @access  Protected
const sendMessage = asyncHandler(async (req, res) => {
  const { content, chatId, type, replyTo } = req.body;

  if (!content || !chatId) {
    console.log("Invalid data passed into request");
    return res.sendStatus(400);
  }

  var newMessage = {
    sender: req.user._id,
    content: content,
    chat: chatId,
    type: type || "text",
    replyTo: replyTo || null,
  };

  try {
    var message = await Message.create(newMessage);

    // FIX 2: Ensure we populate specific fields correctly here too
    message = await message.populate(
      "sender",
      "firstName lastName username pic email"
    );
    message = await message.populate("chat");
    message = await message.populate({
      path: "replyTo",
      populate: {
        path: "sender",
        select: "firstName lastName username pic email",
      },
    });

    // FIX 3: Update User population inside chat.users
    // Changed "name" to "firstName lastName username"
    message = await User.populate(message, {
      path: "chat.users",
      select: "firstName lastName username pic email",
    });

    // Update Latest Message in Chat Collection
    await Chat.findByIdAndUpdate(req.body.chatId, {
      latestMessage: message,
    });

    res.json(message);

    // --- SEND NOTIFICATION ---
    // Perform async, don't block response
    try {
      const chat = await Chat.findById(chatId).populate("users", "fcmToken");
      const admin = require("../config/firebase");

      if (admin && chat && chat.users) {
        chat.users.forEach((user) => {
          if (
            user._id.toString() !== req.user._id.toString() &&
            user.fcmToken
          ) {
            const payload = {
              notification: {
                title: `${req.user.firstName} ${req.user.lastName}`,
                body: content,
              },
              data: {
                click_action: "FLUTTER_NOTIFICATION_CLICK",
                type: "message",
                chatId: chatId,
              },
              token: user.fcmToken,
            };

            admin
              .messaging()
              .send(payload)
              .then((response) =>
                console.log("Successfully sent notification:", response)
              )
              .catch((error) =>
                console.log("Error sending notification:", error)
              );
          }
        });
      }
    } catch (e) {
      console.log("Notification Error (Non-fatal):", e);
    }
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    React to Message
// @route   PUT /api/message/react/:id
// @access  Protected
const reactToMessage = asyncHandler(async (req, res) => {
  const { emoji } = req.body;
  const messageId = req.params.id;
  const userId = req.user._id;

  const message = await Message.findById(messageId);
  if (!message) {
    res.status(404);
    throw new Error("Message not found");
  }

  // Check if user already reacted with THIS emoji
  const existingReactionIndex = message.reactions.findIndex(
    (r) => r.user.toString() === userId.toString() && r.emoji === emoji
  );

  if (existingReactionIndex > -1) {
    // Toggle Off (Remove reaction)
    message.reactions.splice(existingReactionIndex, 1);
  } else {
    // Add Reaction
    message.reactions.push({ user: userId, emoji });
  }

  await message.save();
  const fullMessage = await Message.findById(messageId)
    .populate("sender", "firstName lastName username pic email")
    .populate("chat")
    .populate("replyTo");

  res.json(fullMessage);
});

// @desc    Delete Message (Soft Delete)
// @route   PUT /api/message/delete/:id
// @access  Protected
const deleteMessage = asyncHandler(async (req, res) => {
  const messageId = req.params.id;
  const userId = req.user._id;

  const message = await Message.findById(messageId);

  if (!message) {
    res.status(404);
    throw new Error("Message not found");
  }

  // Only Sender can delete
  if (message.sender.toString() !== userId.toString()) {
    res.status(401);
    throw new Error("Not authorized to delete this message");
  }

  message.isDeleted = true;
  await message.save();

  res.json(message);
});

module.exports = { allMessages, sendMessage, reactToMessage, deleteMessage };
