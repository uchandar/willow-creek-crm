const express = require("express");
const router = express.Router({ mergeParams: true });
const db = require("../db");
const { requireAuth } = require("../auth");
const { logAction } = require("../audit");
const { houseDayStartUtc, toSqlite } = require("../time");

router.use(requireAuth);

// Mounted at /api/residents/:residentId/medications

const DOSE_STATUSES = ["taken", "missed", "refused", "held"];

function residentName(id) {
  const r = db.prepare("SELECT first_name, last_name FROM residents WHERE id = ?").get(id);
  return r ? `${r.first_name} ${r.last_name}` : `resident #${id}`;
}

function getMed(req) {
  return db
    .prepare("SELECT * FROM medications WHERE id = ? AND resident_id = ?")
    .get(req.params.medId, req.params.residentId);
}

function intOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}

router.get("/", (req, res) => {
  const dayStart = houseDayStartUtc();
  const medications = db
    .prepare(
      `SELECT md.*,
              (SELECT COUNT(*) FROM medication_doses d
                WHERE d.medication_id = md.id AND d.status = 'taken' AND d.dose_time >= ?) as taken_today,
              (SELECT MAX(d.dose_time) FROM medication_doses d
                WHERE d.medication_id = md.id AND d.status = 'taken') as last_taken,
              (SELECT MAX(c.count_date) FROM pill_counts c
                WHERE c.medication_id = md.id AND c.kind = 'count') as last_count
       FROM medications md
       WHERE md.resident_id = ?
       ORDER BY md.active DESC, md.name`
    )
    .all(dayStart, req.params.residentId);
  const doses = db
    .prepare(
      `SELECT d.*, md.name as medication_name, md.dose as medication_dose, s.name as observed_by_name
       FROM medication_doses d
       JOIN medications md ON md.id = d.medication_id
       LEFT JOIN staff s ON s.id = d.observed_by
       WHERE d.resident_id = ?
       ORDER BY d.dose_time DESC
       LIMIT 100`
    )
    .all(req.params.residentId);
  const counts = db
    .prepare(
      `SELECT c.*, md.name as medication_name, s.name as counted_by_name
       FROM pill_counts c
       JOIN medications md ON md.id = c.medication_id
       LEFT JOIN staff s ON s.id = c.counted_by
       WHERE c.resident_id = ?
       ORDER BY c.count_date DESC
       LIMIT 100`
    )
    .all(req.params.residentId);
  res.json({ medications, doses, counts });
});

