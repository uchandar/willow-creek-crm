import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  fmtDate,
  fmtTime,
  localToday,
  meetingState,
  MEETING_STATE_LABEL,
  MEETING_TYPES,
  WEEKDAYS,
  type AttendanceSummary,
  type Meeting,
  type MeetingSeries,
} from "../api";
import { useAuth } from "../AuthContext";


export default function Meetings() {
  const navigate = useNavigate();
  const { staff } = useAuth();
  const isAdmin = staff?.role === "admin";
  const today = localToday();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  function load() {
    api.get("/meetings").then(setMeetings).catch((e) => setError(e.message));
  }
  useEffect(load, []);
  useEffect(() => {
    api.get(`/meetings/summary?days=${days}&to=${today}`).then(setSummary).catch(() => {});
  }, [days, today]);

  const todays = meetings.filter((m) => m.meeting_date === today && m.status !== "cancelled");
  const upcoming = meetings.filter((m) => m.meeting_date > today && m.status !== "cancelled").reverse().slice(0, 3);
  const past = meetings.filter((m) => m.meeting_date < today || (m.meeting_date === today && m.status === "cancelled"));

  async function startAdHocHouseMeeting() {
    setStarting(true);
    try {
      const { id } = await api.post("/meetings", { meeting_type: "house", meeting_date: today, required: true });
      navigate(`/meetings/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start meeting");
      setStarting(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Meetings &amp; attendance</h1>
          <p className="muted">House meetings are required. Scan residents' QR badges at each meeting to record attendance.</p>
        </div>
        <div className="head-actions">
          <Link to="/qr-badges" className="btn-secondary">
            Print QR badges
          </Link>
          <Link to="/calendar" className="btn-primary">
            Open calendar
          </Link>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="card today-card">
        <h3>Today</h3>
        {todays.length === 0 ? (
          <div className="today-empty">
            <span className="muted">No meetings scheduled today.</span>
            <button className="btn-secondary btn-sm" disabled={starting} onClick={startAdHocHouseMeeting}>
              Start an unscheduled house meeting
            </button>
          </div>
        ) : (
          <ul className="plain-list">
            {todays.map((m) => (
              <li key={m.id}>
                <span>
                  <strong>{m.title}</strong>
                  {m.start_time ? ` · ${fmtTime(m.start_time)}` : ""}
                  {m.location ? ` · ${m.location}` : ""}
                  {m.required ? <span className="tag tag-required">required</span> : null}
                  <span className="muted small"> · {m.attendee_count} checked in</span>
                </span>
                <Link to={`/meetings/${m.id}`} className="btn-primary btn-sm">
                  Open &amp; scan
                </Link>
              </li>
            ))}
          </ul>
        )}
        {upcoming.length > 0 && (
          <p className="muted small" style={{ marginTop: 10 }}>
            Next:{" "}
            {upcoming.map((m, i) => (
              <span key={m.id}>
                {i > 0 && " · "}
                <Link to={`/meetings/${m.id}`}>
                  {m.title} {fmtDate(m.meeting_date)}
                  {m.start_time ? ` ${fmtTime(m.start_time)}` : ""}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>

      <ScheduleCard isAdmin={isAdmin} onChange={load} />

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
            {fmtDate(summary.from)} – {fmtDate(summary.to)} · {summary.houseMeetingsHeld} house meeting
            {summary.houseMeetingsHeld === 1 ? "" : "s"} held. Required attendance counts meetings held while the
            resident lived in the house.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Resident</th>
                  <th>Required meetings</th>
                  <th>Unexcused</th>
                  <th>Excused</th>
                  <th>Outside (AA/NA/etc.)</th>
                  <th>Last attended</th>
                </tr>
              </thead>
              <tbody>
                {summary.residents.map((r) => {
                  const pct = r.required_total ? Math.round((r.required_attended / r.required_total) * 100) : null;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/residents/${r.id}?tab=meetings`}>
                          {r.first_name} {r.last_name}
                        </Link>
                      </td>
                      <td>
                        {r.required_attended} / {r.required_total}
                        {pct !== null && (
                          <span className={`tag tag-gap ${pct === 100 ? "tag-ci-ok" : pct >= 75 ? "tag-pay-due" : "tag-ci-flagged"}`}>
                            {pct}%
                          </span>
                        )}
                      </td>
                      <td>{r.unexcused > 0 ? <span className="tag tag-ci-flagged">{r.unexcused}</span> : "0"}</td>
                      <td>{r.excused}</td>
                      <td>{r.outside}</td>
                      <td>{r.last_meeting ? fmtDate(r.last_meeting) : "—"}</td>
                    </tr>
                  );
                })}
                {summary.residents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No active residents.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Past meetings</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Meeting</th>
              <th>Status</th>
              <th>Attended</th>
            </tr>
          </thead>
          <tbody>
            {past.map((m) => {
              const st = meetingState(m, today);
              return (
                <tr key={m.id}>
                  <td>
                    {fmtDate(m.meeting_date)}
                    {m.start_time ? ` · ${fmtTime(m.start_time)}` : ""}
                  </td>
                  <td>
                    <Link to={`/meetings/${m.id}`}>{m.title}</Link>
                    <div className="muted small">
                      {MEETING_TYPES[m.meeting_type] || m.meeting_type}
                      {m.required ? " · required" : ""}
                    </div>
                  </td>
                  <td>
                    <span className={`tag tag-state-${st}`}>{MEETING_STATE_LABEL[st]}</span>
                  </td>
                  <td>{m.attendee_count}</td>
                </tr>
              );
            })}
            {past.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No past meetings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleCard({ isAdmin, onChange }: { isAdmin: boolean; onChange: () => void }) {
  const [series, setSeries] = useState<MeetingSeries[]>([]);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    api.get("/meetings/series").then(setSeries).catch((e) => setErr(e.message));
  }
  useEffect(load, []);

  async function stop(s: MeetingSeries) {
    if (!confirm(`Stop "${s.title}" on ${WEEKDAYS[s.weekday]}s? Upcoming occurrences with no check-ins will be removed; past records are kept.`)) return;
    await api.put(`/meetings/series/${s.id}`, { active: false });
    load();
    onChange();
  }

  const active = series.filter((s) => s.active);

  return (
    <div className="card">
      <div className="card-head-row">
        <h3>Standing schedule</h3>
        {isAdmin && !adding && (
          <button className="btn-link small" onClick={() => setAdding(true)}>
            Add recurring meeting
          </button>
        )}
      </div>
      {err && <div className="alert">{err}</div>}
      {active.length === 0 && !adding && (
        <p className="muted small">
          No recurring meetings yet. {isAdmin ? "Add the weekly house meeting so it appears on the calendar automatically." : "An admin can add the weekly house meeting."}
        </p>
      )}
      <ul className="plain-list">
        {active.map((s) =>
          editId === s.id ? (
            <li key={s.id}>
              <SeriesForm
                initial={s}
                onCancel={() => setEditId(null)}
                onSaved={() => {
                  setEditId(null);
                  load();
                  onChange();
                }}
              />
            </li>
          ) : (
            <li key={s.id}>
              <span>
                <strong>{s.title}</strong> — every {WEEKDAYS[s.weekday]}
                {s.start_time ? ` at ${fmtTime(s.start_time)}` : ""}
                {s.location ? ` · ${s.location}` : ""}
                {s.required ? <span className="tag tag-required">required</span> : <span className="tag tag-general tag-gap">optional</span>}
              </span>
              {isAdmin && (
                <span className="absent-actions">
                  <button className="btn-link small" onClick={() => setEditId(s.id)}>
                    Edit
                  </button>
                  <button className="btn-link small" onClick={() => stop(s)}>
                    Stop
                  </button>
                </span>
              )}
            </li>
          )
        )}
      </ul>
      {adding && (
        <SeriesForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
            onChange();
          }}
        />
      )}
    </div>
  );
}

function SeriesForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: MeetingSeries;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState(initial?.meeting_type || "house");
  const [title, setTitle] = useState(initial?.title || "Weekly house meeting");
  const [weekday, setWeekday] = useState(String(initial?.weekday ?? 0));
  const [start, setStart] = useState(initial?.start_time || "19:00");
  const [end, setEnd] = useState(initial?.end_time || "20:00");
  const [location, setLocation] = useState(initial?.location || "");
  const [required, setRequired] = useState(initial ? !!initial.required : true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { title, start_time: start, end_time: end, location, required };
      if (initial) await api.put(`/meetings/series/${initial.id}`, body);
      else await api.post("/meetings/series", { ...body, meeting_type: type, weekday: Number(weekday) });
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <form className="form-grid series-form" onSubmit={submit}>
      {!initial && (
        <label>
          Type
          <select value={type} onChange={(e) => { setType(e.target.value); setRequired(e.target.value === "house"); }}>
            {Object.entries(MEETING_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      {!initial && (
        <label>
          Every
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Start
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label>
        End
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <label>
        Location
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Living room" />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Required for all residents
      </label>
      <div className="span-2 form-actions">
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : initial ? "Save changes" : "Add to schedule"}
        </button>
        <button type="button" className="btn-link" onClick={onCancel}>
          Cancel
        </button>
        {initial && <span className="muted small">Changes apply to upcoming meetings that haven't started.</span>}
      </div>
      {err && <div className="alert span-2">{err}</div>}
    </form>
  );
}
