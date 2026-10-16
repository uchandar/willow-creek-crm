import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  fmtDate,
  fmtTime,
  localToday,
  meetingState,
  MEETING_STATE_LABEL,
  MEETING_TYPES,
  WEEKDAYS,
  type CalendarData,
  type Meeting,
} from "../api";

function monthKey(d: string) {
  return d.slice(0, 7); // YYYY-MM
}
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function addDays(d: string, n: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
// The 6-week grid (Sunday-start) covering the month.
function gridDays(ym: string) {
  const first = `${ym}-01`;
  const start = addDays(first, -new Date(first + "T00:00:00Z").getUTCDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}


export default function Calendar() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = localToday();
  const month = /^\d{4}-\d{2}$/.test(params.get("m") || "") ? (params.get("m") as string) : monthKey(today);
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "house" | "outside">("all");
  const [addDate, setAddDate] = useState<string | null>(null);

  const days = useMemo(() => gridDays(month), [month]);

  const load = useCallback(() => {
    api
      .get(`/meetings/calendar?from=${days[0]}&to=${days[days.length - 1]}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [days]);
  useEffect(load, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of data?.meetings || []) {
      if (typeFilter === "house" && m.meeting_type !== "house") continue;
      if (typeFilter === "outside" && m.meeting_type === "house") continue;
      map.set(m.meeting_date, [...(map.get(m.meeting_date) || []), m]);
    }
    return map;
  }, [data, typeFilter]);

  const serverToday = data?.today || today;
  const monthMeetings = (data?.meetings || []).filter(
    (m) => monthKey(m.meeting_date) === month && byDay.get(m.meeting_date)?.includes(m)
  );
  const houseHeld = monthMeetings.filter((m) => m.meeting_type === "house" && m.status === "held").length;
  const houseNotRecorded = monthMeetings.filter(
    (m) => m.meeting_type === "house" && meetingState(m, serverToday) === "not_recorded"
  ).length;

  const monthLabel = new Date(month + "-01T12:00:00").toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Calendar</h1>
          <p className="muted">
            House meetings and the meetings and events residents attend. Open any event to scan residents in.
          </p>
        </div>
        <div className="head-actions">
          <Link to="/meetings" className="btn-secondary">
            Attendance &amp; schedule
          </Link>
          <button className="btn-primary" onClick={() => setAddDate(today)}>
            Add event
          </button>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      {addDate && (
        <QuickAdd
          key={addDate}
          date={addDate}
          onCancel={() => setAddDate(null)}
          onCreated={(id) => navigate(`/meetings/${id}`)}
        />
      )}

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="btn-secondary btn-sm" onClick={() => setParams({ m: addMonths(month, -1) })} aria-label="Previous month">
            ‹
          </button>
          <h2 className="cal-title">{monthLabel}</h2>
          <button className="btn-secondary btn-sm" onClick={() => setParams({ m: addMonths(month, 1) })} aria-label="Next month">
            ›
          </button>
          {month !== monthKey(today) && (
            <button className="btn-link small" onClick={() => setParams({})}>
              Today
            </button>
          )}
        </div>
        <div className="filter-row cal-filters">
          {(
            [
              ["all", "All events"],
              ["house", "House meetings"],
              ["outside", "AA / NA / other"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={`chip ${typeFilter === k ? "chip-active" : ""}`} onClick={() => setTypeFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="muted small cal-month-stats">
        {houseHeld} house meeting{houseHeld === 1 ? "" : "s"} held this month
        {houseNotRecorded > 0 && (
          <>
            {" · "}
            <span className="warn-text">
              {houseNotRecorded} past house meeting{houseNotRecorded === 1 ? "" : "s"} not recorded
            </span>
          </>
        )}
      </p>

      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="cal-dow">
            {d.slice(0, 3)}
          </div>
        ))}
        {days.map((d) => {
          const events = byDay.get(d) || [];
          const outside = monthKey(d) !== month;
          return (
            <div
              key={d}
              className={`cal-cell ${outside ? "cal-outside" : ""} ${d === today ? "cal-today" : ""}`}
              onDoubleClick={() => setAddDate(d)}
            >
              <div className="cal-cell-head">
                <span className="cal-daynum">{Number(d.slice(8))}</span>
                <button className="cal-add" title={`Add event on ${fmtDate(d)}`} onClick={() => setAddDate(d)}>
                  +
                </button>
              </div>
              {events.map((m) => (
                <EventChip key={m.id} m={m} today={serverToday} activeResidents={data?.activeResidents || 0} />
              ))}
            </div>
          );
        })}
      </div>

      {/* Agenda list: the main view on phones, a summary under the grid on desktop */}
      <div className="cal-agenda">
        <h2>Agenda</h2>
        {monthMeetings.length === 0 && <p className="muted">No events this month.</p>}
        <ul className="plain-list">
          {monthMeetings.map((m) => {
            const st = meetingState(m, serverToday);
            return (
              <li key={m.id} className={st === "cancelled" ? "agenda-cancelled" : ""}>
                <Link to={`/meetings/${m.id}`} className="agenda-link">
                  <span className="agenda-date">
                    {fmtDate(m.meeting_date)}
                    {m.start_time ? ` · ${fmtTime(m.start_time)}` : ""}
                  </span>
                  <span className="agenda-title">
                    <span className={`type-dot type-${m.meeting_type}`} />
                    {m.title}
                    {m.required ? <span className="tag tag-required">required</span> : null}
                  </span>
                </Link>
                <span className={`tag tag-state-${st}`}>
                  {st === "held" ? `${m.attendee_count} attended` : MEETING_STATE_LABEL[st]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function EventChip({ m, today, activeResidents }: { m: Meeting; today: string; activeResidents: number }) {
  const st = meetingState(m, today);
  return (
    <Link
      to={`/meetings/${m.id}`}
      className={`cal-event type-bg-${m.meeting_type} cal-state-${st}`}
      title={`${m.title}${m.location ? ` · ${m.location}` : ""} — ${MEETING_STATE_LABEL[st]}`}
    >
      <span className="cal-event-time">{m.start_time ? fmtTime(m.start_time).replace(":00", "") : ""}</span>
      <span className="cal-event-title">{m.title}</span>
      <span className="cal-event-meta">
        {st === "held" && (
          <>
            ✓ {m.attendee_count}
            {m.meeting_type === "house" && activeResidents ? `/${activeResidents}` : ""}
          </>
        )}
        {st === "not_recorded" && "!"}
        {st === "cancelled" && "✕"}
        {m.required && st !== "cancelled" ? <span className="req-star" title="Required">★</span> : null}
      </span>
    </Link>
  );
}

function QuickAdd({
  date,
  onCancel,
  onCreated,
}: {
  date: string;
  onCancel: () => void;
  onCreated: (id: number) => void;
}) {
  const [type, setType] = useState("house");
  const [title, setTitle] = useState("");
  const [d, setD] = useState(date);
  const [start, setStart] = useState("19:00");
  const [location, setLocation] = useState("");
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { id } = await api.post("/meetings", {
        meeting_type: type,
        title: title || null,
        meeting_date: d,
        start_time: start || null,
        location: location || null,
        required,
      });
      onCreated(id);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not add event");
      setSaving(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <label>
        Type
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setRequired(e.target.value === "house");
          }}
        >
          {Object.entries(MEETING_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input placeholder={MEETING_TYPES[type]} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Date
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} required />
      </label>
      <label>
        Start time
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label>
        Location
        <input value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Required for all residents (absences tracked)
      </label>
      <div className="span-2 form-actions">
        <button className="btn-primary" disabled={saving}>
          {saving ? "Adding..." : "Add & open check-in"}
        </button>
        <button type="button" className="btn-link" onClick={onCancel}>
          Cancel
        </button>
        <span className="muted small">For a weekly house meeting, set a standing schedule on the Meetings page instead.</span>
      </div>
      {err && <div className="alert span-2">{err}</div>}
    </form>
  );
}
