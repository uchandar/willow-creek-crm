const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// On Vercel the deploy filesystem is read-only; /tmp is writable but ephemeral (demo only).
const dataDir = process.env.VERCEL ? "/tmp/willow-data" : path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, "willow.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'house_manager', -- admin | house_manager
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_name TEXT NOT NULL,
  bed_label TEXT NOT NULL,
  monthly_rate INTEGER NOT NULL DEFAULT 0, -- cents
  UNIQUE(room_name, bed_label)
);

CREATE TABLE IF NOT EXISTS residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  referral_source TEXT,
  intake_date TEXT NOT NULL,
  move_out_date TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | alumni | discharged
  bed_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  checkin_date TEXT NOT NULL DEFAULT (date('now')),
  checkin_type TEXT NOT NULL DEFAULT 'daily', -- daily | curfew | drug_test | chore
  status TEXT NOT NULL DEFAULT 'ok', -- ok | missed | flagged
  notes TEXT,
  recorded_by INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general', -- general | incident | progress | family_contact
  note TEXT NOT NULL,
  author_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  paid_date TEXT,
  status TEXT NOT NULL DEFAULT 'due', -- due | paid | late | waived
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Twenty-style custom objects: admin-defined extra fields on residents,
-- no code changes or migrations required to add one.
CREATE TABLE IF NOT EXISTS custom_field_defs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL DEFAULT 'resident', -- which record type this field applies to
  field_key TEXT NOT NULL,                 -- stable machine key, e.g. "case_worker"
  label TEXT NOT NULL,                     -- display label, e.g. "Case Worker"
  field_type TEXT NOT NULL DEFAULT 'text', -- text | number | date | select | checkbox
  options_json TEXT,                       -- JSON array of options, for field_type = 'select'
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity, field_key)
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_id INTEGER NOT NULL REFERENCES custom_field_defs(id) ON DELETE CASCADE,
  record_id INTEGER NOT NULL, -- id into the entity's own table (e.g. residents.id)
  value TEXT,
  UNIQUE(field_id, record_id)
);

-- Dedicated Drug Screenings module (kept separate from generic check-ins,
-- mirroring the "Bed Assignments / Resident Status / Drug Screenings"
-- custom-object example).
CREATE TABLE IF NOT EXISTS drug_screenings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  test_date TEXT NOT NULL DEFAULT (date('now')),
  panel TEXT,                                 -- e.g. "12-panel"
  result TEXT NOT NULL DEFAULT 'pending',      -- pending | negative | positive | inconclusive | refused
  substances_flagged TEXT,                     -- free text, only set when result = positive
  administered_by INTEGER REFERENCES staff(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Krayin-style activities/tasks: assignable follow-ups, house-wide or tied
-- to a resident.
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER REFERENCES residents(id) ON DELETE CASCADE, -- nullable: house-wide task
  title TEXT NOT NULL,
  due_date TEXT,
  assigned_to INTEGER REFERENCES staff(id),
  status TEXT NOT NULL DEFAULT 'open', -- open | done
  created_by INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- EspoCRM-style audit trail: who changed what, across every entity.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER REFERENCES staff(id),
  action TEXT NOT NULL,       -- e.g. "create", "update", "status_change"
  entity TEXT NOT NULL,       -- e.g. "resident", "room", "payment"
  entity_id INTEGER,
  summary TEXT NOT NULL,      -- human-readable description
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Meetings (AA/NA/house meetings, etc.) and QR-based attendance.
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  meeting_type TEXT NOT NULL DEFAULT 'house', -- house | aa | na | smart | other
  meeting_date TEXT NOT NULL DEFAULT (date('now')),
  start_time TEXT,
  location TEXT,
  created_by INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meeting_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'qr', -- qr | manual
  recorded_by INTEGER REFERENCES staff(id),
  checked_in_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(meeting_id, resident_id)
);

-- Standing (recurring weekly) meeting schedule, e.g. "House meeting, Sundays 7pm".
-- Occurrences are materialized into meetings as the calendar is viewed.
CREATE TABLE IF NOT EXISTS meeting_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  meeting_type TEXT NOT NULL DEFAULT 'house',
  weekday INTEGER NOT NULL,          -- 0 = Sunday ... 6 = Saturday
  start_time TEXT,                   -- "19:00"
  end_time TEXT,
  location TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  start_date TEXT NOT NULL DEFAULT (date('now')),
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Excused / unexcused absences from required meetings.
CREATE TABLE IF NOT EXISTS meeting_excusals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  reason TEXT,
  recorded_by INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(meeting_id, resident_id)
);

-- Medications: prescription list, dose log (MAR-style), pill counts.
CREATE TABLE IF NOT EXISTS medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dose TEXT,                 -- e.g. "50 mg"
  route TEXT DEFAULT 'oral',
  frequency TEXT,            -- e.g. "Twice daily"
  times_per_day INTEGER,     -- used for today's dose progress
  units_per_dose INTEGER NOT NULL DEFAULT 1,
  prescriber TEXT,
  pharmacy TEXT,
  rx_number TEXT,
  start_date TEXT,
  end_date TEXT,
  is_controlled INTEGER NOT NULL DEFAULT 0,
  quantity_on_hand INTEGER,  -- null = not tracked
  instructions TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medication_doses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'taken', -- taken | missed | refused | held
  dose_time TEXT NOT NULL DEFAULT (datetime('now')),
  observed_by INTEGER REFERENCES staff(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pill_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  count_date TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL DEFAULT 'count', -- count | refill
  expected_count INTEGER,
  actual_count INTEGER NOT NULL,
  discrepancy INTEGER NOT NULL DEFAULT 0,
  counted_by INTEGER REFERENCES staff(id),
  witness_name TEXT,
  notes TEXT
);
`);

// Lightweight migrations for databases created before these columns existed.
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing("residents", "qr_token", "TEXT");
addColumnIfMissing("drug_screenings", "specimen_type", "TEXT NOT NULL DEFAULT 'urine'");
// House meeting records: schedule link, required flag, status and minutes.
addColumnIfMissing("meetings", "series_id", "INTEGER REFERENCES meeting_series(id) ON DELETE SET NULL");
addColumnIfMissing("meetings", "required", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("meetings", "end_time", "TEXT");
addColumnIfMissing("meetings", "status", "TEXT NOT NULL DEFAULT 'scheduled'"); // scheduled | held | cancelled
addColumnIfMissing("meetings", "led_by", "TEXT");
addColumnIfMissing("meetings", "topics", "TEXT");
addColumnIfMissing("meetings", "announcements", "TEXT");
addColumnIfMissing("meetings", "issues", "TEXT");
addColumnIfMissing("meetings", "minutes_notes", "TEXT");
addColumnIfMissing("meetings", "minutes_by", "INTEGER REFERENCES staff(id)");
addColumnIfMissing("meetings", "minutes_updated_at", "TEXT");
addColumnIfMissing("tasks", "meeting_id", "INTEGER REFERENCES meetings(id) ON DELETE SET NULL");
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_series_date ON meetings(series_id, meeting_date) WHERE series_id IS NOT NULL"
);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_residents_qr_token ON residents(qr_token)");

// Every resident gets an opaque QR token (no name or PHI encoded in the badge).
const crypto = require("crypto");
function newQrToken() {
  return crypto.randomBytes(12).toString("hex");
}
const missing = db.prepare("SELECT id FROM residents WHERE qr_token IS NULL").all();
const setToken = db.prepare("UPDATE residents SET qr_token = ? WHERE id = ?");
for (const r of missing) setToken.run(newQrToken(), r.id);

db.newQrToken = newQrToken;

module.exports = db;
