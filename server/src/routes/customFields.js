const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { logAction } = require("../audit");
const { listFieldDefs } = require("../customFields");

router.use(requireAuth);

// Anyone logged in can read the field definitions (needed to render forms);
// only admins can create/edit/delete them.
router.get("/", (req, res) => {
  const entity = req.query.entity || "resident";
  res.json(listFieldDefs(entity));
});

router.post("/", requireAdmin, (req, res) => {
  const { entity, field_key, label, field_type, options, sort_order } = req.body || {};
  if (!field_key || !label) {
    return res.status(400).json({ error: "field_key and label are required" });
  }
  const validTypes = ["text", "number", "date", "select", "checkbox"];
  const type = validTypes.includes(field_type) ? field_type : "text";
  try {
    const result = db
      .prepare(
        `INSERT INTO custom_field_defs (entity, field_key, label, field_type, options_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        entity || "resident",
        field_key,
        label,
        type,
        Array.isArray(options) ? JSON.stringify(options) : null,
        sort_order || 0
      );
    logAction({
      staffId: req.session.staffId,
      action: "create",
      entity: "custom_field_def",
      entityId: result.lastInsertRowid,
      summary: `Added custom field "${label}" (${field_key}) to ${entity || "resident"}`,
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: "A field with that key already exists for this entity" });
  }
});

router.delete("/:id", requireAdmin, (req, res) => {
  const def = db.prepare("SELECT * FROM custom_field_defs WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM custom_field_defs WHERE id = ?").run(req.params.id);
  if (def) {
    logAction({
      staffId: req.session.staffId,
      action: "delete",
      entity: "custom_field_def",
      entityId: def.id,
      summary: `Removed custom field "${def.label}" (${def.field_key})`,
    });
  }
  res.json({ ok: true });
});

module.exports = router;
