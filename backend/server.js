
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "node:crypto";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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


app.patch(
  "/api/appointments/:id/cancel",
  authenticatePatient,
  (req, res) => {
    const appointment = appointments.find(
      item => item.id === req.params.id
    );

    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found."
      });
    }

    if (appointment.patientId !== req.patient.id) {
      return res.status(403).json({
        message: "You cannot cancel another patient's appointment."
      });
    }

    if (appointment.status !== "Booked") {
      return res.status(409).json({
        message: "This appointment can no longer be cancelled."
      });
    }

    appointment.status = "cancelled";
    appointment.cancelledAt = new Date().toISOString();

    return res.json({
      message: "Appointment cancelled successfully.",
      appointment
    });
  }
);




/* TASK5_MEDICAL_REPORTS_START */

const medicalRecords = [
  {
    id: "demo-record-1",
    patientId: "demo-patient",
    appointmentId: null,
    diagnosis: "Seasonal Allergic Rhinitis",
    treatmentNotes:
      "Sample treatment notes for demonstration purposes.",
    createdAt: "2026-09-12T10:30:00.000Z",
  },
  {
    id: "demo-record-2",
    patientId: "demo-patient",
    appointmentId: null,
    diagnosis: "Routine Health Check-up",
    treatmentNotes:
      "General examination completed. Follow-up as advised.",
    createdAt: "2026-10-05T09:00:00.000Z",
  },
];

const reportRecords = [];
const prescriptionRecords = [];



const task5BackendDir = path.dirname(fileURLToPath(import.meta.url));
const privateReportDir = path.join(task5BackendDir, "private-reports");
fs.mkdirSync(privateReportDir, { recursive: true });

const reportStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, privateReportDir),
  filename: (_req, file, callback) => {
    const extensionByType = {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
    };
    callback(null, crypto.randomUUID() + (extensionByType[file.mimetype] || ""));
  },
});

const reportUpload = multer({
  storage: reportStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.mimetype)) {
      return callback(new Error("Only PDF, JPEG and PNG files are accepted."));
    }
    callback(null, true);
  },
});

function authenticateDoctor(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Doctor login is required." });
  }
  try {
    const decoded = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
    if (decoded.role !== "doctor") {
      return res.status(403).json({ message: "Doctor access only." });
    }
    req.doctor = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired login session." });
  }
}

function authenticateMedicalViewer(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Please log in to access this report." });
  }
  try {
    req.viewer = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
    if (!["doctor", "patient"].includes(req.viewer.role)) {
      return res.status(403).json({ message: "Access denied." });
    }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired login session." });
  }
}

// Demo doctor account is configured locally in backend/.env; never hard-code a password here.
app.post("/api/auth/doctor-login", (req, res) => {
  const { email, password } = req.body || {};
  const configuredEmail = (process.env.DOCTOR_EMAIL || "").toLowerCase();
  const configuredPassword = process.env.DOCTOR_PASSWORD || "";
  const configuredDoctorId = process.env.DOCTOR_ID || "DOC001";

  if (!configuredEmail || !configuredPassword) {
    return res.status(503).json({
      message: "Doctor login is not configured. Set DOCTOR_EMAIL and DOCTOR_PASSWORD in backend/.env.",
    });
  }
  if (typeof email !== "string" || typeof password !== "string" ||
      email.toLowerCase() !== configuredEmail || password !== configuredPassword) {
    return res.status(401).json({ message: "Invalid doctor email or password." });
  }

  const doctor = doctors.find((item) => item.id === configuredDoctorId);
  if (!doctor) {
    return res.status(500).json({ message: "Configured DOCTOR_ID does not match a doctor in the system." });
  }
  const doctorUser = {
    id: doctor.id,
    email: configuredEmail,
    name: doctor.name,
    role: "doctor",
  };
  return res.json({ token: createToken(doctorUser), user: doctorUser });
});

