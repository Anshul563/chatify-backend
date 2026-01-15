const getAppVersion = async (req, res) => {
  try {
    // In a real app, this might come from a DB or config file
    // For now, we hardcode the latest version
    const versionInfo = {
      android: {
        latestVersion: "1.0.1", // Matches or exceeds current pubspec version
        minVersion: "1.0.0",
        url: "https://play.google.com/store/apps/details?id=com.example.chatify_app",
      },
      ios: {
        latestVersion: "1.0.1",
        minVersion: "1.0.0",
        url: "https://apps.apple.com/app/id123456789",
      },
    };

    res.status(200).json(versionInfo);
  } catch (error) {
    console.error("Error fetching app version:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getAppVersion,
};
