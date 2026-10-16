const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { logAction } = require("../audit");
const { houseToday } = require("../time");
const { ensureOccurrences, requiredStats, COUNTED_REQUIRED, addDays } = require("../meetingSchedule");

router.use(requireAuth);

const MEETING_TYPES = ["house", "aa", "na", "smart", "celebrate_recovery", "outing", "other"];
const DEFAULT_TITLES = {
  house: "House meeting",
  aa: "AA meeting",
  na: "NA meeting",
  smart: "SMART Recovery",
  celebrate_recovery: "Celebrate Recovery",
  outing: "House outing / event",
  other: "Meeting",
};
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);

const ATTENDEE_COUNT = `(SELECT COUNT(*) FROM meeting_attendance a WHERE a.meeting_id = m.id)`;

// ---------- Standing schedule (recurring weekly meetings) ----------

router.get("/series", (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT s.*, st.name as created_by_name FROM meeting_series s
         LEFT JOIN staff st ON st.id = s.created_by
         ORDER BY s.active DESC, s.weekday, s.start_time`
      )
      .all()
  );
});

router.post("/series", requireAdmin, (req, res) => {
  const b = req.body || {};
  const weekday = Number(b.weekday);
  if (!(weekday >= 0 && weekday <= 6)) return res.status(400).json({ error: "weekday (0-6) is required" });
  const type = MEETING_TYPES.includes(b.meeting_type) ? b.meeting_type : "house";
  const r = db
    .prepare(
      `INSERT INTO meeting_series (title, meeting_type, weekday, start_time, end_time, location, required, start_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      (b.title && String(b.title).trim()) || DEFAULT_TITLES[type],
      type,
      weekday,
      isTime(b.start_time) ? b.start_time : null,
      isTime(b.end_time) ? b.end_time : null,
      b.location || null,
      b.required === false || b.required === 0 ? 0 : 1,
      isDate(b.start_date) ? b.start_date : houseToday(),
      req.session.staffId
    );
  ensureOccurrences(houseToday(), addDays(houseToday(), 60));
  logAction({
    staffId: req.session.staffId,
    action: "create",
    entity: "meeting_series",
    entityId: r.lastInsertRowid,
    summary: `Added standing schedule: ${b.title || DEFAULT_TITLES[type]} every ${dayName(weekday)}${
      isTime(b.start_time) ? ` at ${b.start_time}` : ""
    }`,
  });
  res.status(201).json({ id: r.lastInsertRowid });
});

