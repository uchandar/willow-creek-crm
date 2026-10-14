import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fmtUtc, MEETING_TYPES, type MeetingDetail as MeetingDetailT } from "../api";
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
      if (r.already) {
        setFlash({ kind: "dup", text: `${name} is already checked in`, at: Date.now() });
        beep(true);
      } else {
        setFlash({ kind: "ok", text: `✓ ${name} checked in`, at: Date.now() });
        beep(true);
      }
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

  async function removeAttendance(attendanceId: number, name: string) {
    if (!confirm(`Remove ${name} from this meeting's attendance?`)) return;
    await api.del(`/meetings/${id}/attendance/${attendanceId}`);
    load();
  }

  async function deleteMeeting() {
    if (!meeting) return;
    if (!confirm(`Delete "${meeting.title}" and its ${meeting.attendees.length} check-ins?`)) return;
    await api.del(`/meetings/${id}`);
    navigate("/meetings");
  }

  if (error) return <div className="alert">{error}</div>;
  if (!meeting) return <div className="muted">Loading...</div>;

  const total = meeting.attendees.length + meeting.notCheckedIn.length;

  return (
    <div>
      <Link to="/meetings" className="back-link">
        ← Back to meetings
      </Link>
      <div className="page-head">
        <div>
          <h1>{meeting.title}</h1>
          <p className="muted">
            {MEETING_TYPES[meeting.meeting_type] || meeting.meeting_type} · {meeting.meeting_date}
            {meeting.start_time ? ` at ${meeting.start_time}` : ""}
            {meeting.location ? ` · ${meeting.location}` : ""}
          </p>
        </div>
        <div className="attendance-count">
          <div className="stat-value">
            {meeting.attendees.length}
            <span className="muted"> / {total}</span>
          </div>
          <div className="stat-label">active residents checked in</div>
        </div>
      </div>

      <div className="checkin-grid">
        <div className="card">
          <h3>Scan resident badges</h3>
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
          <h3>Not checked in ({meeting.notCheckedIn.length})</h3>
          {meeting.notCheckedIn.length === 0 ? (
            <p className="muted small">Everyone is checked in.</p>
          ) : (
            <ul className="plain-list">
              {meeting.notCheckedIn.map((r) => (
                <li key={r.id}>
                  <span>
                    {r.first_name} {r.last_name}
                  </span>
                  <button className="btn-link" disabled={busy} onClick={() => checkIn({ resident_id: r.id })}>
                    Check in manually
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
                  <Link to={`/residents/${a.resident_id}`}>
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

      {isAdmin && (
        <p style={{ marginTop: 24 }}>
          <button className="btn-link danger-link" onClick={deleteMeeting}>
            Delete this meeting
          </button>
        </p>
      )}
    </div>
  );
}
