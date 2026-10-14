// The house runs on local (Central) time; the server (Vercel) runs on UTC.
// Timestamps are stored in UTC as SQLite "YYYY-MM-DD HH:MM:SS"; these helpers
// give the UTC bounds of "today" in the house's time zone.
const HOUSE_TZ = process.env.HOUSE_TZ || "America/Chicago";

function tzOffsetMs(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: HOUSE_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function toSqlite(date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function houseToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: HOUSE_TZ }).format(new Date()); // YYYY-MM-DD
}

// UTC "YYYY-MM-DD HH:MM:SS" for local midnight starting the given local date (default today)
function houseDayStartUtc(localDate = houseToday()) {
  const [y, m, d] = localDate.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return toSqlite(new Date(guess.getTime() - tzOffsetMs(guess)));
}

module.exports = { HOUSE_TZ, houseToday, houseDayStartUtc, toSqlite };
