
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

function getAvailableSlots(doctorId, date) {
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  return appointmentSlots.filter(slot => {
    const alreadyBooked = appointments.some(
      appointment =>
        appointment.doctorId === doctorId &&
        appointment.date === date &&
        appointment.time === slot &&
        appointment.status === "Booked"
    );

    if (alreadyBooked) return false;

    // Hide appointment times that have already passed today.
    if (date === today) {
      const [hours, minutes] = slot.split(":").map(Number);
      const slotTime = new Date();
      slotTime.setHours(hours, minutes, 0, 0);

      if (slotTime <= now) return false;
    }

    return true;
  });
}

// List available doctors
app.get("/api/doctors", (_req, res) => {
  res.json({ doctors });
});

// Check available slots for a doctor on a selected date
app.get("/api/doctors/:doctorId/slots", (req, res) => {
  const { doctorId } = req.params;
  const { date } = req.query;

  if (!doctors.some(doctor => doctor.id === doctorId)) {
    return res.status(404).json({
      message: "Doctor not found."
    });
  }

  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return res.status(400).json({
      message: "Select a valid date in YYYY-MM-DD format."
    });
  }



const [year, month, day] = date.split("-").map(Number);

if (
  !Number.isInteger(year) ||
  !Number.isInteger(month) ||
  !Number.isInteger(day) ||
  month < 1 ||
  month > 12 ||
  day < 1 ||
  day > 31
) {
  return res.status(400).json({
    message: "Invalid calendar date."
  });
}

const parsedDate = new Date(0);
parsedDate.setHours(0, 0, 0, 0);
parsedDate.setFullYear(year, month - 1, day);

if (
  parsedDate.getFullYear() !== year ||
  parsedDate.getMonth() !== month - 1 ||
  parsedDate.getDate() !== day
) {
  return res.status(400).json({
    message: "Invalid calendar date."
  });
}



  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  if (date < today) {
    return res.status(400).json({
      message: "Appointments cannot be booked in the past."
    });
  }

  res.json({
    doctorId,
    date,
    slots: getAvailableSlots(doctorId, date)
  });
});

// Book an appointment
app.post("/api/appointments", authenticatePatient, (req, res) => {
  const { doctorId, date, time } = req.body;
  console.log("Booking request received:", {
  doctorId,
  date,
  time,
  dateType: typeof date,
  timeType: typeof time
});

  const doctor = doctors.find(item => item.id === doctorId);

  if (!doctor) {
    return res.status(404).json({
      message: "Doctor not found."
    });
  }

  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof time !== "string" ||
    !appointmentSlots.includes(time)
  ) {
    return res.status(400).json({
      message: "Select a valid appointment date and time."
    });
  }

 const [y, m, d] = date.split("-").map(Number);
 const check = new Date(y, m - 1, d);

if (
  check.getFullYear() !== y ||
  check.getMonth() !== m - 1 ||
  check.getDate() !== d
) {
  return res.status(400).json({
    message: "Invalid appointment date."
  });
}
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  if (date < today) {
    return res.status(400).json({
      message: "Appointments cannot be booked in the past."
    });
  }

  if (!getAvailableSlots(doctorId, date).includes(time)) {
    return res.status(409).json({
      message: "This time slot is unavailable. Please choose another."
    });
  }

  const appointment = {
    id: crypto.randomUUID(),
    patientId: req.patient.id,
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialty: doctor.specialty,
    date,
    time,
    status: "Booked",
    createdAt: new Date().toISOString()
  };

  appointments.push(appointment);

  res.status(201).json({
    message: "Appointment booked successfully.",
    appointment
  });
});

// View the logged-in patient's appointments
app.get("/api/appointments/me", authenticatePatient, (req, res) => {
  const patientAppointments = appointments.filter(
    appointment => appointment.patientId === req.patient.id
  );

  res.json({ appointments: patientAppointments });
});


app.listen(process.env.PORT || 5000, () => {
  console.log("Backend running at http://localhost:5000");
});

const doctors = [
  {
    id: "DOC001",
    name: "Dr. Ananya Rao",
    specialty: "Cardiology",
    experience: 10
  },
  {
    id: "DOC002",
    name: "Dr. Rahul Sharma",
    specialty: "Dermatology",
    experience: 8
  },
  {
    id: "DOC003",
    name: "Dr. Priya Nair",
    specialty: "General Medicine",
    experience: 6
  },
  {
    id: "DOC004",
    name: "Dr. Arjun Kumar",
    specialty: "Orthopedics",
    experience: 12
  }
];

const appointments = [];

const appointmentSlots = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "14:00",
  "15:00",
  "16:00"
];

function authenticatePatient(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  try {
    const token = authorization.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "patient") {
      return res.status(403).json({
        message: "Only patients can book appointments."
      });
    }

    req.patient = decoded;
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired login session."
    });
  }
}
