
import { useCallback, useEffect, useState } from "react";
import "./Booking.css";
import MedicinePurchase from "./MedicinePurchase";
const API = "http://localhost:5000/api";


function getToday() {
  const date = new Date();
  const year = date.getFullYear();  
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
function splitAppointments(appointments) {
  const today = getToday();

  const upcoming = [];
  const past = [];

  appointments.forEach((appointment) => {
    const date = String(appointment.date || "").slice(0, 10);
    const status = String(appointment.status || "").toLowerCase();

    if (status === "cancelled" || !date || date < today) {
      past.push(appointment);
    } else {
      upcoming.push(appointment);
    }
  });

  upcoming.sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
  );

  past.sort((a, b) =>
    `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
  );

  return { upcoming, past };
}
const DEMO_MEDICAL_RECORDS = [
  {
    id: "demo-record-1",
    diagnosis: "Seasonal allergic rhinitis",
    treatmentNotes:
      "Demo: Avoid known allergens and follow the clinician's advice.",
    createdAt: "2026-09-12T10:30:00.000Z",
  },
  {
    id: "demo-record-2",
    diagnosis: "Routine health check-up",
    treatmentNotes:
      "Demo: General examination completed. Follow-up as advised.",
    createdAt: "2026-10-05T09:00:00.000Z",
  },
];
export default function Booking({ user, onLogout }) {
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(getToday());
  const [slots, setSlots] = useState([]);
  const [time, setTime] = useState("");
  const [appointments, setAppointments] = useState([]);
  const [message, setMessage] = useState("");
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [medicalReports, setMedicalReports] = useState([]);
  const [medicalHistoryLoading, setMedicalHistoryLoading] = useState(true);
  const [medicalHistoryError, setMedicalHistoryError] = useState("");
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const [billsError, setBillsError] = useState("");
  const [expandedBillId, setExpandedBillId] = useState(null);

  const token = localStorage.getItem("token");

  const request = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body && !(options.body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
          ...options.headers,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || `Request failed (${response.status}).`
        );
      }
      

      return data;
    },
    [token]
  );

  const loadDoctors = useCallback(async () => {
    try {
      const data = await request("/doctors");
      const doctorList = Array.isArray(data.doctors) ? data.doctors : [];

      setDoctors(doctorList);
      setDoctorId((current) =>
        doctorList.some((doctor) => doctor.id === current)
          ? current
          : doctorList[0]?.id || ""
      );

      if (doctorList.length === 0) {
        setMessage("No doctors are currently available.");
      }
    } catch (error) {
      setDoctors([]);
      setMessage(`Unable to load doctors: ${error.message}`);
    } finally {
      setLoadingDoctors(false);
    }
  }, [request]);

  const loadAppointments = useCallback(async () => {
    try {
      const data = await request("/appointments/me");
      setAppointments(
        Array.isArray(data.appointments) ? data.appointments : []
      );
    } catch (error) {
      setMessage(`Unable to load appointments: ${error.message}`);
    }
  }, [request]);
  
const loadMedicalHistory = useCallback(async () => {
  setMedicalHistoryLoading(true);
  setMedicalHistoryError("");

  try {
    const data = await request("/patient/medical-records");

    setMedicalRecords(Array.isArray(data.records) ? data.records : []);
    setMedicalReports(Array.isArray(data.reports) ? data.reports : []);
  } catch (error) {
    setMedicalHistoryError(
      error.message || "Unable to load medical history."
    );
  } finally {
    setMedicalHistoryLoading(false);
  }
}, [request]);

const loadBills = useCallback(async () => {
  setBillsLoading(true);
  setBillsError("");

  try {
    const data = await request("/patient/bills/me");
    setBills(Array.isArray(data.bills) ? data.bills : []);
  } catch (error) {
    setBillsError(error.message || "Unable to load bills.");
  } finally {
    setBillsLoading(false);
  }
}, [request]);
const loadDemoBills = useCallback(async () => {
  setBillsLoading(true);
  setBillsError("");

  try {
    await request("/patient/bills/demo", {
      method: "POST",
      body: JSON.stringify({}),
    });

    await loadBills();
  } catch (error) {
    setBillsError(error.message || "Unable to create demo bills.");
  } finally {
    setBillsLoading(false);
  }
}, [request, loadBills]);

  const loadSlots = useCallback(async () => {
    if (!doctorId || !date) {
      setSlots([]);
      return;
    }

    try {
      const data = await request(
        `/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`
      );

      setSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch (error) {
      setSlots([]);
      setMessage(`Unable to load time slots: ${error.message}`);
    } finally {
      setLoadingSlots(false);
    }
  }, [doctorId, date, request]);

  useEffect(() => {
    Promise.resolve().then(loadDoctors);
    Promise.resolve().then(loadAppointments);
    Promise.resolve().then(loadMedicalHistory);
    Promise.resolve().then(loadBills);
  }, [loadDoctors, loadAppointments,loadMedicalHistory,loadBills]);
  useEffect(() => {
    loadMedicalHistory();
}, []);

  useEffect(() => {
    Promise.resolve().then(loadSlots);
  }, [loadSlots]);

  async function bookAppointment(event) {
    event.preventDefault();

    if (!doctorId || !date || !time) {
      setMessage("Please select a doctor, date and available time.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const data = await request("/appointments", {
        method: "POST",
        body: JSON.stringify({ doctorId, date, time }),
      });

      setMessage(data.message || "Appointment booked successfully.");
      setTime("");

      await Promise.all([loadAppointments(), loadSlots()]);
    } catch (error) {
      setMessage(error.message);
      await loadSlots();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAppointment(appointment) {
    const confirmed = window.confirm(
      `Are you sure you want to cancel your appointment with ${appointment.doctorName} on ${appointment.date} at ${appointment.time}?`
    );

    if (!confirmed) return;

    setCancellingId(appointment.id);
    setMessage("");

    try {
      const data = await request(
        `/appointments/${encodeURIComponent(appointment.id)}/cancel`,
        { method: "PATCH" }
      );

      setMessage(data.message || "Appointment cancelled successfully.");

      await Promise.all([loadAppointments(), loadSlots()]);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCancellingId("");
    }
  }

  const selectedDoctor = doctors.find(
    (doctor) => doctor.id === doctorId
  );

  return (
    <main className="booking-page">
      <header className="booking-header">
        <div>
          <p className="booking-eyebrow">CAREPOINT HOSPITAL</p>
          <h1>Appointment Booking</h1>
          <p>
            Welcome, {user?.name || "Patient"}. Find a doctor and book your
            visit.
          </p>
        </div>

        <button
          className="logout-button"
          onClick={onLogout}
          type="button"
        >
          Log out
        </button>
      </header>

      {message && (
        <div
          className="booking-message"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}

      <section className="booking-panel">
        <h2>Book an appointment</h2>

        <form onSubmit={bookAppointment}>
          <label htmlFor="doctor">Choose a doctor</label>

          <select
            id="doctor"
            value={doctorId}
            onChange={(event) => {
              setDoctorId(event.target.value);
              setTime("");
            }}
            required
            disabled={loadingDoctors || doctors.length === 0}
          >
            {doctors.length === 0 && (
              <option value="">No doctors available</option>
            )}

            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name} — {doctor.specialty}
              </option>
            ))}
          </select>

          {selectedDoctor && (
            <p className="doctor-info">
              {selectedDoctor.experience} years of experience
            </p>
          )}

          <label htmlFor="date">Appointment date</label>
          <input
            id="date"
            type="date"
            value={date}
            min={getToday()}
            onChange={(event) => {
              setDate(event.target.value);
              setTime("");
            }}
            required
          />

          <label>Available time slots</label>

          {loadingDoctors || loadingSlots ? (
            <p>Loading available time slots...</p>
          ) : slots.length === 0 ? (
            <p>No slots available for this date. Try another date.</p>
          ) : (
            <div className="slot-grid">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className={time === slot ? "slot selected" : "slot"}
                  aria-pressed={time === slot}
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
            disabled={
              loadingDoctors ||
              loadingSlots ||
              submitting ||
              !doctorId ||
              !date ||
              !time
            }
          >
            {submitting ? "Booking..." : "Confirm appointment"}
          </button>
        </form>
      </section>

     
<section className="booking-panel">
  <h2>Upcoming appointments</h2>

  {(() => {
    const { upcoming } = splitAppointments(appointments);

    return upcoming.length === 0 ? (
      <p>You have no upcoming appointments.</p>
    ) : (
      <div className="appointment-list">
        {upcoming.map((appointment) => (
          <article className="appointment-card" key={appointment.id}>
            <div className="appointment-details">
              <h3>{appointment.doctorName}</h3>
              <p>{appointment.specialty}</p>
              <p>{appointment.date} at {appointment.time}</p>
            </div>

            <div className="appointment-actions">
              <span className="appointment-status booked">
                {appointment.status}
              </span>

              <button
                className="cancel-button"
                type="button"
                onClick={() => cancelAppointment(appointment)}
                disabled={Boolean(cancellingId)}
              >
                {cancellingId === appointment.id
                  ? "Cancelling..."
                  : "Cancel appointment"}
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  })()}
</section>

<section className="booking-panel">
  <h2>Past appointments</h2>

  {(() => {
    const { past } = splitAppointments(appointments);

    return past.length === 0 ? (
      <p>You have no past appointments.</p>
    ) : (
      <div className="appointment-list">
        {past.map((appointment) => (
          <article className="appointment-card" key={appointment.id}>
            <div className="appointment-details">
              <h3>{appointment.doctorName}</h3>
              <p>{appointment.specialty}</p>
              <p>{appointment.date} at {appointment.time}</p>
            </div>

            <div className="appointment-actions">
              <span
                className={`appointment-status ${
                  String(appointment.status).toLowerCase() === "cancelled"
                    ? "cancelled"
                    : "booked"
                }`}
              >
                {appointment.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    );
  })()}
</section>

<section className="booking-panel medical-history-panel">
  <h2>My Medical History</h2>

  {medicalHistoryLoading ? (
    <p>Loading your medical history...</p>
  ) : medicalHistoryError ? (
    <div role="alert">
      <p>{medicalHistoryError}</p>
      <button type="button" onClick={loadMedicalHistory}>
        Retry
      </button>
    </div>
  ) : (
    <>
      <h3>Diagnoses and Treatment Notes</h3>

      {medicalRecords.length === 0 ? (
        <p>No medical history records are available yet.</p>
      ) : (
        <div className="medical-history-list">
          {medicalRecords.map((record) => (
            <article className="medical-history-card" key={record.id}>
              <h4>{record.diagnosis || "Diagnosis not recorded"}</h4>

              <p>
                <strong>Treatment notes:</strong>{" "}
                {record.treatmentNotes || "No treatment notes recorded."}
              </p>

              {record.appointmentId && (
                <p>
                  <strong>Appointment ID:</strong> {record.appointmentId}
                </p>
              )}

              <p className="medical-history-date">
                <strong>Recorded:</strong>{" "}
                {record.createdAt
                  ? new Date(record.createdAt).toLocaleString()
                  : "Date unavailable"}
              </p>
            </article>
          ))}
        </div>
      )}

      <h3>Medical Reports</h3>

      {medicalReports.length === 0 ? (
        <p>No medical reports are available yet.</p>
      ) : (
        <div className="medical-history-list">
          {medicalReports.map((report) => (
            <article className="medical-history-card" key={report.id}>
              <h4>{report.reportName || "Medical report"}</h4>

              <p>
                <strong>Status:</strong> {report.status || "Unknown"}
              </p>

              {report.instructions && (
                <p>
                  <strong>Instructions:</strong> {report.instructions}
                </p>
              )}

              {report.createdAt && (
                <p className="medical-history-date">
                  <strong>Recorded:</strong>{" "}
                  {new Date(report.createdAt).toLocaleString()}
                </p>
              )}

              {report.originalName && (
                <p>
                  <strong>File:</strong> {report.originalName}
                </p>
              )}

              {report.hasFile && (
                <p>Report file available.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  )}
</section>

<section className="booking-panel patient-bills-panel">
  <h2>My Bills</h2>
  <p>View your medicine orders, bill details, and payment status.</p>

  {billsLoading ? (
    <p>Loading your bills...</p>
  ) : billsError ? (
    <div role="alert">
      <p>{billsError}</p>
      <button type="button" onClick={loadBills}>
        Retry
      </button>
    </div>
  ) : bills.length === 0 ? (
    <div className="empty-bills">
      <p>You don't have any bills yet.</p>
      <p>
        Load sample bills to see how pending and completed bills
        appear in your account.
      </p>

      <button
        type="button"
        onClick={loadDemoBills}
        disabled={billsLoading}
      >
        {billsLoading ? "Loading demo bills..." : "Load Demo Bills"}
      </button>
    </div>
  ) : (
    <div className="appointment-list">
      {bills.map((bill) => (
        <article className="appointment-card" key={bill.id}>
          <div className="appointment-details">
            <h3>{bill.billNumber}</h3>

            <p>
              Date:{" "}
              {bill.date
                ? new Date(bill.date).toLocaleDateString()
                : "Unavailable"}
            </p>

            <p>
              Total: ₹{Number(bill.totalAmount).toFixed(2)}
            </p>

            <p>
              Payment status:{" "}
              <strong>{bill.paymentStatus}</strong>
            </p>
          </div>

          <div className="appointment-actions">
            <button
              type="button"
              onClick={() =>
                setExpandedBillId(
                  expandedBillId === bill.id ? null : bill.id
                )
              }
              aria-expanded={expandedBillId === bill.id}
            >
              {expandedBillId === bill.id
                ? "Hide details"
                : "View bill"}
            </button>
          </div>

          {expandedBillId === bill.id && (
            <div className="bill-details">
              <h4>Bill details</h4>

              <div className="bill-items">
                {bill.items.map((item, index) => (
                  <div
                    className="bill-item"
                    key={`${bill.id}-${item.name}-${index}`}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <p>
                        {item.quantity} × ₹
                        {Number(item.unitPrice).toFixed(2)}
                      </p>
                    </div>

                    <strong>
                      ₹{Number(item.subtotal).toFixed(2)}
                    </strong>
                  </div>
                ))}
              </div>

              <p>
                <strong>Total amount: </strong>
                ₹{Number(bill.totalAmount).toFixed(2)}
              </p>

              {bill.paidAt && (
                <p>
                  <strong>Paid on: </strong>
                  {new Date(bill.paidAt).toLocaleString()}
                </p>
              )}

              {bill.paymentStatus === "Paid" && (
                <p>This order is marked as paid in the demo system.</p>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  )}
</section>

      <MedicinePurchase />
    </main>
  );
}
