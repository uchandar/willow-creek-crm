const express = require("express");
const router = express.Router({ mergeParams: true });
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { logAction } = require("../audit");

router.use(requireAuth);

// Mounted at /api/residents/:residentId/screenings
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, st.name as administered_by_name
       FROM drug_screenings s
       LEFT JOIN staff st ON st.id = s.administered_by
       WHERE s.resident_id = ?
       ORDER BY s.test_date DESC, s.created_at DESC`
    )
    .all(req.params.residentId);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { test_date, panel, result, substances_flagged, notes, specimen_type } = req.body || {};
  const validSpecimens = ["urine", "saliva", "breath", "blood", "hair"];
  const specimen = validSpecimens.includes(specimen_type) ? specimen_type : "urine";
  const validResults = ["pending", "negative", "positive", "inconclusive", "refused"];
  const resultValue = validResults.includes(result) ? result : "pending";
  const insert = db
    .prepare(
      `INSERT INTO drug_screenings
       (resident_id, test_date, panel, result, substances_flagged, administered_by, notes, specimen_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.params.residentId,
      test_date || new Date().toISOString().slice(0, 10),
      panel || null,
      resultValue,
      resultValue === "positive" ? substances_flagged || null : null,
      req.session.staffId,
      notes || null,
      specimen
    );
  logAction({
    staffId: req.session.staffId,
    action: "create",
    entity: "drug_screening",
    entityId: insert.lastInsertRowid,
    summary: `Logged a ${resultValue} ${specimen} drug screening for resident #${req.params.residentId}`,
  });
  res.status(201).json({ id: insert.lastInsertRowid });
});

// Results can be corrected (e.g. a lab result that updates a presumptive
// positive) but only by an admin, and the correction is audited.
router.put("/:id", requireAdmin, (req, res) => {
  const { result, substances_flagged, notes } = req.body || {};
  db.prepare(
    `UPDATE drug_screenings
     SET result = COALESCE(?, result),
         substances_flagged = ?,
         notes = COALESCE(?, notes)
     WHERE id = ? AND resident_id = ?`
  ).run(
    result || null,
    result === "positive" ? substances_flagged || null : null,
    notes || null,
    req.params.id,
    req.params.residentId
  );
  logAction({
    staffId: req.session.staffId,
    action: "update",
    entity: "drug_screening",
    entityId: Number(req.params.id),
    summary: `Updated drug screening result for resident #${req.params.residentId}`,
  });
  res.json({ ok: true });
});

module.exports = router;
