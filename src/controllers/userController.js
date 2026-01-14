const asyncHandler = require("express-async-handler"); // Simple middleware for handling errors
const User = require("../models/User");
const Message = require("../models/Message");
const Chat = require("../models/Chat");
const generateToken = require("../utils/generateToken");

// @desc    Register new user
// @route   POST /api/user
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    mobile,
    username,
    gender,
    pic,
  } = req.body;

  // 1. Check if all fields exist
  if (!firstName || !email || !password || !mobile || !username) {
    res.status(400);
    throw new Error("Please enter all required fields");
  }

  // 2. Check duplicate email/username/mobile
  const userExists = await User.findOne({
    $or: [{ email }, { username }, { mobile }],
  });

  if (userExists) {
    res.status(400);
    throw new Error("User with this Email, Username or Mobile already exists");
  }

  // 3. Create User
  const user = await User.create({
    firstName,
    lastName,
    username,
    email,
    password,
    mobile,
    gender,
    pic,
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      gender: user.gender,
      about: user.about,
      pic: user.pic,
      token: generateToken(user._id),
      createdAt: user.createdAt,
    });
  } else {
    res.status(400);
    throw new Error("Failed to create the user");
  }
});

// @desc    Auth user & get token
// @route   POST /api/user/login
// @access  Public
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      gender: user.gender,
      about: user.about,
      pic: user.pic,
      token: generateToken(user._id),
      createdAt: user.createdAt,
    });
  } else {
    res.status(401);
    throw new Error("Invalid Email or Password");
  }
});

const allUsers = asyncHandler(async (req, res) => {
  const keyword = req.query.search
    ? {
        $or: [
          // Case-insensitive regex search
          { username: { $regex: req.query.search, $options: "i" } },
          { mobile: { $regex: req.query.search, $options: "i" } },
        ],
      }
    : {};

  // Find users matching keyword, but exclude the current logged-in user
  // req.user._id comes from our new middleware!
  // Find users matching keyword, but exclude the current logged-in user
  // req.user._id comes from our new middleware!
  let users = await User.find(keyword).find({ _id: { $ne: req.user._id } });

  // Filter based on privacy settings
  users = users.filter((user) => {
    // If we searched by username, check if the user allows searching by username
    if (
      req.query.search &&
      user.username.match(new RegExp(req.query.search, "i"))
    ) {
      if (user.privacy && user.privacy.searchByUsername === false) {
        return false;
      }
    }
    // logic for mobile privacy can be added here
    return true;
  });

  res.send(users);
});

