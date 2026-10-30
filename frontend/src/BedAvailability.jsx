
import { useCallback, useEffect, useState } from "react";

const API = "http://localhost:5000/api";

export default function BedAvailability({ token }) {
  const [beds, setBeds] = useState([]);
  const [wards, setWards] = useState([]);
  const [ward, setWard] = useState("All wards");
  const [summary, setSummary] = useState({
    total: 0,
    available: 0,
    occupied: 0,
  });
  const [patientNames, setPatientNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Bed request failed.");
    }

    return data;
  }, [token]);

  const loadBeds = useCallback(async () => {
    try {
      const query =
        ward === "All wards"
          ? ""
          : `?ward=${encodeURIComponent(ward)}`;

      const data = await request(`/beds${query}`);

      setBeds(Array.isArray(data.beds) ? data.beds : []);
      setWards(Array.isArray(data.wards) ? data.wards : []);

      setSummary(
        data.summary || {
          total: 0,
          available: 0,
          occupied: 0,
        }
      );

      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [request, ward]);

  useEffect(() => {
    loadBeds();

    const timer = setInterval(loadBeds, 5000);

    return () => clearInterval(timer);
  }, [loadBeds]);

  async function updateBed(bed, action) {
    setBusyId(bed.id);
    setError("");
    setMessage("");

    try {
      const body =
        action === "allocate"
          ? JSON.stringify({
              patientName: patientNames[bed.id] || "",
            })
          : undefined;

      const data = await request(
        `/beds/${encodeURIComponent(bed.id)}/${action}`,
        {
          method: "PATCH",
          ...(body ? { body } : {}),
        }
      );

      setMessage(data.message || "Bed status updated.");

      if (action === "allocate") {
        setPatientNames((current) => ({
          ...current,
          [bed.id]: "",
        }));
      }

      await loadBeds();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="doctor-panel bed-availability-panel">
      <div className="bed-panel-heading">
        <div>
          <h2>Bed availability</h2>
          <p>
            Live ward-wise bed status. Updates automatically every 5 seconds.
          </p>
        </div>

        <label className="bed-ward-filter">
          Ward

          <select
            className="bed-ward-select"
            value={ward}
            onChange={(event) => {
              setWard(event.target.value);
              setMessage("");
            }}
            aria-label="Filter beds by ward"
          >
            <option value="All wards">All wards</option>

            {wards.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bed-summary-grid">
        <article>
          <span>Total beds</span>
          <strong>{summary.total}</strong>
        </article>

        <article className="bed-summary-available">
          <span>Available</span>
          <strong>{summary.available}</strong>
        </article>

        <article className="bed-summary-occupied">
          <span>Occupied</span>
          <strong>{summary.occupied}</strong>
        </article>
      </div>

      {error && (
        <p className="bed-feedback bed-error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="bed-feedback" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p>Loading bed availability...</p>
      ) : beds.length === 0 ? (
        <p>No beds found for this ward.</p>
      ) : (
        <div className="bed-list">
          {beds.map((bed) => (
            <article
              className={`bed-card ${
                bed.status === "Available"
                  ? "is-available"
                  : "is-occupied"
              }`}
              key={bed.id}
            >
              <div className="bed-card-top">
                <div>
                  <strong>{bed.id}</strong>
                  <span>
                    {bed.ward} · Room {bed.room}
                  </span>
                </div>

                <span
                  className={`bed-status ${
                    bed.status === "Available"
                      ? "available"
                      : "occupied"
                  }`}
                >
                  {bed.status}
                </span>
              </div>

              {bed.status === "Occupied" ? (
                <>
                  <p className="bed-patient">
                    Patient: {bed.patientName || "Not specified"}
                  </p>

                  <button
                    type="button"
                    className="bed-action release"
                    disabled={busyId === bed.id}
                    onClick={() => updateBed(bed, "release")}
                  >
                    {busyId === bed.id
                      ? "Updating..."
                      : "Release bed"}
                  </button>
                </>
              ) : (
                <div className="bed-allocate-row">
                  <input
                    aria-label={`Patient name for bed ${bed.id}`}
                    maxLength={120}
                    placeholder="Patient name"
                    value={patientNames[bed.id] || ""}
                    onChange={(event) =>
                      setPatientNames((current) => ({
                        ...current,
                        [bed.id]: event.target.value,
                      }))
                    }
                  />

                  <button
                    type="button"
                    className="bed-action"
                    disabled={
                      busyId === bed.id ||
                      !(patientNames[bed.id] || "").trim()
                    }
                    onClick={() => updateBed(bed, "allocate")}
                  >
                    {busyId === bed.id
                      ? "Updating..."
                      : "Allocate bed"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="bed-demo-note">
        Demo inventory: bed changes are held in backend memory and reset
        when the backend restarts.
      </p>
    </section>
  );
}
