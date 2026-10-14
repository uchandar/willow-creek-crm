const db = require("./db");

function listFieldDefs(entity) {
  return db
    .prepare(
      `SELECT * FROM custom_field_defs WHERE entity = ? ORDER BY sort_order, id`
    )
    .all(entity)
    .map((f) => ({
      ...f,
      options: f.options_json ? JSON.parse(f.options_json) : null,
    }));
}

function getValuesForRecord(entity, recordId) {
  const rows = db
    .prepare(
      `SELECT d.field_key, v.value
       FROM custom_field_values v
       JOIN custom_field_defs d ON d.id = v.field_id
       WHERE d.entity = ? AND v.record_id = ?`
    )
    .all(entity, recordId);
  const out = {};
  for (const r of rows) out[r.field_key] = r.value;
  return out;
}

// Looks up each key against the entity's defined fields and upserts a value
// row. Unknown keys are silently ignored (defensive: a stale client
// shouldn't be able to write arbitrary rows).
function setValuesForRecord(entity, recordId, valuesByKey) {
  if (!valuesByKey || typeof valuesByKey !== "object") return;
  const defs = listFieldDefs(entity);
  const byKey = Object.fromEntries(defs.map((d) => [d.field_key, d]));
  const upsert = db.prepare(
    `INSERT INTO custom_field_values (field_id, record_id, value)
     VALUES (@field_id, @record_id, @value)
     ON CONFLICT(field_id, record_id) DO UPDATE SET value = excluded.value`
  );
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(valuesByKey)) {
      const def = byKey[key];
      if (!def) continue;
      upsert.run({ field_id: def.id, record_id: recordId, value: value ?? null });
    }
  });
  tx();
}

module.exports = { listFieldDefs, getValuesForRecord, setValuesForRecord };
