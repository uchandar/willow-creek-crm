const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { logAction } = require("../audit");

router.use(requireAuth);

// List rooms/beds with current occupant (if any)
router.get("/", (req, res) => {
  const rooms = db
    .prepare(
      `SELECT r.*,
              res.id as resident_id, res.first_name, res.last_name
       FROM rooms r
       LEFT JOIN residents res ON res.bed_id = r.id AND res.status = 'active'
       ORDER BY r.room_name, r.bed_label`
    )
    .all();
  res.json(rooms);
});

// Bed/room management is admin-only (EspoCRM-style role permissions):
// house managers work with residents day to day but shouldn't restructure
// the property itself.
router.post("/", requireAdmin, (req, res) => {
  const { room_name, bed_label, monthly_rate } = req.body || {};
  if (!room_name || !bed_label) {
    return res.status(400).json({ error: "room_name and bed_label are required" });
  }
  try {
    const result = db
      .prepare(
        "INSERT INTO rooms (room_name, bed_label, monthly_rate) VALUES (?, ?, ?)"
      )
      .run(room_name, bed_label, monthly_rate || 0);
    logAction({
      staffId: req.session.staffId,
      action: "create",
      entity: "room",
      entityId: result.lastInsertRowid,
      summary: `Added bed ${room_name} / ${bed_label}`,
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: "That room/bed already exists" });
  }
});

router.delete("/:id", requireAdmin, (req, res) => {
  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM rooms WHERE id = ?").run(req.params.id);
  if (room) {
    logAction({
      staffId: req.session.staffId,
      action: "delete",
      entity: "room",
      entityId: room.id,
      summary: `Removed bed ${room.room_name} / ${room.bed_label}`,
    });
  }
  res.json({ ok: true });
});

module.exports = router;
