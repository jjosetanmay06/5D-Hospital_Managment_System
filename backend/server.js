
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "node:crypto";

dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
  throw new Error("Set JWT_SECRET to at least 24 characters in .env");
}

const app = express();
app.use(cors());
app.use(express.json());

const users = [];

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

// Patient registration

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (
      !name?.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") ||
      !/^\d{10}$/.test(phone || "") ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: "Enter a valid name, email, phone and password."
      });
    }

    const normalizedEmail = email.toLowerCase();

    const existingUser = users.find(
      u => u.email === normalizedEmail || u.phone === phone
    );

    if (existingUser) {
      return res.status(409).json({
        message: "Email or phone number is already registered."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const otp = String(crypto.randomInt(100000, 1000000));

    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      phone,
      passwordHash,
      role: "patient",
      phoneVerified: false,
      otpHash: crypto.createHash("sha256").update(otp).digest("hex"),
      otpExpiresAt: Date.now() + 5 * 60 * 1000,
      otpAttempts: 0
    };

    users.push(user);

    // Development only: do not log OTPs in production.
    console.log(`Development OTP for ${phone}: ${otp}`);

    return res.status(201).json({
      message: "Registration successful. Verify your phone to continue.",
      requiresVerification: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phoneVerified: user.phoneVerified
      }
    });
  } catch (error) {
    console.error("Registration error:", error.message);
    return res.status(500).json({
      message: "Registration failed."
    });
  }
});


app.post("/api/auth/verify-otp", (req, res) => {
  const { phone, otp } = req.body;

  if (!/^\d{10}$/.test(phone || "") ||
      !/^\d{6}$/.test(otp || "")) {
    return res.status(400).json({
      message: "Enter a valid phone number and six-digit OTP."
    });
  }

  const user = users.find(u => u.phone === phone);

  if (!user) {
    return res.status(404).json({
      message: "No registered user found for this phone number."
    });
  }

  if (user.phoneVerified) {
    return res.json({
      message: "Phone number is already verified."
    });
  }

  if (user.otpAttempts >= 5) {
    return res.status(429).json({
      message: "Too many incorrect attempts. Register again to request a new OTP."
    });
  }

  if (Date.now() > user.otpExpiresAt) {
    return res.status(410).json({
      message: "OTP expired. Please register again to request a new OTP."
    });
  }

  user.otpAttempts += 1;

  const submittedHash = crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");

  const correct = crypto.timingSafeEqual(
    Buffer.from(submittedHash, "hex"),
    Buffer.from(user.otpHash, "hex")
  );

  if (!correct) {
    return res.status(400).json({
      message: `Incorrect OTP. ${5 - user.otpAttempts} attempts remaining.`
    });
  }

  user.phoneVerified = true;

  delete user.otpHash;
  delete user.otpExpiresAt;
  delete user.otpAttempts;

  return res.json({
    message: "Phone number verified successfully.",
    phoneVerified: true
  });
});


// Patient login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.find(
      u => u.email === String(email || "").toLowerCase()
    );

    if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }
    if (!user.phoneVerified) {
  return res.status(403).json({
    message: "Please verify your phone number before logging in."
  });
}

    res.json({
      message: "Login successful.",
      token: createToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch {
    res.status(500).json({ message: "Login failed." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(process.env.PORT || 5000, () => {
  console.log("Backend running at http://localhost:5000");
});
