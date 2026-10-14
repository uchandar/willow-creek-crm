const db = require("./db");

const insertStmt = db.prepare(
  `INSERT INTO audit_log (staff_id, action, entity, entity_id, summary) VALUES (?, ?, ?, ?, ?)`
);

function logAction({ staffId, action, entity, entityId, summary }) {
  insertStmt.run(staffId || null, action, entity, entityId || null, summary);
}

module.exports = { logAction };