router.post("/", (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) {
    return res.status(400).json({ error: "Medication name is required" });
  }
  const result = db
    .prepare(
      `INSERT INTO medications
       (resident_id, name, dose, route, frequency, times_per_day, units_per_dose, prescriber,
        pharmacy, rx_number, start_date, end_date, is_controlled, quantity_on_hand, instructions, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.params.residentId,
      String(b.name).trim(),
      b.dose || null,
      b.route || "oral",
      b.frequency || null,
      intOrNull(b.times_per_day),
      Math.max(1, intOrNull(b.units_per_dose) || 1),
      b.prescriber || null,
      b.pharmacy || null,
      b.rx_number || null,
      b.start_date || null,
      b.end_date || null,
      b.is_controlled ? 1 : 0,
      intOrNull(b.quantity_on_hand),
      b.instructions || null,
      req.session.staffId
    );
  const id = result.lastInsertRowid;
  if (intOrNull(b.quantity_on_hand) !== null) {
    db.prepare(
      `INSERT INTO pill_counts (medication_id, resident_id, kind, expected_count, actual_count, discrepancy, counted_by, notes)
       VALUES (?, ?, 'count', NULL, ?, 0, ?, 'Starting count at intake')`
    ).run(id, req.params.residentId, intOrNull(b.quantity_on_hand), req.session.staffId);
  }
  logAction({
    staffId: req.session.staffId,
    action: "create",
    entity: "medication",
    entityId: id,
    summary: `Added ${b.is_controlled ? "controlled " : ""}medication ${String(b.name).trim()}${
      b.dose ? ` ${b.dose}` : ""
    } for ${residentName(req.params.residentId)}`,
  });
  res.status(201).json({ id });
});

router.put("/:medId", (req, res) => {
  const med = getMed(req);
  if (!med) return res.status(404).json({ error: "Medication not found" });
  const fields = [
    "name", "dose", "route", "frequency", "times_per_day", "units_per_dose", "prescriber",
    "pharmacy", "rx_number", "start_date", "end_date", "is_controlled", "instructions", "active",
  ];
  const updates = {};
  for (const f of fields) {
    if (!(f in (req.body || {}))) continue;
    let v = req.body[f];
    if (f === "is_controlled" || f === "active") v = v ? 1 : 0;
    if (f === "times_per_day") v = intOrNull(v);
    if (f === "units_per_dose") v = Math.max(1, intOrNull(v) || 1);
    updates[f] = v === "" ? null : v;
  }
  if (updates.active === 0 && !updates.end_date && !med.end_date) {
    updates.end_date = new Date().toISOString().slice(0, 10);
  }
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
  if (setClause) {
    db.prepare(`UPDATE medications SET ${setClause} WHERE id = @id`).run({ ...updates, id: med.id });
  }
  const discontinued = med.active === 1 && updates.active === 0;
  const restarted = med.active === 0 && updates.active === 1;
  logAction({
    staffId: req.session.staffId,
    action: discontinued || restarted ? "status_change" : "update",
    entity: "medication",
    entityId: med.id,
    summary: discontinued
      ? `Discontinued ${med.name} for ${residentName(med.resident_id)}`
      : restarted
      ? `Restarted ${med.name} for ${residentName(med.resident_id)}`
      : `Updated ${med.name} for ${residentName(med.resident_id)}`,
  });
  res.json({ ok: true });
});

// Log a dose (taken / missed / refused / held). A taken dose reduces the
// tracked quantity on hand by units_per_dose.
router.post("/:medId/doses", (req, res) => {
  const med = getMed(req);
  if (!med) return res.status(404).json({ error: "Medication not found" });
  const { status, notes, dose_time } = req.body || {};
  const st = DOSE_STATUSES.includes(status) ? status : "taken";
  let when = toSqlite(new Date());
  if (dose_time) {
    const d = new Date(dose_time);
    if (!Number.isNaN(d.getTime())) when = toSqlite(d);
  }
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO medication_doses (medication_id, resident_id, status, dose_time, observed_by, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(med.id, med.resident_id, st, when, req.session.staffId, notes || null);
    if (st === "taken" && med.quantity_on_hand !== null) {
      db.prepare(
        "UPDATE medications SET quantity_on_hand = MAX(0, quantity_on_hand - units_per_dose) WHERE id = ?"
      ).run(med.id);
    }
    return r.lastInsertRowid;
  });
  const id = tx();
  if (st !== "taken") {
    logAction({
      staffId: req.session.staffId,
      action: "create",
      entity: "medication_dose",
      entityId: id,
      summary: `${residentName(med.resident_id)}: ${med.name} dose ${st}${notes ? ` (${notes})` : ""}`,
    });
  }
  res.status(201).json({ id });
});

// Pill count: compare the physical count to the expected quantity on hand.
router.post("/:medId/counts", (req, res) => {
  const med = getMed(req);
  if (!med) return res.status(404).json({ error: "Medication not found" });
  const { actual_count, witness_name, notes } = req.body || {};
  const actual = intOrNull(actual_count);
  if (actual === null || actual < 0) return res.status(400).json({ error: "actual_count is required" });
  const expected = med.quantity_on_hand;
  const discrepancy = expected === null ? 0 : actual - expected;
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO pill_counts (medication_id, resident_id, kind, expected_count, actual_count, discrepancy, counted_by, witness_name, notes)
         VALUES (?, ?, 'count', ?, ?, ?, ?, ?, ?)`
      )
      .run(med.id, med.resident_id, expected, actual, discrepancy, req.session.staffId, witness_name || null, notes || null);
    db.prepare("UPDATE medications SET quantity_on_hand = ? WHERE id = ?").run(actual, med.id);
    return r.lastInsertRowid;
  });
  const id = tx();
  if (discrepancy !== 0 || med.is_controlled) {
    logAction({
      staffId: req.session.staffId,
      action: "create",
      entity: "pill_count",
      entityId: id,
      summary:
        discrepancy !== 0
          ? `PILL COUNT DISCREPANCY: ${residentName(med.resident_id)} ${med.name} expected ${expected}, counted ${actual} (${discrepancy > 0 ? "+" : ""}${discrepancy})`
          : `Pill count for ${residentName(med.resident_id)} ${med.name}: ${actual} (matches)`,
    });
  }
  res.status(201).json({ id, expected, actual, discrepancy });
});

// Refill / receive medication into stock.
router.post("/:medId/refill", (req, res) => {
  const med = getMed(req);
  if (!med) return res.status(404).json({ error: "Medication not found" });
  const qty = intOrNull((req.body || {}).quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: "quantity must be a positive number" });
  const newQty = (med.quantity_on_hand || 0) + qty;
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO pill_counts (medication_id, resident_id, kind, expected_count, actual_count, discrepancy, counted_by, notes)
         VALUES (?, ?, 'refill', ?, ?, 0, ?, ?)`
      )
      .run(med.id, med.resident_id, med.quantity_on_hand, newQty, req.session.staffId,
        `Received ${qty}${req.body.notes ? ` — ${req.body.notes}` : ""}`);
    db.prepare("UPDATE medications SET quantity_on_hand = ? WHERE id = ?").run(newQty, med.id);
    return r.lastInsertRowid;
  });
  const id = tx();
  if (med.is_controlled) {
    logAction({
      staffId: req.session.staffId,
      action: "create",
      entity: "pill_count",
      entityId: id,
      summary: `Received ${qty} of controlled medication ${med.name} for ${residentName(med.resident_id)} (now ${newQty})`,
    });
  }
  res.status(201).json({ id, quantity_on_hand: newQty });
});

module.exports = router;