// Editing a series updates its future, not-yet-held occurrences too.
router.put("/series/:id", requireAdmin, (req, res) => {
  const s = db.prepare("SELECT * FROM meeting_series WHERE id = ?").get(req.params.id);
  if (!s) return res.status(404).json({ error: "Schedule not found" });
  const b = req.body || {};
  const next = {
    title: b.title !== undefined ? String(b.title).trim() || s.title : s.title,
    start_time: b.start_time !== undefined ? (isTime(b.start_time) ? b.start_time : null) : s.start_time,
    end_time: b.end_time !== undefined ? (isTime(b.end_time) ? b.end_time : null) : s.end_time,
    location: b.location !== undefined ? b.location || null : s.location,
    required: b.required !== undefined ? (b.required ? 1 : 0) : s.required,
    active: b.active !== undefined ? (b.active ? 1 : 0) : s.active,
  };
  const today = houseToday();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE meeting_series SET title=@title, start_time=@start_time, end_time=@end_time,
         location=@location, required=@required, active=@active WHERE id=@id`
    ).run({ ...next, id: s.id });
    const futureUntouched = `series_id = @id AND meeting_date >= @today AND status = 'scheduled'
         AND NOT EXISTS (SELECT 1 FROM meeting_attendance a WHERE a.meeting_id = meetings.id)`;
    if (!next.active) {
      db.prepare(`DELETE FROM meetings WHERE ${futureUntouched}`).run({ id: s.id, today });
    } else {
      db.prepare(
        `UPDATE meetings SET title=@title, start_time=@start_time, end_time=@end_time,
           location=@location, required=@required WHERE ${futureUntouched}`
      ).run({ ...next, id: s.id, today });
    }
  });
  tx();
  if (next.active) ensureOccurrences(today, addDays(today, 60));
  logAction({
    staffId: req.session.staffId,
    action: next.active !== s.active ? "status_change" : "update",
    entity: "meeting_series",
    entityId: s.id,
    summary: next.active
      ? `Updated standing schedule: ${next.title} (${dayName(s.weekday)})`
      : `Stopped standing schedule: ${next.title} (${dayName(s.weekday)}); removed upcoming unheld occurrences`,
  });
  res.json({ ok: true });
});

function dayName(n) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][n];
}

// ---------- Calendar ----------

router.get("/calendar", (req, res) => {
  const today = houseToday();
  const from = isDate(req.query.from) ? req.query.from : addDays(today, -31);
  const to = isDate(req.query.to) ? req.query.to : addDays(today, 31);
  ensureOccurrences(from, to);
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.meeting_type, m.meeting_date, m.start_time, m.end_time, m.location,
              m.required, m.status, m.series_id,
              (m.topics IS NOT NULL OR m.minutes_notes IS NOT NULL OR m.led_by IS NOT NULL) as has_minutes,
              ${ATTENDEE_COUNT} as attendee_count
       FROM meetings m
       WHERE m.meeting_date BETWEEN ? AND ?
       ORDER BY m.meeting_date, (m.start_time IS NULL), m.start_time`
    )
    .all(from, to);
  const activeResidents = db.prepare("SELECT COUNT(*) as n FROM residents WHERE status = 'active'").get().n;
  res.json({ from, to, today, activeResidents, meetings: rows });
});

// ---------- List / summary ----------

router.get("/", (req, res) => {
  const today = houseToday();
  ensureOccurrences(addDays(today, -14), addDays(today, 14));
  const rows = db
    .prepare(
      `SELECT m.*, s.name as created_by_name, ${ATTENDEE_COUNT} as attendee_count
       FROM meetings m
       LEFT JOIN staff s ON s.id = m.created_by
       WHERE m.meeting_date <= ?
       ORDER BY m.meeting_date DESC, m.start_time DESC, m.id DESC
       LIMIT 200`
    )
    .all(addDays(today, 14));
  res.json(rows);
});

