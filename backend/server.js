
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

    if (!name?.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") ||
        !/^\d{10}$/.test(phone || "") ||
        typeof password !== "string" ||
        password.length < 8) {
      return res.status(400).json({
        message: "Enter a valid name, email, 10-digit phone and password of at least 8 characters."
      });
    }

    const normalizedEmail = email.toLowerCase();

    if (users.some(
      u => u.email === normalizedEmail || u.phone === phone
    )) {
      return res.status(409).json({
        message: "Email or phone number is already registered."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      phone,
      passwordHash,
      role: "patient"
    };

    users.push(user);

    res.status(201).json({
      message: "Registration successful.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch {
    res.status(500).json({ message: "Registration failed." });
  }
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
