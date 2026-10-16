// Turns the standing weekly schedule (meeting_series) into dated meetings,
// and holds the shared rules for what counts as a missed required meeting.
const db = require("./db");
const { houseToday } = require("./time");

const HORIZON_DAYS = 120;

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const insertOccurrence = db.prepare(
  `INSERT OR IGNORE INTO meetings
     (title, meeting_type, meeting_date, start_time, end_time, location, required, series_id, created_by)
   VALUES (@title, @meeting_type, @meeting_date, @start_time, @end_time, @location, @required, @series_id, @created_by)`
);

// Create any missing occurrences of active series between `from` and `to` (inclusive).
function ensureOccurrences(from, to) {
  const maxTo = addDays(houseToday(), HORIZON_DAYS);
  if (to > maxTo) to = maxTo;
  if (from > to) return;
  const series = db.prepare("SELECT * FROM meeting_series WHERE active = 1").all();
  if (!series.length) return;
  const tx = db.transaction(() => {
    for (const s of series) {
      let d = from < s.start_date ? s.start_date : from;
      // advance to the first matching weekday
      const wd = new Date(d + "T00:00:00Z").getUTCDay();
      d = addDays(d, (s.weekday - wd + 7) % 7);
      for (; d <= to; d = addDays(d, 7)) {
        insertOccurrence.run({
          title: s.title,
          meeting_type: s.meeting_type,
          meeting_date: d,
          start_time: s.start_time,
          end_time: s.end_time,
          location: s.location,
          required: s.required,
          series_id: s.id,
          created_by: s.created_by,
        });
      }
    }
  });
  tx();
}

// SQL fragment: required meetings that "count" for resident alias r / meeting alias m.
// Only meetings actually recorded as held count (any check-in or minutes marks a
// meeting held), so a meeting nobody recorded doesn't mark everyone absent; those
// show up as "not recorded" instead. Counts only while the resident lived in the house.
const COUNTED_REQUIRED = `
  m.required = 1
  AND m.status = 'held'
  AND m.meeting_date >= r.intake_date
  AND (r.move_out_date IS NULL OR m.meeting_date <= r.move_out_date)
`;

// Per-resident required-meeting stats between from and to.
function requiredStats(from, to, residentFilterSql = "r.status = 'active'", params = {}) {
  const today = houseToday();
  return db
    .prepare(
      `SELECT r.id,
         (SELECT COUNT(*) FROM meetings m WHERE ${COUNTED_REQUIRED}
            AND m.meeting_date BETWEEN @from AND @to) as required_total,
         (SELECT COUNT(*) FROM meetings m JOIN meeting_attendance a ON a.meeting_id = m.id AND a.resident_id = r.id
            WHERE ${COUNTED_REQUIRED} AND m.meeting_date BETWEEN @from AND @to) as required_attended,
         (SELECT COUNT(*) FROM meetings m JOIN meeting_excusals e ON e.meeting_id = m.id AND e.resident_id = r.id
            WHERE ${COUNTED_REQUIRED} AND m.meeting_date BETWEEN @from AND @to
              AND NOT EXISTS (SELECT 1 FROM meeting_attendance a WHERE a.meeting_id = m.id AND a.resident_id = r.id)) as excused
       FROM residents r
       WHERE ${residentFilterSql}`
    )
    .all({ from, to, today, ...params })
    .map((x) => ({
      ...x,
      unexcused: x.required_total - x.required_attended - x.excused,
    }));
}

module.exports = { ensureOccurrences, requiredStats, COUNTED_REQUIRED, addDays };
