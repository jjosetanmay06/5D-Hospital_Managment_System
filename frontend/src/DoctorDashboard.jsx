
import { useCallback, useEffect, useState } from "react";
import "./DoctorDashboard.css";

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
    Promise.resolve().then(loadAppointments);
  }, [loadAppointments]); 

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
    </main>
  );
}