// Doctors can only see appointments assigned to their own doctor ID.
app.get("/api/doctor/appointments", authenticateDoctor, (req, res) => {
  const assigned = appointments
    .filter((appointment) => appointment.doctorId === req.doctor.id)
    .map((appointment) => {
      const patient = users.find((item) => item.id === appointment.patientId);
      return {
        ...appointment,
        patientName: patient?.name || "Patient",
        patientEmail: patient?.email || "",
        medicalHistory: medicalRecords
          .filter((record) => record.patientId === appointment.patientId)
          .map(({ id, diagnosis, treatmentNotes, createdAt }) => ({ id, diagnosis, treatmentNotes, createdAt })),
        reports: reportRecords
          .filter((report) => report.patientId === appointment.patientId)
          .map(({ id, reportName, instructions, status, originalName, storedName }) => ({
            id, reportName, instructions, status, originalName, hasFile: Boolean(storedName),
          })),
      };
    });
  res.json({ appointments: assigned });
});

app.post("/api/doctor/appointments/:id/diagnoses", authenticateDoctor, (req, res) => {
  const appointment = appointments.find((item) =>
    item.id === req.params.id && item.doctorId === req.doctor.id
  );
  if (!appointment) {
    return res.status(404).json({ message: "Assigned appointment not found." });
  }

  const diagnosis = typeof req.body?.diagnosis === "string" ? req.body.diagnosis.trim() : "";
  const treatmentNotes = typeof req.body?.treatmentNotes === "string" ? req.body.treatmentNotes.trim() : "";
  if (!diagnosis || diagnosis.length > 3000 || treatmentNotes.length > 5000) {
    return res.status(400).json({ message: "Enter a diagnosis (max 3000 characters); notes may be up to 5000 characters." });
  }

  const record = {
    id: crypto.randomUUID(),
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    doctorId: req.doctor.id,
    diagnosis,
    treatmentNotes,
    createdAt: new Date().toISOString(),
  };
  medicalRecords.push(record);
  return res.status(201).json({ message: "Diagnosis saved.", record });
});

// Doctor medicine catalogue and prescription management.
app.get("/api/medicines/catalogue", authenticateDoctor, (_req, res) => {
  res.json({ medicines: medicineCatalogue });
});

app.post("/api/doctor/appointments/:id/prescriptions", authenticateDoctor, (req, res) => {
  const appointment = appointments.find(item =>
    item.id === req.params.id && item.doctorId === req.doctor.id
  );
  if (!appointment) return res.status(404).json({ message: "Assigned appointment not found." });
  if (appointment.status !== "Booked") {
    return res.status(409).json({ message: "Only booked appointments can receive prescriptions." });
  }
  const { items, notes = "" } = req.body || {};
  if (!Array.isArray(items) || items.length < 1 || items.length > 20 ||
      typeof notes !== "string" || notes.length > 3000) {
    return res.status(400).json({ message: "Provide 1–20 medicines and valid notes." });
  }
  const seen = new Set();
  const prescribed = [];
  for (const item of items) {
    const medicine = medicineCatalogue.find(m => m.id === item?.medicineId);
    const dosage = typeof item?.dosage === "string" ? item.dosage.trim() : "";
    const frequency = typeof item?.frequency === "string" ? item.frequency.trim() : "";
    const instructions = typeof item?.instructions === "string" ? item.instructions.trim() : "";
    if (!medicine || seen.has(medicine.id) || !dosage || !frequency || !instructions ||
        dosage.length > 200 || frequency.length > 200 || instructions.length > 1000) {
      return res.status(400).json({ message: "Choose distinct medicines and enter valid dosage, frequency, and instructions." });
    }
    seen.add(medicine.id);
    prescribed.push({ medicineId: medicine.id, name: medicine.name, price: medicine.price,
      dosage, frequency, instructions });
  }
  const prescription = {
    id: crypto.randomUUID(), appointmentId: appointment.id,
    patientId: appointment.patientId, doctorId: req.doctor.id,
    doctorName: doctors.find(d => d.id === req.doctor.id)?.name || "Doctor",
    items: prescribed, notes: notes.trim(), createdAt: new Date().toISOString()
  };
  prescriptionRecords.push(prescription);
  medicalRecords.push({
    id: crypto.randomUUID(), appointmentId: appointment.id,
    patientId: appointment.patientId, doctorId: req.doctor.id,
    prescriptionId: prescription.id, diagnosis: "Prescription issued",
    treatmentNotes: prescribed.map(m => `${m.name}: ${m.dosage}; ${m.frequency}; ${m.instructions}`).join("\n"),
    createdAt: prescription.createdAt
  });
  res.status(201).json({ message: "Prescription saved successfully.", prescription });
});

