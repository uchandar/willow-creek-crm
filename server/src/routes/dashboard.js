const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../auth");

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

  res.json({
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
