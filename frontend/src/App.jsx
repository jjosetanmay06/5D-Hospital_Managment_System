
import { useState } from "react";
import "./App.css";

const API = "http://localhost:5000/api/auth";

export default function App() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: ""
  });
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const response = await fetch(
        `${API}/${mode === "register" ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Something went wrong.");
        return;
      }

      if (mode === "register") {
        setMessage("Account created! You can now log in.");
        setMode("login");
      } else {
        localStorage.setItem("token", data.token);
        setUser(data.user);
        setMessage("");
      }
    } catch {
      setMessage("Cannot connect to the server. Check the backend.");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    setMessage("You have logged out.");
  }

  if (user) {
    return (
      <main className="page">
        <section className="card welcome">
          <div className="logo">+</div>
          <h1>Welcome, {user.name}!</h1>
          <p>You are logged in to CarePoint Hospital.</p>
          <p>{user.email}</p>
          <button onClick={logout}>Log out</button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <div className="logo">+</div>
        <p className="eyebrow">CAREPOINT HOSPITAL</p>
        <h1>
          {mode === "register" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="subtitle">
          {mode === "register"
            ? "Register to access your patient account."
            : "Log in to manage your hospital appointments."}
        </p>

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>Full name</label>
              <input
                name="name"
                value={form.name}
                onChange={update}
                placeholder="Enter your full name"
                required
              />

              <label>Phone number</label>
              <input
                name="phone"
                value={form.phone}
                onChange={update}
                placeholder="10-digit mobile number"
                inputMode="numeric"
                pattern="[0-9]{10}"
                required
              />
            </>
          )}

          <label>Email address</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={update}
            placeholder="you@example.com"
            required
          />

          <label>Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={update}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />

          <button type="submit">
            {mode === "register" ? "Create account" : "Log in"}
          </button>
        </form>

        {message && <p className="message">{message}</p>}

        <p className="switch">
          {mode === "register"
            ? "Already have an account?"
            : "New patient?"}{" "}
          <button
            className="text-button"
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setMessage("");
            }}
          >
            {mode === "register" ? "Log in" : "Create an account"}
          </button>
        </p>
      </section>
    </main>
  );
}
