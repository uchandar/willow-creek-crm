const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");

router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = db
    .prepare(
      `SELECT a.*, s.name as staff_name
       FROM audit_log a
       LEFT JOIN staff s ON s.id = a.staff_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?`
    )
    .all(limit);
  res.json(rows);
});

module.exports = router;
