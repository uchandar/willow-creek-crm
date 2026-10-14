const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../auth");
const { houseDayStartUtc } = require("../time");

router.use(requireAuth);

// House-wide med pass: every active medication for active residents, with
// today's dose progress, so staff can log doses from one screen.
router.get("/", (req, res) => {
  const dayStart = houseDayStartUtc();
  const rows = db
    .prepare(
      `SELECT md.id, md.resident_id, md.name, md.dose, md.route, md.frequency, md.times_per_day,
              md.is_controlled, md.quantity_on_hand, md.instructions,
              r.first_name, r.last_name,
              (SELECT COUNT(*) FROM medication_doses d
                WHERE d.medication_id = md.id AND d.status = 'taken' AND d.dose_time >= @dayStart) as taken_today,
              (SELECT COUNT(*) FROM medication_doses d
                WHERE d.medication_id = md.id AND d.status IN ('missed','refused') AND d.dose_time >= @dayStart) as missed_today,
              (SELECT MAX(d.dose_time) FROM medication_doses d
                WHERE d.medication_id = md.id AND d.status = 'taken') as last_taken
       FROM medications md
       JOIN residents r ON r.id = md.resident_id
       WHERE md.active = 1 AND r.status = 'active'
       ORDER BY r.last_name, r.first_name, md.name`
    )
    .all({ dayStart });
  res.json(rows);
});

module.exports = router;
