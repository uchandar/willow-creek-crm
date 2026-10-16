const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../auth");
const { houseDayStartUtc, houseToday } = require("../time");
const { ensureOccurrences, requiredStats, addDays } = require("../meetingSchedule");

router.use(requireAuth);

router.get("/", (req, res) => {
  const totalBeds = db.prepare("SELECT COUNT(*) as n FROM rooms").get().n;
  const occupiedBeds = db
    .prepare("SELECT COUNT(*) as n FROM residents WHERE status = 'active' AND bed_id IS NOT NULL")
    .get().n;
  const activeResidents = db
    .prepare("SELECT COUNT(*) as n FROM residents WHERE status = 'active'")
    .get().n;

  const today = new Date().toISOString().slice(0, 10);
  const checkinsToday = db
    .prepare("SELECT COUNT(*) as n FROM checkins WHERE checkin_date = ?")
    .get(today).n;
  const flaggedCheckins = db
    .prepare(
      "SELECT COUNT(*) as n FROM checkins WHERE checkin_date = ? AND status IN ('missed','flagged')"
    )
    .get(today).n;

  const overduePayments = db
    .prepare(
      "SELECT COUNT(*) as n FROM payments WHERE status IN ('due','late') AND due_date < ?"
    )
    .get(today).n;

  const openTasks = db
    .prepare("SELECT COUNT(*) as n FROM tasks WHERE status = 'open'")
    .get().n;
  const overdueTasks = db
    .prepare(
      "SELECT COUNT(*) as n FROM tasks WHERE status = 'open' AND due_date IS NOT NULL AND due_date < ?"
    )
    .get(today).n;
  const pendingScreenings = db
    .prepare("SELECT COUNT(*) as n FROM drug_screenings WHERE result = 'pending'")
    .get().n;

  const recentNotes = db
    .prepare(
      `SELECT n.id, n.category, n.note, n.created_at, res.first_name, res.last_name, s.name as author_name
       FROM case_notes n
       JOIN residents res ON res.id = n.resident_id
       LEFT JOIN staff s ON s.id = n.author_id
       ORDER BY n.created_at DESC
       LIMIT 8`
    )
    .all();

  const dayStart = houseDayStartUtc();
  const dosesOutstanding = db
    .prepare(
      `SELECT COALESCE(SUM(MAX(0, md.times_per_day - (SELECT COUNT(*) FROM medication_doses d
          WHERE d.medication_id = md.id AND d.status = 'taken' AND d.dose_time >= ?))), 0) as n
       FROM medications md JOIN residents r ON r.id = md.resident_id
       WHERE md.active = 1 AND r.status = 'active' AND md.times_per_day IS NOT NULL`
    )
    .get(dayStart).n;
  const missedDosesToday = db
    .prepare("SELECT COUNT(*) as n FROM medication_doses WHERE status IN ('missed','refused') AND dose_time >= ?")
    .get(dayStart).n;
  const pillCountDiscrepancies = db
    .prepare(
      "SELECT COUNT(*) as n FROM pill_counts WHERE kind = 'count' AND discrepancy <> 0 AND count_date >= datetime('now','-7 days')"
    )
    .get().n;
  const meetingAttendanceToday = db
    .prepare(
      `SELECT COUNT(*) as n FROM meeting_attendance a JOIN meetings m ON m.id = a.meeting_id
       WHERE m.meeting_date = ?`
    )
    .get(houseToday()).n;

  const htoday = houseToday();
  ensureOccurrences(addDays(htoday, -7), addDays(htoday, 14));
  const nextHouseMeeting =
    db
      .prepare(
        `SELECT id, title, meeting_date, start_time, location, required FROM meetings
         WHERE meeting_type = 'house' AND status <> 'cancelled' AND meeting_date >= ?
           AND NOT (status = 'held' AND meeting_date = ?)
         ORDER BY meeting_date, start_time LIMIT 1`
      )
      .get(htoday, htoday) || null;
  const unexcusedAbsences7d = requiredStats(addDays(htoday, -6), htoday).reduce((n, r) => n + r.unexcused, 0);
  // House meetings in the last 30 days that still need attention: held without
  // minutes, or past and never recorded (no check-ins, not cancelled).
  const minutesPending = db
    .prepare(
      `SELECT COUNT(*) as n FROM meetings
       WHERE meeting_type = 'house' AND meeting_date >= ? AND meeting_date < ?
         AND ((status = 'held' AND led_by IS NULL AND topics IS NULL AND minutes_notes IS NULL)
              OR status = 'scheduled')`
    )
    .get(addDays(htoday, -30), htoday).n;

  res.json({
    nextHouseMeeting,
    unexcusedAbsences7d,
    minutesPending,
    dosesOutstanding,
    missedDosesToday,
    pillCountDiscrepancies,
    meetingAttendanceToday,
    totalBeds,
    occupiedBeds,
    availableBeds: totalBeds - occupiedBeds,
    activeResidents,
    checkinsToday,
    flaggedCheckins,
    overduePayments,
    openTasks,
    overdueTasks,
    pendingScreenings,
    recentNotes,
  });
});

module.exports = router;
