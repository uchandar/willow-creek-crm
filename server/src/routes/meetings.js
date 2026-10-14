const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { logAction } = require("../audit");
const { houseToday } = require("../time");

router.use(requireAuth);

const MEETING_TYPES = ["house", "aa", "na", "smart", "celebrate_recovery", "other"];

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, s.name as created_by_name,
              (SELECT COUNT(*) FROM meeting_attendance a WHERE a.meeting_id = m.id) as attendee_count
       FROM meetings m
       LEFT JOIN staff s ON s.id = m.created_by
       ORDER BY m.meeting_date DESC, m.start_time DESC, m.id DESC
       LIMIT 200`
    )
    .all();
  res.json(rows);
});

// Attendance totals per active resident over a date range (default last 7 days).
router.get("/summary", (req, res) => {
  const to = req.query.to || houseToday();
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 7));
  const fromDate = new Date(to + "T00:00:00Z");
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  const from = req.query.from || fromDate.toISOString().slice(0, 10);

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
       WHERE r.status = 'active'
       ORDER BY attended ASC, r.last_name, r.first_name`
    )
    .all({ from, to });
  const houseMeetingsHeld = db
    .prepare("SELECT COUNT(*) as n FROM meetings WHERE meeting_type = 'house' AND meeting_date BETWEEN ? AND ?")
    .get(from, to).n;
  res.json({ from, to, houseMeetingsHeld, residents });
});

router.post("/", (req, res) => {
  const { title, meeting_type, meeting_date, start_time, location } = req.body || {};
  const type = MEETING_TYPES.includes(meeting_type) ? meeting_type : "house";
  const result = db
    .prepare(
      `INSERT INTO meetings (title, meeting_type, meeting_date, start_time, location, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      (title && title.trim()) || defaultTitle(type),
      type,
      meeting_date || houseToday(),
      start_time || null,
      location || null,
      req.session.staffId
    );
  res.status(201).json({ id: result.lastInsertRowid });
});

function defaultTitle(type) {
  return {
    house: "House meeting",
    aa: "AA meeting",
    na: "NA meeting",
    smart: "SMART Recovery",
    celebrate_recovery: "Celebrate Recovery",
    other: "Meeting",
  }[type];
}

function getMeeting(id) {
  return db
    .prepare(
      `SELECT m.*, s.name as created_by_name FROM meetings m
       LEFT JOIN staff s ON s.id = m.created_by WHERE m.id = ?`
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
    .all(req.params.id);
  const notCheckedIn = db
    .prepare(
      `SELECT r.id, r.first_name, r.last_name FROM residents r
       WHERE r.status = 'active'
         AND r.id NOT IN (SELECT resident_id FROM meeting_attendance WHERE meeting_id = ?)
       ORDER BY r.last_name, r.first_name`
    )
    .all(req.params.id);
  res.json({ ...meeting, attendees, notCheckedIn });
});

// Check a resident in, either by scanning their QR badge or picking them manually.
router.post("/:id/checkin", (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
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
  db.prepare(
    `INSERT INTO meeting_attendance (meeting_id, resident_id, method, recorded_by) VALUES (?, ?, ?, ?)`
  ).run(meeting.id, resident.id, method, req.session.staffId);
  res.status(201).json({ already: false, resident: out });
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

router.delete("/:id", requireAdmin, (req, res) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
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
