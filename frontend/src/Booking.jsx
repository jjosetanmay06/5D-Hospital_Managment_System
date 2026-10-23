
import { useEffect, useState } from "react";
import "./Booking.css";

const API = "http://localhost:5000/api";

function getToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Booking({ user, onLogout }) {
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(getToday());
  const [slots, setSlots] = useState([]);
  const [time, setTime] = useState("");
  const [appointments, setAppointments] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem("token");

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }

    return data;
  }

  async function loadDoctors() {
    try {
      const data = await request("/doctors");
      setDoctors(data.doctors);

      if (data.doctors.length > 0) {
        setDoctorId(current => current || data.doctors[0].id);
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadAppointments() {
    try {
      const data = await request("/appointments/me");
      setAppointments(data.appointments);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadSlots() {
    if (!doctorId || !date) {
      setSlots([]);
      return;
    }

    setLoading(true);
    setMessage("");
    setTime("");

    try {
      const data = await request(
        `/doctors/${doctorId}/slots?date=${encodeURIComponent(date)}`
      );
      setSlots(data.slots);
    } catch (error) {
      setSlots([]);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDoctors();
    loadAppointments();
  }, []);

  useEffect(() => {
    loadSlots();
  }, [doctorId, date]);

  async function bookAppointment(event) {
    event.preventDefault();
    setMessage("");

    try {
      const data = await request("/appointments", {
        method: "POST",
        body: JSON.stringify({ doctorId, date, time })
      });

      setMessage(data.message);
      setTime("");
      await loadAppointments();

      // Refresh the slot list after booking.
      const slotsData = await request(
        `/doctors/${doctorId}/slots?date=${encodeURIComponent(date)}`
      );
      setSlots(slotsData.slots);
    } catch (error) {
      async function refreshSlots() {
  try {
    const data = await request(
      `/doctors/${doctorId}/slots?date=${encodeURIComponent(date)}`
    );
    setSlots(data.slots);
  } catch {
    setSlots([]);
  }
}

// in bookAppointment's catch:
setMessage(error.message);
await refreshSlots();
      
    }
  }

  return (
    <main className="booking-page">
      <header className="booking-header">
        <div>
          <p className="booking-eyebrow">CAREPOINT HOSPITAL</p>
          <h1>Appointment Booking</h1>
          <p>Welcome, {user.name}. Find a doctor and book your visit.</p>
        </div>

        <button className="logout-button" onClick={onLogout}>
          Log out
        </button>
      </header>

      <section className="booking-panel">
        <h2>Book an appointment</h2>

        <form onSubmit={bookAppointment}>
          <label htmlFor="doctor">Choose a doctor</label>
          <select
            id="doctor"
            value={doctorId}
            onChange={event => setDoctorId(event.target.value)}
            required
          >
            {doctors.map(doctor => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name} — {doctor.specialty}
              </option>
            ))}
          </select>

          {doctors.find(doctor => doctor.id === doctorId) && (
            <p className="doctor-info">
              {doctors.find(doctor => doctor.id === doctorId).experience}
              {" "}years of experience
            </p>
          )}

          <label htmlFor="date">Appointment date</label>
          <input
            id="date"
            type="date"
            value={date}
            min={getToday()}
            onChange={event => setDate(event.target.value)}
            required
          />

          <label>Available time slots</label>

          {loading ? (
            <p>Loading available slots...</p>
          ) : slots.length === 0 ? (
            <p>No slots available for this date. Try another date.</p>
          ) : (
            <div className="slot-grid">
              {slots.map(slot => (
                <button
                  key={slot}
                  type="button"
                  className={time === slot ? "slot selected" : "slot"}
                  onClick={() => setTime(slot)}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}

          <button
            className="book-button"
            type="submit"
            disabled={!doctorId || !date || !time}
          >
            Confirm appointment
          </button>
        </form>

        {message && (
          <p className="booking-message" role="status">
            {message}
          </p>
        )}
      </section>

      <section className="booking-panel">
        <h2>My appointments</h2>

        {appointments.length === 0 ? (
          <p>You have no appointments yet.</p>
        ) : (
          <div className="appointment-list">
            {appointments.map(appointment => (
              <article className="appointment-card" key={appointment.id}>
                <div>
                  <h3>{appointment.doctorName}</h3>
                  <p>{appointment.specialty}</p>
                  <p>
                    {appointment.date} at {appointment.time}
                  </p>
                </div>

                <span className="appointment-status">
                  {appointment.status}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
