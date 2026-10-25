import { useState } from "react";
import Booking from "./Booking";
import DoctorDashboard from "./DoctorDashboard";
import "./App.css";

const API = "http://localhost:5000/api/auth";

export default function App() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");

    let endpoint;
    let body;

    if (mode === "register") {
      endpoint = "register";
      body = form;
    } else if (mode === "verify") {
      endpoint = "verify-otp";
      body = { phone: form.phone, otp };
    } else if (mode === "doctor-login") {
      endpoint = "doctor-login";
      body = { email: form.email, password: form.password };
    } else {
      endpoint = "login";
      body = { email: form.email, password: form.password };
    }

    try {
      const response = await fetch(`${API}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.message || "Request failed.");
        return;
      }

      if (mode === "register") {
        setMode("verify");
        setOtp("");
        setMessage("Registration successful. Enter the OTP shown in the backend terminal.");
      } else if (mode === "verify") {
        setMode("login");
        setMessage("Phone verified successfully. You can now log in.");
      } else {
        localStorage.setItem("token", data.token);
        setUser(data.user);
        setMessage("");
      }
    } catch {
      setMessage("Cannot connect to the backend. Check that the server is running.");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    setMode("login");
    setForm({ name: "", email: "", phone: "", password: "" });
    setOtp("");
    setMessage("You have logged out.");
  }

  if (user?.role === "doctor") {
    return <DoctorDashboard user={user} onLogout={logout} />;
  }

  if (user) {
    return <Booking user={user} onLogout={logout} />;
  }

  const doctorMode = mode === "doctor-login";

  return (
    <main className="page">
      <section className="card">
        <div className="logo">+</div>
        <p className="eyebrow">CAREPOINT HOSPITAL</p>
        <h1>
          {mode === "register"
            ? "Create your account"
            : mode === "verify"
              ? "Verify your phone"
              : doctorMode
                ? "Doctor login"
                : "Welcome back"}
        </h1>
        <p className="subtitle">
          {mode === "register"
            ? "Register to access your patient account."
            : mode === "verify"
              ? `Enter the six-digit OTP for ${form.phone}.`
              : doctorMode
                ? "Authorized clinical staff only."
                : "Log in to manage your hospital appointments."}
        </p>

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>Full name</label>
              <input name="name" value={form.name} onChange={update}
                placeholder="Enter your full name" required />
              <label>Phone number</label>
              <input name="phone" value={form.phone} onChange={update}
                placeholder="10-digit mobile number" inputMode="numeric"
                pattern="[0-9]{10}" maxLength={10} required />
            </>
          )}

          {mode === "verify" && (
            <>
              <label>Registered phone number</label>
              <input value={form.phone} readOnly />
              <label>Six-digit OTP</label>
              <input value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter OTP" inputMode="numeric"
                autoComplete="one-time-code" maxLength={6}
                pattern="[0-9]{6}" required />
            </>
          )}

          {mode !== "verify" && (
            <>
              <label>Email address</label>
              <input type="email" name="email" value={form.email} onChange={update}
                placeholder="you@example.com" autoComplete="username" required />
              <label>Password</label>
              <input type="password" name="password" value={form.password} onChange={update}
                placeholder={doctorMode ? "Doctor password" : "At least 8 characters"}
                minLength={doctorMode ? undefined : 8}
                autoComplete={doctorMode ? "current-password" : "current-password"} required />
            </>
          )}

          <button type="submit">
            {mode === "register" ? "Create account"
              : mode === "verify" ? "Verify OTP"
                : doctorMode ? "Log in as doctor" : "Log in"}
          </button>
        </form>

        {message && <p className="message" role="status">{message}</p>}

        {mode === "verify" ? (
          <p className="switch">
            Wrong phone number?{" "}
            <button type="button" className="text-button" onClick={() => {
              setMode("register"); setOtp(""); setMessage("");
            }}>Register again</button>
          </p>
        ) : (
          <p className="switch">
            {doctorMode ? "Are you a patient?" : mode === "register" ? "Already have an account?" : "New patient?"}{" "}
            <button type="button" className="text-button" onClick={() => {
              setMode(doctorMode ? "login" : mode === "register" ? "login" : "register");
              setMessage("");
            }}>
              {doctorMode ? "Patient login" : mode === "register" ? "Log in" : "Create an account"}
            </button>
          </p>
        )}

        {mode !== "verify" && !doctorMode && (
          <p className="switch">
            Hospital staff?{" "}
            <button type="button" className="text-button" onClick={() => {
              setMode("doctor-login"); setMessage("");
            }}>Doctor login</button>
          </p>
        )}
      </section>
    </main>
  );
}
