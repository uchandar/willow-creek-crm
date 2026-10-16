import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  fmtDate,
  fmtTime,
  fmtUtc,
  meetingState,
  MEETING_STATE_LABEL,
  MEETING_TYPES,
  type MeetingDetail as MeetingDetailT,
} from "../api";
import { useAuth } from "../AuthContext";
import QrScanner from "../QrScanner";

type Flash = { kind: "ok" | "dup" | "err"; text: string; at: number };

function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    osc.onended = () => ctx.close();
  } catch {
    /* sound is optional */
  }
  if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]);
}


export default function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { staff } = useAuth();
  const isAdmin = staff?.role === "admin";
  const [meeting, setMeeting] = useState<MeetingDetailT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const typedRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .get(`/meetings/${id}`)
      .then(setMeeting)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash((f) => (f && f.at === flash.at ? null : f)), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  async function checkIn(body: { qr_token?: string; resident_id?: number }) {
    setBusy(true);
    try {
      const r = await api.post(`/meetings/${id}/checkin`, body);
      const name = `${r.resident.first_name} ${r.resident.last_name}`;
      setFlash({ kind: r.already ? "dup" : "ok", text: r.already ? `${name} is already checked in` : `✓ ${name} checked in`, at: Date.now() });
      beep(true);
      load();
    } catch (e) {
      setFlash({ kind: "err", text: e instanceof Error ? e.message : "Check-in failed", at: Date.now() });
      beep(false);
    } finally {
      setBusy(false);
    }
  }

  function handleScan(text: string) {
    if (!/^WCSL:/i.test(text.trim())) {
      setFlash({ kind: "err", text: "That QR code isn't a Willow Creek resident badge.", at: Date.now() });
      beep(false);
      return;
    }
    checkIn({ qr_token: text.trim() });
  }

  // Handheld USB/Bluetooth scanners "type" the code followed by Enter.
  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const v = typed.trim();
    if (!v) return;
    setTyped("");
    checkIn({ qr_token: v });
    typedRef.current?.focus();
  }

  async function update(body: Record<string, unknown>) {
    try {
      await api.put(`/meetings/${id}`, body);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function cancelMeeting() {
    const reason = prompt("Reason for cancelling this meeting? (optional)");
    if (reason === null) return;
    update({ status: "cancelled", cancel_reason: reason || null });
  }

  async function excuse(residentId: number, name: string) {
    const reason = prompt(`Reason ${name} is excused from this meeting:`);
    if (!reason || !reason.trim()) return;
    await api.post(`/meetings/${id}/excusals`, { resident_id: residentId, reason });
    load();
  }

  async function unexcuse(residentId: number) {
    await api.del(`/meetings/${id}/excusals/${residentId}`);
    load();
  }

  async function removeAttendance(attendanceId: number, name: string) {
    if (!confirm(`Remove ${name} from this meeting's attendance?`)) return;
    await api.del(`/meetings/${id}/attendance/${attendanceId}`);
    load();
  }

  async function deleteMeeting() {
    if (!meeting) return;
    if (!confirm(`Delete "${meeting.title}" and its ${meeting.attendees.length} check-ins?`)) return;
    await api.del(`/meetings/${id}`);
    navigate("/calendar");
  }

  if (error) return <div className="alert">{error}</div>;
  if (!meeting) return <div className="muted">Loading...</div>;

  const st = meetingState(meeting, meeting.today);
  const expected = meeting.attendees.length + meeting.notCheckedIn.length;
  const cancelled = meeting.status === "cancelled";
  const isFuture = meeting.meeting_date > meeting.today;
  const excusedCount = meeting.notCheckedIn.filter((r) => r.excusal_id).length;
  const unexcusedCount = meeting.absencesCount ? meeting.notCheckedIn.length - excusedCount : 0;

  return (
    <div>
      <Link to={`/calendar?m=${meeting.meeting_date.slice(0, 7)}`} className="back-link">
        ← Back to calendar
      </Link>
      <div className="page-head">
        <div>
          <h1>
            {meeting.title}{" "}
            <span className={`tag tag-state-${st} tag-big`}>{MEETING_STATE_LABEL[st]}</span>
          </h1>
          <p className="muted">
            {MEETING_TYPES[meeting.meeting_type] || meeting.meeting_type} · {fmtDate(meeting.meeting_date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {meeting.start_time ? ` · ${fmtTime(meeting.start_time)}` : ""}
            {meeting.end_time ? `–${fmtTime(meeting.end_time)}` : ""}
            {meeting.location ? ` · ${meeting.location}` : ""}
            {meeting.series_id ? " · Standing schedule" : ""}
          </p>
          <label className="checkbox-label small required-toggle">
            <input
              type="checkbox"
              checked={!!meeting.required}
              onChange={(e) => update({ required: e.target.checked })}
            />
            Required — residents who don't attend are marked absent
          </label>
        </div>
        <div className="attendance-count">
          <div className="stat-value">
            {meeting.attendees.length}
            <span className="muted"> / {expected}</span>
          </div>
          <div className="stat-label">residents attended</div>
          {meeting.absencesCount && (
            <div className="small">
              {unexcusedCount > 0 && <span className="tag tag-ci-flagged">{unexcusedCount} unexcused</span>}
              {excusedCount > 0 && <span className="tag tag-general tag-gap">{excusedCount} excused</span>}
            </div>
          )}
        </div>
      </div>

      <div className="status-actions">
        {meeting.status === "scheduled" && !isFuture && (
          <button className="btn-secondary btn-sm" onClick={() => update({ status: "held" })}>
            Mark as held
          </button>
        )}
        {meeting.status !== "cancelled" && meeting.attendees.length === 0 && (
          <button className="btn-secondary btn-sm" onClick={cancelMeeting}>
            Cancel meeting
          </button>
        )}
        {meeting.status === "cancelled" && (
          <button className="btn-secondary btn-sm" onClick={() => update({ status: "scheduled" })}>
            Un-cancel
          </button>
        )}
        {(st === "not_recorded" || st === "past") && (
          <span className="warn-text small">
            This meeting's date has passed but nothing was recorded. Check residents in, mark it held, or cancel it.
          </span>
        )}
      </div>

      {!cancelled && (
        <div className="checkin-grid">
          <div className="card">
            <h3>Scan resident QR badges</h3>
            <QrScanner onScan={handleScan} paused={busy} />
            {flash && <div className={`scan-flash scan-${flash.kind}`}>{flash.text}</div>}
            <form className="inline-form scan-typed" onSubmit={submitTyped}>
              <input
                ref={typedRef}
                placeholder="Handheld scanner / badge code"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
              <button className="btn-secondary" type="submit" disabled={busy}>
                Check in
              </button>
            </form>
          </div>

          <div className="card">
            <h3>
              {meeting.absencesCount ? "Absent" : "Not checked in"} ({meeting.notCheckedIn.length})
            </h3>
            {meeting.notCheckedIn.length === 0 ? (
              <p className="muted small">Everyone is checked in.</p>
            ) : (
              <ul className="plain-list">
                {meeting.notCheckedIn.map((r) => {
                  const name = `${r.first_name} ${r.last_name}`;
                  return (
                    <li key={r.id} className="absent-row">
                      <div>
                        <Link to={`/residents/${r.id}?tab=meetings`}>{name}</Link>
                        {r.excusal_id ? (
                          <div className="small">
                            <span className="tag tag-general">excused</span> {r.excusal_reason}
                            {r.excused_by_name ? <span className="muted"> — {r.excused_by_name}</span> : null}
                          </div>
                        ) : meeting.absencesCount && meeting.required ? (
                          <div className="small">
                            <span className="tag tag-ci-flagged">unexcused</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="absent-actions">
                        {r.status === "active" && (
                          <button className="btn-link small" disabled={busy} onClick={() => checkIn({ resident_id: r.id })}>
                            Check in
                          </button>
                        )}
                        {!!meeting.required &&
                          (r.excusal_id ? (
                            <button className="btn-link small" onClick={() => unexcuse(r.id)}>
                              Remove excuse
                            </button>
                          ) : (
                            <button className="btn-link small" onClick={() => excuse(r.id, name)}>
                              Excuse
                            </button>
                          ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <h2>Checked in ({meeting.attendees.length})</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Resident</th>
              <th>Time</th>
              <th>Method</th>
              <th>Recorded by</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {meeting.attendees.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to={`/residents/${a.resident_id}?tab=meetings`}>
                    {a.first_name} {a.last_name}
                  </Link>
                </td>
                <td>{fmtUtc(a.checked_in_at, { hour: "numeric", minute: "2-digit" })}</td>
                <td>
                  <span className={`tag ${a.method === "qr" ? "tag-ci-ok" : "tag-general"}`}>
                    {a.method === "qr" ? "QR scan" : "manual"}
                  </span>
                </td>
                <td>{a.recorded_by_name || "—"}</td>
                {isAdmin && (
                  <td>
                    <button className="btn-link" onClick={() => removeAttendance(a.id, `${a.first_name} ${a.last_name}`)}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {meeting.attendees.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="muted">
                  No one checked in yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!cancelled && <MinutesCard meeting={meeting} onSave={update} />}
      {!cancelled && <ActionItems meeting={meeting} onChange={load} />}

      {isAdmin && !meeting.series_id && (
        <p style={{ marginTop: 24 }}>
          <button className="btn-link danger-link" onClick={deleteMeeting}>
            Delete this event
          </button>
        </p>
      )}
    </div>
  );
}

function MinutesCard({
  meeting,
  onSave,
}: {
  meeting: MeetingDetailT;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const initial = {
    led_by: meeting.led_by || "",
    topics: meeting.topics || "",
    announcements: meeting.announcements || "",
    issues: meeting.issues || "",
    minutes_notes: meeting.minutes_notes || "",
  };
  const hasMinutes = Object.values(initial).some(Boolean);
  const [editing, setEditing] = useState(!hasMinutes);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
    setEditing(false);
  }

  const fields: Array<[keyof typeof initial, string, string]> = [
    ["topics", "Topics discussed", "Chore rotation, curfew reminders, step work..."],
    ["announcements", "Announcements", "New residents, upcoming events, rule changes..."],
    ["issues", "House issues raised", "Concerns, conflicts, maintenance..."],
    ["minutes_notes", "Other notes", ""],
  ];

  return (
    <div className="card minutes-card">
      <div className="card-head-row">
        <h3>Meeting minutes</h3>
        {hasMinutes && !editing && (
          <button className="btn-link small" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <form className="form-grid" onSubmit={save}>
          <label className="span-2">
            Led / chaired by
            <input value={form.led_by} onChange={(e) => setForm({ ...form, led_by: e.target.value })} placeholder="House manager or resident" />
          </label>
          {fields.map(([k, label, ph]) => (
            <label key={k} className="span-2">
              {label}
              <textarea rows={3} value={form[k]} placeholder={ph} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </label>
          ))}
          <div className="span-2 form-actions">
            <button className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save minutes"}
            </button>
            {hasMinutes && (
              <button type="button" className="btn-link" onClick={() => { setForm(initial); setEditing(false); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <dl className="minutes-view">
          <dt>Led by</dt>
          <dd>{meeting.led_by || "—"}</dd>
          {fields.map(([k, label]) => (
            <div key={k} className="minutes-row">
              <dt>{label}</dt>
              <dd className="pre">{meeting[k] || "—"}</dd>
            </div>
          ))}
          <p className="muted small">
            Recorded by {meeting.minutes_by_name || "—"} · {fmtUtc(meeting.minutes_updated_at)}
          </p>
        </dl>
      )}
    </div>
  );
}

function ActionItems({ meeting, onChange }: { meeting: MeetingDetailT; onChange: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [residentId, setResidentId] = useState("");
  const [saving, setSaving] = useState(false);
  const people = [...meeting.attendees.map((a) => ({ id: a.resident_id, name: `${a.first_name} ${a.last_name}` })),
    ...meeting.notCheckedIn.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}` }))]
    .sort((a, b) => a.name.localeCompare(b.name));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post(`/meetings/${meeting.id}/action-items`, {
        title,
        due_date: due || null,
        resident_id: residentId ? Number(residentId) : null,
      });
      setTitle("");
      setDue("");
      setResidentId("");
      onChange();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(taskId: number, status: string) {
    await api.put(`/tasks/${taskId}`, { status: status === "done" ? "open" : "done" });
    onChange();
  }

  return (
    <div className="card">
      <h3>Action items</h3>
      <p className="muted small">Follow-ups from this meeting are added to Tasks.</p>
      <form className="inline-form" onSubmit={add}>
        <input placeholder="Action item" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={residentId} onChange={(e) => setResidentId(e.target.value)}>
          <option value="">House-wide</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn-primary" disabled={saving}>
          Add
        </button>
      </form>
      <ul className="note-list">
        {meeting.actionItems.map((t) => (
          <li key={t.id} className={t.status === "done" ? "task-done" : ""}>
            <div className="note-list-head">
              <label className="task-check">
                <input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t.id, t.status)} />
                {t.title}
              </label>
              {t.first_name && <span className="muted small">{t.first_name} {t.last_name}</span>}
              {t.due_date && <span className="muted small">due {t.due_date}</span>}
            </div>
          </li>
        ))}
        {meeting.actionItems.length === 0 && <li className="muted">No action items yet.</li>}
      </ul>
    </div>
  );
}