// Attendance totals per active resident over a date range (default last 7 days).
router.get("/summary", (req, res) => {
  const to = isDate(req.query.to) ? req.query.to : houseToday();
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 7));
  const from = isDate(req.query.from) ? req.query.from : addDays(to, -(days - 1));
  ensureOccurrences(from, to);

  const att = (extra) =>
    `(SELECT COUNT(*) FROM meeting_attendance a JOIN meetings m ON m.id = a.meeting_id
      WHERE a.resident_id = r.id AND m.meeting_date BETWEEN @from AND @to ${extra})`;
  const residents = db
    .prepare(
      `SELECT r.id, r.first_name, r.last_name,
              ${att("")} as attended,
              ${att("AND m.meeting_type = 'house'")} as house,
              ${att("AND m.meeting_type <> 'house'")} as outside,
              (SELECT MAX(m.meeting_date) FROM meeting_attendance a JOIN meetings m ON m.id = a.meeting_id
                WHERE a.resident_id = r.id) as last_meeting
       FROM residents r
       WHERE r.status = 'active'`
    )
    .all({ from, to });
  const stats = new Map(requiredStats(from, to).map((s) => [s.id, s]));
  const merged = residents
    .map((r) => {
      const s = stats.get(r.id) || { required_total: 0, required_attended: 0, excused: 0, unexcused: 0 };
      return { ...r, ...s, id: r.id };
    })
    .sort((a, b) => b.unexcused - a.unexcused || a.attended - b.attended || a.last_name.localeCompare(b.last_name));
  const houseMeetingsHeld = db
    .prepare(
      `SELECT COUNT(*) as n FROM meetings
       WHERE meeting_type = 'house' AND status = 'held' AND meeting_date BETWEEN ? AND ?`
    )
    .get(from, to).n;
  res.json({ from, to, houseMeetingsHeld, residents: merged });
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const type = MEETING_TYPES.includes(b.meeting_type) ? b.meeting_type : "house";
  const required = b.required !== undefined ? (b.required ? 1 : 0) : type === "house" ? 1 : 0;
  const result = db
    .prepare(
      `INSERT INTO meetings (title, meeting_type, meeting_date, start_time, end_time, location, required, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      (b.title && String(b.title).trim()) || DEFAULT_TITLES[type],
      type,
      isDate(b.meeting_date) ? b.meeting_date : houseToday(),
      isTime(b.start_time) ? b.start_time : null,
      isTime(b.end_time) ? b.end_time : null,
      b.location || null,
      required,
      req.session.staffId
    );
  res.status(201).json({ id: result.lastInsertRowid });
});

// ---------- One meeting ----------

function getMeeting(id) {
  return db
    .prepare(
      `SELECT m.*, s.name as created_by_name, ms.name as minutes_by_name,
              (SELECT weekday FROM meeting_series WHERE id = m.series_id) as series_weekday
       FROM meetings m
       LEFT JOIN staff s ON s.id = m.created_by
       LEFT JOIN staff ms ON ms.id = m.minutes_by
       WHERE m.id = ?`
    )
    .get(id);
}

router.get("/:id", (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
  const attendees = db
    .prepare(
      `SELECT a.id, a.resident_id, a.method, a.checked_in_at, r.first_name, r.last_name,
              s.name as recorded_by_name
       FROM meeting_attendance a
       JOIN residents r ON r.id = a.resident_id
       LEFT JOIN staff s ON s.id = a.recorded_by
       WHERE a.meeting_id = ?
       ORDER BY a.checked_in_at DESC`
    )
    .all(meeting.id);
  // Residents expected at this meeting: living in the house on that date.
  const notCheckedIn = db
    .prepare(
      `SELECT r.id, r.first_name, r.last_name, r.status,
              e.id as excusal_id, e.reason as excusal_reason, es.name as excused_by_name
       FROM residents r
       LEFT JOIN meeting_excusals e ON e.meeting_id = @mid AND e.resident_id = r.id
       LEFT JOIN staff es ON es.id = e.recorded_by
       WHERE r.intake_date <= @date
         AND (r.move_out_date IS NULL OR r.move_out_date >= @date)
         AND (r.status = 'active' OR r.move_out_date IS NOT NULL)
         AND r.id NOT IN (SELECT resident_id FROM meeting_attendance WHERE meeting_id = @mid)
       ORDER BY r.last_name, r.first_name`
    )
    .all({ mid: meeting.id, date: meeting.meeting_date });
  const actionItems = db
    .prepare(
      `SELECT t.*, res.first_name, res.last_name, s.name as assigned_to_name
       FROM tasks t
       LEFT JOIN residents res ON res.id = t.resident_id
       LEFT JOIN staff s ON s.id = t.assigned_to
       WHERE t.meeting_id = ?
       ORDER BY t.status, t.created_at`
    )
    .all(meeting.id);
  const today = houseToday();
  const absencesCount = meeting.required && meeting.status === "held";
  res.json({ ...meeting, attendees, notCheckedIn, actionItems, absencesCount: !!absencesCount, today });
});

// Update details, status (held / cancelled) and minutes.
router.put("/:id", (req, res) => {
  const m = getMeeting(req.params.id);
  if (!m) return res.status(404).json({ error: "Meeting not found" });
  const b = req.body || {};
  const updates = {};
  for (const f of ["title", "location", "led_by", "topics", "announcements", "issues", "minutes_notes"]) {
    if (f in b) updates[f] = b[f] === "" ? null : b[f];
  }
  for (const f of ["start_time", "end_time"]) if (f in b) updates[f] = isTime(b[f]) ? b[f] : null;
  if ("meeting_date" in b && isDate(b.meeting_date)) updates.meeting_date = b.meeting_date;
  if ("required" in b) updates.required = b.required ? 1 : 0;
  if ("status" in b && ["scheduled", "held", "cancelled"].includes(b.status)) updates.status = b.status;
  const minutesChanged = ["led_by", "topics", "announcements", "issues", "minutes_notes"].some((f) => f in updates);
  if (minutesChanged) {
    updates.minutes_by = req.session.staffId;
    updates.minutes_updated_at = new Date().toISOString().replace("T", " ").slice(0, 19);
    if (m.status === "scheduled" && !updates.status) updates.status = "held";
  }
  const keys = Object.keys(updates);
  if (keys.length) {
    db.prepare(`UPDATE meetings SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({
      ...updates,
      id: m.id,
    });
  }
  if (updates.status && updates.status !== m.status) {
    logAction({
      staffId: req.session.staffId,
      action: "status_change",
      entity: "meeting",
      entityId: m.id,
      summary: `Marked ${m.title} on ${m.meeting_date} as ${updates.status}${
        updates.status === "cancelled" && b.cancel_reason ? ` (${b.cancel_reason})` : ""
      }`,
    });
  } else if (minutesChanged) {
    logAction({
      staffId: req.session.staffId,
      action: "update",
      entity: "meeting",
      entityId: m.id,
      summary: `Recorded minutes for ${m.title} on ${m.meeting_date}`,
    });
  }
  res.json({ ok: true });
});

