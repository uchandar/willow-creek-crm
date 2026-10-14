import { useCallback, useEffect, useState } from "react";
import { api, fmtUtc, type Medication, type MedicationDose, type PillCount } from "./api";

type Data = { medications: Medication[]; doses: MedicationDose[]; counts: PillCount[] };

const emptyForm = {
  name: "",
  dose: "",
  route: "oral",
  frequency: "",
  times_per_day: "",
  units_per_dose: "1",
  prescriber: "",
  pharmacy: "",
  rx_number: "",
  start_date: "",
  quantity_on_hand: "",
  instructions: "",
  is_controlled: false,
};

export default function MedicationsPanel({ residentId }: { residentId: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<{ medId: number; kind: "count" | "refill" } | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const base = `/residents/${residentId}/medications`;
  const load = useCallback(() => {
    api.get(base).then(setData).catch((e) => setError(e.message));
  }, [base]);
  useEffect(load, [load]);

  function set<K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function addMed(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post(base, form);
      setForm({ ...emptyForm });
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add medication");
    } finally {
      setSaving(false);
    }
  }

  async function logDose(med: Medication, status: "taken" | "missed" | "refused" | "held") {
    let notes: string | null = null;
    if (status !== "taken") {
      notes = prompt(`Reason the ${med.name} dose was ${status}? (optional)`);
      if (notes === null) return;
    }
    try {
      await api.post(`${base}/${med.id}/doses`, { status, notes: notes || null });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log dose");
    }
  }

  async function setActive(med: Medication, active: boolean) {
    if (!active && !confirm(`Discontinue ${med.name}?`)) return;
    await api.put(`${base}/${med.id}`, { active });
    load();
  }

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <div className="muted">Loading...</div>;

  const meds = data.medications.filter((m) => showInactive || m.active);
  const inactiveCount = data.medications.filter((m) => !m.active).length;

  return (
    <div>
      <div className="card-head-row">
        <h3>Medication list</h3>
        <button className="btn-primary" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? "Cancel" : "Add medication"}
        </button>
      </div>

      {showAdd && (
        <form className="card form-grid" onSubmit={addMed}>
          <label>
            Medication name *
            <input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </label>
          <label>
            Dose / strength
            <input placeholder="e.g. 50 mg" value={form.dose} onChange={(e) => set("dose", e.target.value)} />
          </label>
          <label>
            Route
            <select value={form.route} onChange={(e) => set("route", e.target.value)}>
              {["oral", "sublingual", "injection", "topical", "inhaled", "other"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Frequency
            <input placeholder="e.g. Twice daily with food" value={form.frequency} onChange={(e) => set("frequency", e.target.value)} />
          </label>
          <label>
            Scheduled doses per day
            <input type="number" min="0" placeholder="blank = as needed" value={form.times_per_day} onChange={(e) => set("times_per_day", e.target.value)} />
          </label>
          <label>
            Pills/units per dose
            <input type="number" min="1" value={form.units_per_dose} onChange={(e) => set("units_per_dose", e.target.value)} />
          </label>
          <label>
            Starting quantity on hand
            <input type="number" min="0" placeholder="blank = don't track" value={form.quantity_on_hand} onChange={(e) => set("quantity_on_hand", e.target.value)} />
          </label>
          <label>
            Start date
            <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
          </label>
          <label>
            Prescriber
            <input value={form.prescriber} onChange={(e) => set("prescriber", e.target.value)} />
          </label>
          <label>
            Pharmacy
            <input value={form.pharmacy} onChange={(e) => set("pharmacy", e.target.value)} />
          </label>
          <label>
            Rx number
            <input value={form.rx_number} onChange={(e) => set("rx_number", e.target.value)} />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.is_controlled} onChange={(e) => set("is_controlled", e.target.checked)} />
            Controlled substance (pill counts &amp; refills go to the activity log)
          </label>
          <label className="span-2">
            Instructions
            <input value={form.instructions} onChange={(e) => set("instructions", e.target.value)} />
          </label>
          <div className="span-2">
            <button className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save medication"}
            </button>
          </div>
        </form>
      )}

      {meds.length === 0 && <p className="muted">No medications on file.</p>}
      <div className="med-list">
        {meds.map((m) => {
          const due = m.active && m.times_per_day != null && m.taken_today < m.times_per_day;
          return (
            <div className={`card med-item ${m.active ? "" : "med-inactive"}`} key={m.id}>
              <div className="med-item-head">
                <div>
                  <strong>{m.name}</strong> {m.dose}
                  {m.is_controlled ? <span className="tag tag-controlled">controlled</span> : null}
                  {!m.active && <span className="tag tag-general tag-gap">discontinued {m.end_date || ""}</span>}
                  <div className="muted small">
                    {[m.route, m.frequency, m.prescriber && `Dr. ${m.prescriber.replace(/^dr\.?\s*/i, "")}`, m.pharmacy, m.rx_number && `Rx ${m.rx_number}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {m.instructions && <div className="small">{m.instructions}</div>}
                </div>
                <div className="med-stats">
                  {m.active ? (
                    <span className={`tag ${due ? "tag-pay-due" : "tag-ci-ok"}`}>
                      {m.taken_today}
                      {m.times_per_day != null ? ` / ${m.times_per_day}` : ""} today
                    </span>
                  ) : null}
                  <div className="small">
                    On hand: <strong>{m.quantity_on_hand ?? "not tracked"}</strong>
                  </div>
                  <div className="muted small">Last count: {fmtUtc(m.last_count)}</div>
                </div>
              </div>
              {m.active ? (
                <div className="dose-buttons">
                  <button className="btn-primary btn-sm" onClick={() => logDose(m, "taken")}>
                    Dose taken
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => logDose(m, "missed")}>
                    Missed
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => logDose(m, "refused")}>
                    Refused
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => logDose(m, "held")}>
                    Held
                  </button>
                  <span className="spacer" />
                  <button className="btn-link small" onClick={() => setAction({ medId: m.id, kind: "count" })}>
                    Pill count
                  </button>
                  <button className="btn-link small" onClick={() => setAction({ medId: m.id, kind: "refill" })}>
                    Refill received
                  </button>
                  <button className="btn-link small" onClick={() => setActive(m, false)}>
                    Discontinue
                  </button>
                </div>
              ) : (
                <button className="btn-link small" onClick={() => setActive(m, true)}>
                  Restart medication
                </button>
              )}
              {action?.medId === m.id && (
                <StockForm
                  med={m}
                  kind={action.kind}
                  base={base}
                  onDone={(msg) => {
                    setAction(null);
                    if (msg) alert(msg);
                    load();
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {inactiveCount > 0 && (
        <button className="btn-link small" onClick={() => setShowInactive((s) => !s)}>
          {showInactive ? "Hide" : "Show"} {inactiveCount} discontinued medication{inactiveCount === 1 ? "" : "s"}
        </button>
      )}

      <h2>Dose log</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Medication</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Observed by</th>
            </tr>
          </thead>
          <tbody>
            {data.doses.map((d) => (
              <tr key={d.id}>
                <td>{fmtUtc(d.dose_time)}</td>
                <td>
                  {d.medication_name} {d.medication_dose}
                </td>
                <td>
                  <span className={`tag tag-dose-${d.status}`}>{d.status}</span>
                </td>
                <td>{d.notes || "—"}</td>
                <td>{d.observed_by_name || "—"}</td>
              </tr>
            ))}
            {data.doses.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No doses logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Pill counts &amp; refills</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Medication</th>
              <th>Type</th>
              <th>Expected</th>
              <th>Counted / new total</th>
              <th>Difference</th>
              <th>By / witness</th>
            </tr>
          </thead>
          <tbody>
            {data.counts.map((c) => (
              <tr key={c.id}>
                <td>{fmtUtc(c.count_date)}</td>
                <td>{c.medication_name}</td>
                <td>{c.kind === "refill" ? "Refill" : "Count"}</td>
                <td>{c.expected_count ?? "—"}</td>
                <td>{c.actual_count}</td>
                <td>
                  {c.kind === "count" && c.expected_count != null ? (
                    <span className={`tag ${c.discrepancy === 0 ? "tag-ci-ok" : "tag-ci-flagged"}`}>
                      {c.discrepancy === 0 ? "matches" : `${c.discrepancy > 0 ? "+" : ""}${c.discrepancy}`}
                    </span>
                  ) : (
                    <span className="muted small">{c.notes}</span>
                  )}
                </td>
                <td>
                  {c.counted_by_name || "—"}
                  {c.witness_name ? ` / ${c.witness_name}` : ""}
                </td>
              </tr>
            ))}
            {data.counts.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No pill counts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockForm({
  med,
  kind,
  base,
  onDone,
}: {
  med: Medication;
  kind: "count" | "refill";
  base: string;
  onDone: (message?: string) => void;
}) {
  const [qty, setQty] = useState("");
  const [witness, setWitness] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (qty === "") return;
    setSaving(true);
    try {
      if (kind === "count") {
        const r = await api.post(`${base}/${med.id}/counts`, {
          actual_count: Number(qty),
          witness_name: witness || null,
          notes: notes || null,
        });
        onDone(
          r.expected != null && r.discrepancy !== 0
            ? `Discrepancy recorded: expected ${r.expected}, counted ${r.actual}. This has been added to the activity log.`
            : undefined
        );
      } else {
        await api.post(`${base}/${med.id}/refill`, { quantity: Number(qty), notes: notes || null });
        onDone();
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Failed");
      setSaving(false);
    }
  }

  return (
    <form className="inline-form stock-form" onSubmit={submit}>
      <input
        type="number"
        min={kind === "count" ? 0 : 1}
        placeholder={kind === "count" ? `Counted (expected ${med.quantity_on_hand ?? "?"})` : "Quantity received"}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        autoFocus
      />
      {kind === "count" && <input placeholder="Witness (optional)" value={witness} onChange={(e) => setWitness(e.target.value)} />}
      <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn-primary btn-sm" disabled={saving}>
        {kind === "count" ? "Save count" : "Add to stock"}
      </button>
      <button type="button" className="btn-link small" onClick={() => onDone()}>
        Cancel
      </button>
      {err && <div className="alert">{err}</div>}
    </form>
  );
}
