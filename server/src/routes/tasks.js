const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../auth");
const { logAction } = require("../audit");

router.use(requireAuth);

// House-wide task list, optionally filtered to a resident: GET /api/tasks
// or GET /api/tasks?resident_id=5
router.get("/", (req, res) => {
  const { resident_id, status } = req.query;
  let sql = `
    SELECT t.*, s.name as assigned_to_name, res.first_name, res.last_name
    FROM tasks t
    LEFT JOIN staff s ON s.id = t.assigned_to
    LEFT JOIN residents res ON res.id = t.resident_id
    WHERE 1=1
  `;
  const params = [];
  if (resident_id) {
    sql += " AND t.resident_id = ?";
    params.push(resident_id);
  }
  if (status) {
    sql += " AND t.status = ?";
    params.push(status);
  }
  sql += " ORDER BY (t.due_date IS NULL), t.due_date ASC, t.created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/", (req, res) => {
  const { title, due_date, assigned_to, resident_id } = req.body || {};
  if (!title) return res.status(400).json({ error: "title is required" });
  const result = db
    .prepare(
      `INSERT INTO tasks (resident_id, title, due_date, assigned_to, created_by)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      resident_id || null,
      title,
      due_date || null,
      assigned_to || null,
      req.session.staffId
    );
  logAction({
    staffId: req.session.staffId,
    action: "create",
    entity: "task",
    entityId: result.lastInsertRowid,
    summary: `Created task "${title}"`,
  });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put("/:id", (req, res) => {
  const { status, title, due_date, assigned_to } = req.body || {};
  const updates = {};
  if (status) {
    updates.status = status;
    updates.completed_at = status === "done" ? new Date().toISOString() : null;
  }
  if (title) updates.title = title;
  if (due_date !== undefined) updates.due_date = due_date;
  if (assigned_to !== undefined) updates.assigned_to = assigned_to;

  const keys = Object.keys(updates);
  if (keys.length === 0) return res.json({ ok: true });
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE tasks SET ${setClause} WHERE id = @id`).run({
    ...updates,
    id: req.params.id,
  });
  if (status) {
    logAction({
      staffId: req.session.staffId,
      action: "status_change",
      entity: "task",
      entityId: Number(req.params.id),
      summary: `Marked task #${req.params.id} as ${status}`,
    });
  }
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
