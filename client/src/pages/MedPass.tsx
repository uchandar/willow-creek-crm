import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtUtc, type MedPassRow } from "../api";

export default function MedPass() {
  const [rows, setRows] = useState<MedPassRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [onlyDue, setOnlyDue] = useState(false);

  function load() {
    api.get("/medications").then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function log(row: MedPassRow, status: "taken" | "missed" | "refused") {
    let notes: string | null = null;
    if (status !== "taken") {
      notes = prompt(`Reason ${row.first_name} ${status === "missed" ? "missed" : "refused"} ${row.name}? (optional)`);
      if (notes === null) return;
    }
    setBusyId(row.id);
    try {
      await api.post(`/residents/${row.resident_id}/medications/${row.id}/doses`, { status, notes: notes || null });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log dose");
    } finally {
      setBusyId(null);
    }
  }

  const visible = onlyDue ? rows.filter((r) => r.times_per_day != null && r.taken_today < r.times_per_day) : rows;
  const grouped = new Map<number, MedPassRow[]>();
  for (const r of visible) grouped.set(r.resident_id, [...(grouped.get(r.resident_id) || []), r]);

  return (
    <div>
      <h1>Med pass</h1>
      <p className="muted">Today's medications for all active residents. Log each dose as it's observed.</p>
      {error && <div className="alert">{error}</div>}
      <div className="filter-row">
        <button className={`chip ${!onlyDue ? "chip-active" : ""}`} onClick={() => setOnlyDue(false)}>
          All active meds
        </button>
        <button className={`chip ${onlyDue ? "chip-active" : ""}`} onClick={() => setOnlyDue(true)}>
          Doses still due today
        </button>
      </div>

      {grouped.size === 0 && (
        <p className="muted">
          {rows.length === 0
            ? "No active medications. Add them from a resident's Medications tab."
            : "All scheduled doses for today are logged."}
        </p>
      )}

      {[...grouped.entries()].map(([residentId, meds]) => (
        <div className="card med-card" key={residentId}>
          <h3>
            <Link to={`/residents/${residentId}?tab=medications`}>
              {meds[0].first_name} {meds[0].last_name}
            </Link>
          </h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Today</th>
                  <th>Last taken</th>
                  <th>On hand</th>
                  <th>Log dose</th>
                </tr>
              </thead>
              <tbody>
                {meds.map((m) => {
                  const due = m.times_per_day != null && m.taken_today < m.times_per_day;
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong> {m.dose}
                        {m.is_controlled ? <span className="tag tag-controlled">controlled</span> : null}
                        <div className="muted small">
                          {[m.route, m.frequency].filter(Boolean).join(" · ")}
                          {m.instructions ? ` · ${m.instructions}` : ""}
                        </div>
                      </td>
                      <td>
                        <span className={`tag ${due ? "tag-pay-due" : "tag-ci-ok"}`}>
                          {m.taken_today}
                          {m.times_per_day != null ? ` / ${m.times_per_day}` : ""} taken
                        </span>
                        {m.missed_today > 0 && <span className="tag tag-ci-missed tag-gap">{m.missed_today} missed/refused</span>}
                      </td>
                      <td>{fmtUtc(m.last_taken)}</td>
                      <td>{m.quantity_on_hand ?? "—"}</td>
                      <td>
                        <div className="dose-buttons">
                        <button className="btn-primary btn-sm" disabled={busyId === m.id} onClick={() => log(m, "taken")}>
                          Taken
                        </button>
                        <button className="btn-secondary btn-sm" disabled={busyId === m.id} onClick={() => log(m, "missed")}>
                          Missed
                        </button>
                        <button className="btn-secondary btn-sm" disabled={busyId === m.id} onClick={() => log(m, "refused")}>
                          Refused
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
