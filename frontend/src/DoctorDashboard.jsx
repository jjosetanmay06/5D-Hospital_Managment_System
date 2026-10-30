
import { useCallback, useEffect, useState } from "react";
import "./DoctorDashboard.css";
import BedAvailability from "./BedAvailability";

const API = "http://localhost:5000/api";

export default function DoctorDashboard({ user, onLogout }) {
  const [appointments, setAppointments] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [reportName, setReportName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogue, setCatalogue] = useState([]);
  const emptyMedicine = () => ({ medicineId: "", dosage: "", frequency: "", instructions: "" });
  const [prescriptionItems, setPrescriptionItems] = useState([emptyMedicine()]);
  const [prescriptionNotes, setPrescriptionNotes] = useState("");

  const token = localStorage.getItem("token");

  const request = useCallback(
    async (path, options = {}) => {
      const headers = {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      };

      if (options.body && !(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`${API}${path}`, {
        ...options,
        headers,
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

  const loadAppointments = useCallback(async () => {
    try {
      const data = await request("/doctor/appointments");
      const list = Array.isArray(data.appointments)
        ? data.appointments
        : [];

      setAppointments(list);
      setSelectedId((current) =>
        list.some((item) => item.id === current)
          ? current
          : list[0]?.id || ""
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
  let active = true;

  const refreshAppointments = async () => {
    if (!active) return;
    await loadAppointments();
  };

  refreshAppointments();

  const intervalId = setInterval(refreshAppointments, 5000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
}, [loadAppointments]); 

  useEffect(() => {
    let active = true;
    request("/medicines/catalogue")
      .then(data => { if (active) setCatalogue(Array.isArray(data.medicines) ? data.medicines : []); })
      .catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [request]);

  const selected = appointments.find(
    (item) => item.id === selectedId
  );

  async function saveDiagnosis(event) {
    event.preventDefault();

    if (!selected) return;

    setSaving(true);
    setMessage("");

    try {
      const data = await request(
        `/doctor/appointments/${encodeURIComponent(selected.id)}/diagnoses`,
        {
          method: "POST",
          body: JSON.stringify({ diagnosis, treatmentNotes }),
        }
      );

      setDiagnosis("");
      setTreatmentNotes("");
      setMessage(data.message || "Diagnosis saved.");
      await loadAppointments();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveReport(event) {
    event.preventDefault();

    if (!selected) return;

    setSaving(true);
    setMessage("");

    try {
      const body = new FormData();
      body.append("reportName", reportName);
      body.append("instructions", instructions);

      if (file) {
        body.append("file", file);
      }

      const data = await request(
        `/doctor/appointments/${encodeURIComponent(selected.id)}/reports`,
        {
          method: "POST",
          body,
        }
      );

      setReportName("");
      setInstructions("");
      setFile(null);
      event.target.reset();

      setMessage(data.message || "Report details saved.");
      await loadAppointments();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function savePrescription(event) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setMessage("");
    try {
      const data = await request(
        `/doctor/appointments/${encodeURIComponent(selected.id)}/prescriptions`,
        { method: "POST", body: JSON.stringify({ items: prescriptionItems, notes: prescriptionNotes }) }
      );
      setPrescriptionItems([emptyMedicine()]);
      setPrescriptionNotes("");
      setMessage(data.message || "Prescription saved.");
      await loadAppointments();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadReport(report) {
    try {
      const response = await fetch(
        `${API}/reports/${encodeURIComponent(report.id)}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.message || "Unable to download report."
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = report.originalName || "medical-report";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="doctor-page">
      <header className="doctor-header">
        <div>
          <p className="doctor-eyebrow">
            CAREPOINT HOSPITAL · CLINICAL PORTAL
          </p>

          <h1>Medical Diagnosis &amp; Reports</h1>

          <p>
            Welcome, {user?.name || "Doctor"}. Access is limited to
            your assigned appointments.
          </p>
        </div>

        <button
          className="doctor-logout"
          onClick={onLogout}
          type="button"
        >
          Log out
        </button>
      </header>

      <BedAvailability token={token} />

      {message && (
        <div
          className="doctor-message"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}

      <section className="doctor-panel">
        <h2>Your appointments</h2>

        {loading ? (
          <p>Loading appointments...</p>
        ) : appointments.length === 0 ? (
          <p>No appointments are currently assigned to this doctor.</p>
        ) : (
          <div className="doctor-appointment-grid">
            <div className="doctor-appointment-list">
              {appointments.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  className={`doctor-appointment ${
                    selectedId === appointment.id ? "active" : ""
                  }`}
                  onClick={() => setSelectedId(appointment.id)}
                >
                  <strong>{appointment.patientName}</strong>
                  <span>
                    {appointment.date} · {appointment.time}
                  </span>
                  <span>{appointment.status}</span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="doctor-patient-detail">
                <h3>{selected.patientName}</h3>

                <p>
                  <strong>Email:</strong>{" "}
                  {selected.patientEmail || "Not available"}
                </p>

                <p>
                  <strong>Appointment:</strong> {selected.date} at{" "}
                  {selected.time}
                </p>

                <p>
                  <strong>Status:</strong> {selected.status}
                </p>

                <h3>Medical history</h3>

                {selected.medicalHistory?.length ? (
                  selected.medicalHistory.map((item) => (
                    <article className="medical-item" key={item.id}>
                      <strong>{item.diagnosis}</strong>
                      <p>
                        {item.treatmentNotes ||
                          "No treatment notes recorded."}
                      </p>
                      <small>
                        {new Date(item.createdAt).toLocaleString()}
                      </small>
                    </article>
                  ))
                ) : (
                  <p>No previous diagnoses recorded for this patient.</p>
                )}

                <h3>Reports and scans</h3>

                {selected.reports?.length ? (
                  selected.reports.map((report) => (
                    <article className="medical-item" key={report.id}>
                      <strong>{report.reportName}</strong>

                      <p>
                        {report.instructions ||
                          "No additional instructions."}
                      </p>

                      <small>Status: {report.status}</small>

                      {report.hasFile && (
                        <button
                          className="inline-action"
                          type="button"
                          onClick={() => downloadReport(report)}
                        >
                          Download attached file
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <p>No reports or scans recorded.</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {selected && (
        <div className="doctor-form-grid">
          <section className="doctor-panel">
            <h2>Enter diagnosis</h2>

            <form onSubmit={saveDiagnosis}>
              <label htmlFor="diagnosis">Diagnosis</label>

              <textarea
                id="diagnosis"
                value={diagnosis}
                onChange={(event) => setDiagnosis(event.target.value)}
                maxLength={3000}
                rows={3}
                required
              />

              <label htmlFor="treatmentNotes">Treatment notes</label>

              <textarea
                id="treatmentNotes"
                value={treatmentNotes}
                onChange={(event) =>
                  setTreatmentNotes(event.target.value)
                }
                maxLength={5000}
                rows={4}
              />

              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save diagnosis"}
              </button>
            </form>
          </section>

          <section className="doctor-panel">
            <h2>Record a report or scan</h2>

            <form onSubmit={saveReport}>
              <label htmlFor="reportName">Report / scan name</label>

              <input
                id="reportName"
                value={reportName}
                onChange={(event) =>
                  setReportName(event.target.value)
                }
                maxLength={200}
                placeholder="e.g. Blood test, X-ray"
                required
              />

              <label htmlFor="instructions">
                Instructions / details
              </label>

              <textarea
                id="instructions"
                value={instructions}
                onChange={(event) =>
                  setInstructions(event.target.value)
                }
                maxLength={3000}
                rows={3}
              />

              <label htmlFor="reportFile">
                Attach PDF, JPG or PNG (optional, max 5 MB)
              </label>

              <input
                id="reportFile"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) =>
                  setFile(event.target.files?.[0] || null)
                }
              />

              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save report details"}
              </button>
            </form>
          </section>
        </div>
      )}

      {selected && (
        <section className="doctor-panel prescription-panel">
          <h2>Create prescription</h2>
          <p>Patient: <strong>{selected.patientName}</strong></p>
          <form onSubmit={savePrescription}>
            {prescriptionItems.map((item, index) => (
              <fieldset className="prescription-item" key={index}>
                <legend>Medicine {index + 1}</legend>
                <label htmlFor={`prescribed-medicine-${index}`}>Medicine</label>
                <select id={`prescribed-medicine-${index}`} required value={item.medicineId}
                  onChange={event => setPrescriptionItems(current => current.map((entry, i) =>
                    i === index ? { ...entry, medicineId: event.target.value } : entry))}>
                  <option value="">Choose a medicine</option>
                  {catalogue.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {[["dosage", "Dosage"], ["frequency", "Frequency"], ["instructions", "Instructions"]].map(([field, label]) => (
                  <label key={field}>{label}
                    <input required value={item[field]} maxLength={field === "instructions" ? 1000 : 200}
                      onChange={event => setPrescriptionItems(current => current.map((entry, i) =>
                        i === index ? { ...entry, [field]: event.target.value } : entry))} />
                  </label>
                ))}
                {prescriptionItems.length > 1 && (
                  <button type="button" onClick={() => setPrescriptionItems(current => current.filter((_, i) => i !== index))}>
                    Remove medicine
                  </button>
                )}
              </fieldset>
            ))}
            <button type="button" disabled={prescriptionItems.length >= 20}
              onClick={() => setPrescriptionItems(current => [...current, emptyMedicine()])}>
              Add another medicine
            </button>
            <label htmlFor="prescription-notes">Additional notes</label>
            <textarea id="prescription-notes" rows={3} maxLength={3000}
              value={prescriptionNotes} onChange={event => setPrescriptionNotes(event.target.value)} />
            <button type="submit" disabled={saving || !catalogue.length || selected.status !== "Booked"}>
              {saving ? "Saving..." : "Save prescription"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
