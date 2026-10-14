const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../auth");
const { logAction } = require("../audit");
const { getValuesForRecord, setValuesForRecord } = require("../customFields");
const screeningsRouter = require("./screenings");

router.use(requireAuth);

router.get("/", (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db
      .prepare(
        `SELECT res.*, r.room_name, r.bed_label
         FROM residents res
         LEFT JOIN rooms r ON r.id = res.bed_id
         WHERE res.status = ?
         ORDER BY res.last_name, res.first_name`
      )
      .all(status);
  } else {
    rows = db
      .prepare(
        `SELECT res.*, r.room_name, r.bed_label
         FROM residents res
         LEFT JOIN rooms r ON r.id = res.bed_id
         ORDER BY res.last_name, res.first_name`
      )
      .all();
  }
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const resident = db
    .prepare(
      `SELECT res.*, r.room_name, r.bed_label
       FROM residents res
       LEFT JOIN rooms r ON r.id = res.bed_id
       WHERE res.id = ?`
    )
    .get(req.params.id);
  if (!resident) return res.status(404).json({ error: "Resident not found" });

  const checkins = db
    .prepare(
      `SELECT c.*, s.name as recorded_by_name
       FROM checkins c
       LEFT JOIN staff s ON s.id = c.recorded_by
       WHERE c.resident_id = ?
       ORDER BY c.checkin_date DESC, c.created_at DESC
       LIMIT 50`
    )
    .all(req.params.id);

  const notes = db
    .prepare(
      `SELECT n.*, s.name as author_name
       FROM case_notes n
       LEFT JOIN staff s ON s.id = n.author_id
       WHERE n.resident_id = ?
       ORDER BY n.created_at DESC`
    )
    .all(req.params.id);

  const payments = db
    .prepare(
      `SELECT * FROM payments WHERE resident_id = ? ORDER BY due_date DESC`
    )
    .all(req.params.id);

  const screenings = db
    .prepare(
      `SELECT sc.*, st.name as administered_by_name
       FROM drug_screenings sc
       LEFT JOIN staff st ON st.id = sc.administered_by
       WHERE sc.resident_id = ?
       ORDER BY sc.test_date DESC, sc.created_at DESC`
    )
    .all(req.params.id);

  const tasks = db
    .prepare(
      `SELECT t.*, s.name as assigned_to_name
       FROM tasks t
       LEFT JOIN staff s ON s.id = t.assigned_to
       WHERE t.resident_id = ?
       ORDER BY (t.due_date IS NULL), t.due_date ASC, t.created_at DESC`
    )
    .all(req.params.id);

  const customFields = getValuesForRecord("resident", resident.id);

  res.json({ ...resident, checkins, notes, payments, screenings, tasks, customFields });
});

router.post("/", (req, res) => {
  const {
    first_name,
    last_name,
    phone,
    email,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relation,
    referral_source,
    intake_date,
    bed_id,
    custom_fields,
  } = req.body || {};

  if (!first_name || !last_name || !intake_date) {
    return res
      .status(400)
      .json({ error: "first_name, last_name, and intake_date are required" });
  }

  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO residents
         (first_name, last_name, phone, email, emergency_contact_name,
          emergency_contact_phone, emergency_contact_relation, referral_source,
          intake_date, bed_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      )
      .run(
        first_name,
        last_name,
        phone || null,
        email || null,
        emergency_contact_name || null,
        emergency_contact_phone || null,
        emergency_contact_relation || null,
        referral_source || null,
        intake_date,
        bed_id || null
      );
    const id = result.lastInsertRowid;
    setValuesForRecord("resident", id, custom_fields);
    return id;
  });

  const id = insert();
  logAction({
    staffId: req.session.staffId,
    action: "create",
    entity: "resident",
    entityId: id,
    summary: `Added resident ${first_name} ${last_name}`,
  });
  res.status(201).json({ id });
});