app.get("/api/prescriptions/me", authenticatePatient, (req, res) => {
  res.json({ prescriptions: prescriptionRecords.filter(p => p.patientId === req.patient.id) });
});

// Record a report request/details, optionally with a private PDF/JPEG/PNG attachment.
app.post("/api/doctor/appointments/:id/reports", authenticateDoctor, (req, res, next) => {
  reportUpload.single("file")(req, res, (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ message: uploadError.message || "Unable to upload report." });
    }
    next();
  });
}, (req, res) => {
  const appointment = appointments.find((item) =>
    item.id === req.params.id && item.doctorId === req.doctor.id
  );
  if (!appointment) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ message: "Assigned appointment not found." });
  }

  const reportName = typeof req.body?.reportName === "string" ? req.body.reportName.trim() : "";
  const instructions = typeof req.body?.instructions === "string" ? req.body.instructions.trim() : "";
  if (!reportName || reportName.length > 200 || instructions.length > 3000) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: "Enter a report name (max 200 characters); instructions may be up to 3000 characters." });
  }

  const report = {
    id: crypto.randomUUID(),
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    doctorId: req.doctor.id,
    reportName,
    instructions,
    status: req.file ? "Uploaded" : "Requested",
    originalName: req.file ? path.basename(req.file.originalname) : "",
    storedName: req.file ? path.basename(req.file.filename) : "",
    storedPath: req.file ? req.file.path : "",
    createdAt: new Date().toISOString(),
  };
  reportRecords.push(report);
  return res.status(201).json({
    message: req.file ? "Report details and file saved." : "Report request/details saved.",
    report: {
      id: report.id, reportName: report.reportName, instructions: report.instructions,
      status: report.status, hasFile: Boolean(report.storedName),
    },
  });
});

// Patients can only see medical records and report details tied to their own patient ID.
app.get("/api/patient/medical-records", authenticatePatient, (req, res) => {
  const records = medicalRecords
    .filter((record) => record.patientId === req.patient.id || record.patientId === "demo-patient")
    .map(({ id, appointmentId, diagnosis, treatmentNotes, createdAt }) => ({
      id, appointmentId, diagnosis, treatmentNotes, createdAt,
    }));
  const reports = reportRecords
    .filter((report) => report.patientId === req.patient.id)
    .map(({ id, appointmentId, reportName, instructions, status, originalName, createdAt }) => ({
      id, appointmentId, reportName, instructions, status, originalName,
      hasFile: Boolean(reportRecords.find((item) => item.id === id)?.storedName), createdAt,
    }));
  res.json({ records, reports });
});

// Private download route: only the assigned doctor or the report's patient can download.
app.get("/api/reports/:id/download", authenticateMedicalViewer, (req, res) => {
  const report = reportRecords.find((item) => item.id === req.params.id);
  if (!report || !report.storedName || !report.storedPath) {
    return res.status(404).json({ message: "Report file not found." });
  }

  const allowed = req.viewer.role === "doctor"
    ? report.doctorId === req.viewer.id
    : report.patientId === req.viewer.id;
  if (!allowed) {
    return res.status(403).json({ message: "You are not authorized to access this report." });
  }
  if (!fs.existsSync(report.storedPath)) {
    return res.status(404).json({ message: "The report file is missing from server storage." });
  }
  return res.download(report.storedPath, report.originalName || "medical-report");
});
/* TASK5_MEDICAL_REPORTS_END */


/* TASK 8: DEMO MEDICINE PURCHASE AND PAYMENT */

// Demo medicine catalogue. Prices are calculated on the server.
const medicineCatalogue = [
  {
    id: "MED001",
    name: "Paracetamol 500 mg",
    description: "Demo pain and fever medicine",
    price: 30
  },
  {
    id: "MED002",
    name: "Cetirizine 10 mg",
    description: "Demo allergy medicine",
    price: 45
  },
  {
    id: "MED003",
    name: "Vitamin C 500 mg",
    description: "Demo vitamin supplement",
    price: 80
  },
  {
    id: "MED004",
    name: "Antacid Tablets",
    description: "Demo antacid medicine",
    price: 60
  }
];

