import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, MEETING_TYPES, type AttendanceSummary, type Meeting } from "../api";

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function Meetings() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState("house");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api.get("/meetings").then(setMeetings).catch((e) => setError(e.message));
  }
  useEffect(load, []);
  useEffect(() => {
    api.get(`/meetings/summary?days=${days}&to=${today()}`).then(setSummary).catch(() => {});
  }, [days]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { id } = await api.post("/meetings", {
        meeting_type: type,
        title: title || null,
        meeting_date: date,
        start_time: time || null,
        location: location || null,
      });
      navigate(`/meetings/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create meeting");
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Meetings</h1>
          <p className="muted">Start a meeting, then scan each resident's QR badge as they arrive.</p>
        </div>
        <Link to="/qr-badges" className="btn-secondary">
          Print QR badges
        </Link>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="card">
        <h3>Start a meeting check-in</h3>
        <form className="inline-form" onSubmit={create}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(MEETING_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <button className="btn-primary" disabled={saving}>
            {saving ? "Starting..." : "Start & scan"}
          </button>
        </form>
      </div>

      <h2>Attendance by resident</h2>
      <div className="filter-row">
        {[7, 30, 90].map((d) => (
          <button key={d} className={`chip ${days === d ? "chip-active" : ""}`} onClick={() => setDays(d)}>
            Last {d} days
          </button>
        ))}
      </div>
      {summary && (
        <>
          <p className="muted small">
            {summary.from} to {summary.to} · {summary.houseMeetingsHeld} house meeting
            {summary.houseMeetingsHeld === 1 ? "" : "s"} held
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Resident</th>
                  <th>Total</th>
                  <th>House meetings</th>
                  <th>Outside (AA/NA/etc.)</th>
                  <th>Last attended</th>
                </tr>
              </thead>
              <tbody>
                {summary.residents.map((r) => {
                  const missedHouse = summary.houseMeetingsHeld - r.house;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/residents/${r.id}`}>
                          {r.first_name} {r.last_name}
                        </Link>
                      </td>
                      <td>{r.attended}</td>
                      <td>
                        {r.house} / {summary.houseMeetingsHeld}
                        {missedHouse > 0 && <span className="tag tag-ci-missed tag-gap">missed {missedHouse}</span>}
                      </td>
                      <td>{r.outside}</td>
                      <td>{r.last_meeting || "—"}</td>
                    </tr>
                  );
                })}
                {summary.residents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No active residents.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Recent meetings</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Meeting</th>
              <th>Type</th>
              <th>Checked in</th>
              <th>Started by</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.meeting_date}
                  {m.start_time ? ` ${m.start_time}` : ""}
                </td>
                <td>
                  <Link to={`/meetings/${m.id}`}>{m.title}</Link>
                  {m.location && <div className="muted small">{m.location}</div>}
                </td>
                <td>{MEETING_TYPES[m.meeting_type] || m.meeting_type}</td>
                <td>{m.attendee_count}</td>
                <td>{m.created_by_name || "—"}</td>
              </tr>
            ))}
            {meetings.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No meetings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