// Check a resident in, either by scanning their QR badge or picking them manually.
router.post("/:id/checkin", (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
  if (meeting.status === "cancelled") return res.status(409).json({ error: "This meeting was cancelled." });
  const { qr_token, resident_id } = req.body || {};

  let resident;
  let method;
  if (qr_token) {
    const token = String(qr_token).trim().replace(/^WCSL:/i, "");
    resident = db
      .prepare("SELECT id, first_name, last_name, status FROM residents WHERE qr_token = ?")
      .get(token);
    method = "qr";
    if (!resident) return res.status(404).json({ error: "QR code not recognized. It may be an old badge." });
  } else if (resident_id) {
    resident = db
      .prepare("SELECT id, first_name, last_name, status FROM residents WHERE id = ?")
      .get(resident_id);
    method = "manual";
    if (!resident) return res.status(404).json({ error: "Resident not found" });
  } else {
    return res.status(400).json({ error: "qr_token or resident_id is required" });
  }

  if (resident.status !== "active") {
    return res
      .status(409)
      .json({ error: `${resident.first_name} ${resident.last_name} is ${resident.status}, not an active resident.` });
  }

  const existing = db
    .prepare("SELECT checked_in_at FROM meeting_attendance WHERE meeting_id = ? AND resident_id = ?")
    .get(meeting.id, resident.id);
  const out = { id: resident.id, first_name: resident.first_name, last_name: resident.last_name };
  if (existing) {
    return res.json({ already: true, resident: out, checked_in_at: existing.checked_in_at });
  }
  db.transaction(() => {
    db.prepare(
      `INSERT INTO meeting_attendance (meeting_id, resident_id, method, recorded_by) VALUES (?, ?, ?, ?)`
    ).run(meeting.id, resident.id, method, req.session.staffId);
    // Attending clears any excusal recorded earlier, and marks the meeting as held.
    db.prepare("DELETE FROM meeting_excusals WHERE meeting_id = ? AND resident_id = ?").run(meeting.id, resident.id);
    if (meeting.status === "scheduled") db.prepare("UPDATE meetings SET status = 'held' WHERE id = ?").run(meeting.id);
  })();
  res.status(201).json({ already: false, resident: out });
});