// In-memory demo data. Orders reset when the backend restarts.
const demoOrders = [];

// Only medicines prescribed by a doctor are available for purchase.
app.get("/api/medicines/prescribed", authenticatePatient, (req, res) => {
  const prescriptions = prescriptionRecords.filter(p => p.patientId === req.patient.id);
  const byMedicine = new Map();
  for (const prescription of prescriptions) {
    for (const item of prescription.items) {
      byMedicine.set(item.medicineId, {
        ...item, id: item.medicineId, prescriptionId: prescription.id,
        prescribedAt: prescription.createdAt
      });
    }
  }
  res.json({ medicines: [...byMedicine.values()], prescriptions });
});

// Create an order using server-side prices.
app.post(
  "/api/medicine-orders",
  authenticatePatient,
  (req, res) => {
    const items = req.body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "Select at least one prescribed medicine."
      });
    }

    const prescribedIds = [...new Set(prescriptionRecords
      .filter(p => p.patientId === req.patient.id)
      .flatMap(p => p.items.map(item => item.medicineId)))];
    const quantities = new Map();

    for (const item of items) {
      const { medicineId, quantity } = item || {};

      if (
        typeof medicineId !== "string" ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return res.status(400).json({
          message: "Each medicine needs a valid quantity between 1 and 20."
        });
      }

      if (quantities.has(medicineId)) {
        return res.status(400).json({
          message: "Duplicate medicine entries are not allowed."
        });
      }

      if (!prescribedIds.includes(medicineId)) {
        return res.status(403).json({
          message: "You can purchase only medicines prescribed to you."
        });
      }

      const medicine = medicineCatalogue.find(
        entry => entry.id === medicineId
      );

      if (!medicine) {
        return res.status(404).json({
          message: "Medicine not found."
        });
      }

      quantities.set(medicineId, quantity);
    }

    const orderItems = [...quantities.entries()].map(
      ([medicineId, quantity]) => {
        const medicine = medicineCatalogue.find(
          entry => entry.id === medicineId
        );

        return {
          medicineId: medicine.id,
          name: medicine.name,
          unitPrice: medicine.price,
          quantity,
          subtotal: medicine.price * quantity
        };
      }
    );

    const totalAmount = orderItems.reduce(
      (total, item) => total + item.subtotal,
      0
    );

    const order = {
      id: crypto.randomUUID(),
      patientId: req.patient.id,
      items: orderItems,
      totalAmount,
      paymentStatus: "Pending",
      paymentMode: "Demo simulation",
      createdAt: new Date().toISOString()
    };

    demoOrders.push(order);

    return res.status(201).json({
      message: "Order created. Proceed to demo payment.",
      order: {
        id: order.id,
        items: order.items,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus
      }
    });
  }
);

// Simulate payment. This does not charge money.
app.post(
  "/api/medicine-orders/:id/pay-demo",
  authenticatePatient,
  (req, res) => {
    const order = demoOrders.find(
      item =>
        item.id === req.params.id &&
        item.patientId === req.patient.id
    );

    if (!order) {
      return res.status(404).json({
        message: "Order not found."
      });
    }

    if (order.paymentStatus === "Paid (Demo)") {
      return res.status(409).json({
        message: "This demo order has already been paid.",
        order
      });
    }

    if (order.paymentStatus !== "Pending") {
      return res.status(409).json({
        message: "This order cannot be paid."
      });
    }

    // Simulated success; no real payment is processed.
    order.paymentStatus = "Paid (Demo)";
    order.paymentReference = `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    order.paidAt = new Date().toISOString();

    return res.json({
      message: "Demo payment successful. No real money was charged.",
      payment: {
        status: order.paymentStatus,
        reference: order.paymentReference,
        amount: order.totalAmount,
        paidAt: order.paidAt
      },
      order
    });
  }
);

// Patient can see only their own medicine orders.
app.get(
  "/api/medicine-orders/me",
  authenticatePatient,
  (req, res) => {
    const orders = demoOrders.filter(
      order => order.patientId === req.patient.id
    );

    return res.json({ orders });
  }
);


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