router.put("/:id", (req, res) => {
  const existing = db
    .prepare("SELECT * FROM residents WHERE id = ?")
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Resident not found" });

  const fields = [
    "first_name",
    "last_name",
    "phone",
    "email",
    "emergency_contact_name",
    "emergency_contact_phone",
    "emergency_contact_relation",
    "referral_source",
    "intake_date",
    "move_out_date",
    "status",
    "bed_id",
  ];
  const updates = {};
  for (const f of fields) {
    if (f in req.body) updates[f] = req.body[f];
  }

  const setClause = Object.keys(updates)
    .map((k) => `${k} = @${k}`)
    .join(", ");
  if (setClause) {
    db.prepare(`UPDATE residents SET ${setClause} WHERE id = @id`).run({
      ...updates,
      id: req.params.id,
    });
  }
  if (req.body.custom_fields) {
    setValuesForRecord("resident", Number(req.params.id), req.body.custom_fields);
  }

  const statusChanged = updates.status && updates.status !== existing.status;
  logAction({
    staffId: req.session.staffId,
    action: statusChanged ? "status_change" : "update",
    entity: "resident",
    entityId: Number(req.params.id),
    summary: statusChanged
      ? `Changed ${existing.first_name} ${existing.last_name}'s status to ${updates.status}`
      : `Updated ${existing.first_name} ${existing.last_name}'s record`,
  });

  res.json({ ok: true });
});

router.post("/:id/checkins", (req, res) => {
  const { checkin_date, checkin_type, status, notes } = req.body || {};
  const result = db
    .prepare(
      `INSERT INTO checkins (resident_id, checkin_date, checkin_type, status, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.params.id,
      checkin_date || new Date().toISOString().slice(0, 10),
      checkin_type || "daily",
      status || "ok",
      notes || null,
      req.session.staffId
    );
  if (status === "flagged" || status === "missed") {
    logAction({
      staffId: req.session.staffId,
      action: "create",
      entity: "checkin",
      entityId: result.lastInsertRowid,
      summary: `Logged a ${status} ${checkin_type || "daily"} check-in for resident #${req.params.id}`,
    });
  }
  res.status(201).json({ id: result.lastInsertRowid });
});

router.post("/:id/notes", (req, res) => {
  const { category, note } = req.body || {};
  if (!note) return res.status(400).json({ error: "note is required" });
  const result = db
    .prepare(
      `INSERT INTO case_notes (resident_id, category, note, author_id)
       VALUES (?, ?, ?, ?)`
    )
    .run(req.params.id, category || "general", note, req.session.staffId);
  if (category === "incident") {
    logAction({
      staffId: req.session.staffId,
      action: "create",
      entity: "case_note",
      entityId: result.lastInsertRowid,
      summary: `Logged an incident note for resident #${req.params.id}`,
    });
  }
  res.status(201).json({ id: result.lastInsertRowid });
});

router.post("/:id/payments", (req, res) => {
  const { amount_cents, due_date, paid_date, status, notes } = req.body || {};
  if (!amount_cents || !due_date) {
    return res
      .status(400)
      .json({ error: "amount_cents and due_date are required" });
  }
  const result = db
    .prepare(
      `INSERT INTO payments (resident_id, amount_cents, due_date, paid_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.params.id,
      amount_cents,
      due_date,
      paid_date || null,
      status || "due",
      notes || null
    );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put("/:id/payments/:paymentId", (req, res) => {
  const { status, paid_date } = req.body || {};
  db.prepare(
    `UPDATE payments SET status = COALESCE(?, status), paid_date = COALESCE(?, paid_date)
     WHERE id = ? AND resident_id = ?`
  ).run(status || null, paid_date || null, req.params.paymentId, req.params.id);
  if (status) {
    logAction({
      staffId: req.session.staffId,
      action: "status_change",
      entity: "payment",
      entityId: Number(req.params.paymentId),
      summary: `Marked a payment for resident #${req.params.id} as ${status}`,
    });
  }
  res.json({ ok: true });
});

// Nested: /api/residents/:residentId/screenings
router.use("/:residentId/screenings", screeningsRouter);

module.exports = router;
