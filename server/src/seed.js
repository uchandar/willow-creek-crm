const db = require("./db");
const { hashPassword } = require("./auth");

const staffCount = db.prepare("SELECT COUNT(*) as n FROM staff").get().n;
if (staffCount === 0) {
  db.prepare(
    `INSERT INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, ?)`
  ).run("Admin", "admin@willowcreeksober.org", hashPassword("ChangeMe123!"), "admin");
  console.log("Created default admin login: admin@willowcreeksober.org / ChangeMe123!");
} else {
  console.log("Staff already exist, skipping admin creation.");
}

const roomCount = db.prepare("SELECT COUNT(*) as n FROM rooms").get().n;
if (roomCount === 0) {
  const rooms = [
    ["Room 1", "Bed A", 65000],
    ["Room 1", "Bed B", 65000],
    ["Room 2", "Bed A", 65000],
    ["Room 2", "Bed B", 65000],
    ["Room 3", "Bed A", 70000],
    ["Room 3", "Bed B", 70000],
  ];
  const insert = db.prepare(
    "INSERT INTO rooms (room_name, bed_label, monthly_rate) VALUES (?, ?, ?)"
  );
  for (const r of rooms) insert.run(...r);
  console.log(`Created ${rooms.length} demo beds.`);
} else {
  console.log("Rooms already exist, skipping.");
}

const customFieldCount = db
  .prepare("SELECT COUNT(*) as n FROM custom_field_defs")
  .get().n;
if (customFieldCount === 0) {
  const insertField = db.prepare(
    `INSERT INTO custom_field_defs (entity, field_key, label, field_type, options_json, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertField.run("resident", "case_worker", "Case Worker", "text", null, 1);
  insertField.run(
    "resident",
    "insurance_provider",
    "Insurance Provider",
    "select",
    JSON.stringify(["None", "Medicaid", "Private", "Self-pay"]),
    2
  );
  console.log("Created demo custom fields (Case Worker, Insurance Provider).");
} else {
  console.log("Custom fields already exist, skipping.");
}

const seriesCount = db.prepare("SELECT COUNT(*) as n FROM meeting_series").get().n;
if (seriesCount === 0) {
  db.prepare(
    `INSERT INTO meeting_series (title, meeting_type, weekday, start_time, end_time, location, required, start_date)
     VALUES ('Weekly house meeting', 'house', 0, '19:00', '20:00', 'Living room', 1, date('now'))`
  ).run();
  console.log("Created demo standing schedule: Weekly house meeting, Sundays 7pm (required).");
}

console.log("Seed complete.");
