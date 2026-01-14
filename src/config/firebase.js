const admin = require("firebase-admin");
const path = require("path");

try {
  const serviceAccount = require("../serviceAccountKey.json");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("Firebase Admin Initialized");
  module.exports = admin;
} catch (error) {
  console.log(
    "Firebase Admin Config Error: serviceAccountKey.json missing or invalid. Notifications will be disabled."
  );
  // Export null so we can check for it
  module.exports = null;
}