// @desc    Get current user profile
// @route   GET /api/user/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      gender: user.gender,
      about: user.about,
      pic: user.pic,
      privacy: user.privacy,
      createdAt: user.createdAt,
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    Update current user profile
// @route   PUT /api/user/profile
// @access  Private
// @desc    Update current user profile
// @route   PUT /api/user/profile
// @access  Private
// @desc    Update current user profile
// @route   PUT /api/user/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    // 1. Capture Old Values for Announcement
    const oldUsername = user.username;
    const oldFirstName = user.firstName;
    const oldLastName = user.lastName;

    // 2. Apply Updates
    user.firstName = req.body.firstName || user.firstName;
    user.lastName = req.body.lastName || user.lastName;
    user.mobile = req.body.mobile || user.mobile;
    user.pic = req.body.pic || user.pic;
    user.gender = req.body.gender || user.gender;
    user.about = req.body.about || user.about;

    // 3. Username Logic (with Cooldown)
    if (req.body.username && req.body.username !== user.username) {
      const now = new Date();
      const fourteenDays = 14 * 24 * 60 * 60 * 1000;

      if (user.lastUsernameChange) {
        const lastChange = new Date(user.lastUsernameChange);
        const diff = now - lastChange;
        if (diff < fourteenDays) {
          res.status(400);
          const daysLeft = Math.ceil(
            (fourteenDays - diff) / (24 * 60 * 60 * 1000)
          );
          throw new Error(`You can change username again in ${daysLeft} days.`);
        }
      }

      // Check availability
      const usernameExists = await User.findOne({
        username: req.body.username,
      });
      if (usernameExists) {
        res.status(400);
        throw new Error("Username already taken.");
      }

      user.username = req.body.username;
      user.lastUsernameChange = now;
    }

    // 4. Privacy & Password
    if (req.body.privacy) {
      user.privacy = { ...user.privacy, ...req.body.privacy };
    }
    if (req.body.password) {
      user.password = req.body.password;
    }

    // 5. Save User
    const updatedUser = await user.save();

    // 6. Check for Changes and Announce
    let announcements = [];

    // Check Username Change
    if (oldUsername !== updatedUser.username) {
      announcements.push(
        `changed username from @${oldUsername} to @${updatedUser.username}`
      );
    }

    // Check Name Change
    const oldName = `${oldFirstName} ${oldLastName}`.trim();
    const newName = `${updatedUser.firstName} ${updatedUser.lastName}`.trim();
    if (oldName !== newName) {
      announcements.push(`changed name from '${oldName}' to '${newName}'`);
    }

    if (announcements.length > 0) {
      const announcementText = `${newName} ${announcements.join(" and ")}`;

      // Find Chats
      const chats = await Chat.find({
        users: { $elemMatch: { $eq: req.user._id } },
      });

      if (chats && chats.length > 0) {
        await Promise.all(
          chats.map(async (chat) => {
            // Create System Message
            var message = await Message.create({
              sender: null, // System message
              content: announcementText,
              chat: chat._id,
              type: "system",
            });

            // Update Latest Message
            await Chat.findByIdAndUpdate(chat._id, { latestMessage: message });

            // Socket Emit
            const io = req.app.get("io");
            if (io) {
              // We need to populate request for client? Not really for system message usually,
              // but let's stick to standard structure if possible.
              // Ideally we send the message object.
              io.in(chat._id.toString()).emit("message_received", message);
            }
          })
        );
      }
    }

    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      mobile: updatedUser.mobile,
      gender: updatedUser.gender,
      about: updatedUser.about,
      pic: updatedUser.pic,
      privacy: updatedUser.privacy,
      createdAt: updatedUser.createdAt,
      token: generateToken(updatedUser._id),
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    Update FCM Token
// @route   PUT /api/user/fcm-token
// @access  Private
const updateFcmToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    res.status(400);
    throw new Error("FCM Token is required");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { fcmToken },
    { new: true }
  );

  if (user) {
    res.json({ message: "FCM Token updated" });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    Delete user account
// @route   DELETE /api/user
// @access  Private
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    await User.deleteOne({ _id: user._id }); // Use deleteOne on the model or remove() on the document (deprecated in some versions)
    res.json({ message: "User removed" });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    Check if username is available
// @route   GET /api/user/check-username
// @access  Public
const checkUsernameAvailability = asyncHandler(async (req, res) => {
  const { username } = req.query;

  if (!username) {
    res.status(400);
    throw new Error("Username is required");
  }

  const userExists = await User.findOne({ username });

  if (userExists) {
    res.json({ available: false, message: "Username is already taken" });
  } else {
    res.json({ available: true, message: "Username is available" });
  }
});

// @desc    Change Mobile Number & Notify Chats
// @route   PUT /api/user/change-mobile
// @access  Protected
const changeMobile = asyncHandler(async (req, res) => {
  const { newMobile } = req.body;
  const userId = req.user._id;

  if (!newMobile) {
    res.status(400);
    throw new Error("New mobile number is required");
  }

  // 1. Check if mobile exists
  const mobileExists = await User.findOne({ mobile: newMobile });
  if (mobileExists) {
    res.status(400);
    throw new Error("Mobile number already taken");
  }

  // 2. Update User
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const oldMobile = user.mobile; // Optional: keep if needed
  user.mobile = newMobile;
  await user.save();

  // 3. Find All Chats for this User
  const chats = await Chat.find({
    users: { $elemMatch: { $eq: userId } },
  });

  // 4. Create System Message & Broadcast
  if (chats && chats.length > 0) {
    const announcement = `${user.firstName} ${user.lastName} changed mobile no`;

    // We can use Promise.all for parallel execution
    await Promise.all(
      chats.map(async (chat) => {
        // A. Create System Message in DB
        var message = await Message.create({
          sender: userId, // associate with user so we know who triggered it? Or use null for pure system.
          // Requirement says "same like mobile no", usually means system event.
          // Let's us specific format. If sender is null, it's generic.
          // If sender is user, it shows "User: message".
          // Let's use sender = null (System) but content includes name.
          sender: null,
          content: announcement,
          chat: chat._id,
          type: "system",
        });

        // Populate chat for socket return (optional, depends on frontend need)
        message = await message.populate("chat");

        // B. Update Last Message
        await Chat.findByIdAndUpdate(chat._id, { latestMessage: message });

        // C. Emit Socket Event
        // Access IO from app instance
        const io = req.app.get("io");
        if (io) {
          io.in(chat._id.toString()).emit("message_received", message);
        }
      })
    );
  }

  res.json({
    success: true,
    message: "Mobile number updated and chats notified",
    mobile: newMobile,
  });
});

module.exports = {
  registerUser,
  authUser,
  allUsers,
  getMe,
  updateUserProfile,
  updateFcmToken,
  checkUsernameAvailability,
  deleteUser,
  changeMobile,
};