// Excuse a resident's absence from a required meeting (with a reason).
router.post("/:id/excusals", (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
  const { resident_id, reason } = req.body || {};
  if (!resident_id || !reason || !String(reason).trim()) {
    return res.status(400).json({ error: "resident_id and a reason are required" });
  }
  const r = db.prepare("SELECT first_name, last_name FROM residents WHERE id = ?").get(resident_id);
  if (!r) return res.status(404).json({ error: "Resident not found" });
  db.prepare(
    `INSERT INTO meeting_excusals (meeting_id, resident_id, reason, recorded_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(meeting_id, resident_id) DO UPDATE SET reason = excluded.reason, recorded_by = excluded.recorded_by`
  ).run(meeting.id, resident_id, String(reason).trim(), req.session.staffId);
  logAction({
    staffId: req.session.staffId,
    action: "create",
    entity: "meeting_excusal",
    entityId: meeting.id,
    summary: `Excused ${r.first_name} ${r.last_name} from ${meeting.title} on ${meeting.meeting_date}: ${String(reason).trim()}`,
  });
  res.status(201).json({ ok: true });
});

router.delete("/:id/excusals/:residentId", (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
  const r = db.prepare("SELECT first_name, last_name FROM residents WHERE id = ?").get(req.params.residentId);
  const info = db
    .prepare("DELETE FROM meeting_excusals WHERE meeting_id = ? AND resident_id = ?")
    .run(meeting.id, req.params.residentId);
  if (info.changes && r) {
    logAction({
      staffId: req.session.staffId,
      action: "delete",
      entity: "meeting_excusal",
      entityId: meeting.id,
      summary: `Removed excusal: ${r.first_name} ${r.last_name} for ${meeting.title} on ${meeting.meeting_date} (now unexcused)`,
    });
  }
  res.json({ ok: true });
});

// Action items from the meeting become Tasks (optionally tied to a resident).
router.post("/:id/action-items", (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
  const { title, due_date, resident_id } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: "title is required" });
  const r = db
    .prepare(
      `INSERT INTO tasks (resident_id, title, due_date, created_by, meeting_id) VALUES (?, ?, ?, ?, ?)`
    )
    .run(resident_id || null, String(title).trim(), isDate(due_date) ? due_date : null, req.session.staffId, meeting.id);
  logAction({
    staffId: req.session.staffId,
    action: "create",
    entity: "task",
    entityId: r.lastInsertRowid,
    summary: `Created task "${String(title).trim()}" from ${meeting.title} (${meeting.meeting_date})`,
  });
  res.status(201).json({ id: r.lastInsertRowid });
});

router.delete("/:id/attendance/:attendanceId", requireAdmin, (req, res) => {
  const row = db
    .prepare(
      `SELECT a.id, r.first_name, r.last_name, m.title, m.meeting_date FROM meeting_attendance a
       JOIN residents r ON r.id = a.resident_id JOIN meetings m ON m.id = a.meeting_id
       WHERE a.id = ? AND a.meeting_id = ?`
    )
    .get(req.params.attendanceId, req.params.id);
  if (!row) return res.status(404).json({ error: "Attendance record not found" });
  db.prepare("DELETE FROM meeting_attendance WHERE id = ?").run(row.id);
  logAction({
    staffId: req.session.staffId,
    action: "delete",
    entity: "meeting_attendance",
    entityId: row.id,
    summary: `Removed ${row.first_name} ${row.last_name} from ${row.title} (${row.meeting_date}) attendance`,
  });
  res.json({ ok: true });
});

// Scheduled occurrences are cancelled rather than deleted, so the schedule
// doesn't recreate them. One-off meetings can be deleted by an admin.
router.delete("/:id", requireAdmin, (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
  if (meeting.series_id) {
    return res.status(400).json({ error: "This meeting is part of the standing schedule — cancel it instead." });
  }
  db.prepare("DELETE FROM meetings WHERE id = ?").run(meeting.id);
  logAction({
    staffId: req.session.staffId,
    action: "delete",
    entity: "meeting",
    entityId: meeting.id,
    summary: `Deleted meeting "${meeting.title}" on ${meeting.meeting_date}`,
  });
  res.json({ ok: true });
});

module.exports = router;
module.exports.COUNTED_REQUIRED = COUNTED_REQUIRED;
