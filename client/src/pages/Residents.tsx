import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Resident, type Room, type CustomFieldDef } from "../api";
import CustomFieldsForm from "../CustomFieldsForm";

export default function Residents() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);

  function load() {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    api
      .get(`/residents${q}`)
      .then(setResidents)
      .catch((e) => setError(e.message));
    api.get("/rooms").then(setRooms).catch(() => {});
  }

  useEffect(load, [statusFilter]);
  useEffect(() => {
    api.get("/custom-fields?entity=resident").then(setFieldDefs).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Residents</h1>
          <p className="muted">Intake, roster, and status.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New resident"}
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      {showForm && (
        <NewResidentForm
          rooms={rooms}
          fieldDefs={fieldDefs}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <div className="filter-row">
        {["active", "alumni", "discharged", ""].map((s) => (
          <button
            key={s || "all"}
            className={`chip ${statusFilter === s ? "chip-active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s || "all"}
          </button>
        ))}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Room / Bed</th>
            <th>Intake date</th>
            <th>Status</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {residents.map((r) => (
            <tr key={r.id}>
              <td>
                <Link to={`/residents/${r.id}`}>
                  {r.first_name} {r.last_name}
                </Link>
              </td>
              <td>
                {r.room_name ? `${r.room_name} / ${r.bed_label}` : <span className="muted">unassigned</span>}
              </td>
              <td>{r.intake_date}</td>
              <td>
                <span className={`tag tag-status-${r.status}`}>{r.status}</span>
              </td>
              <td>{r.phone || <span className="muted">—</span>}</td>
            </tr>
          ))}
          {residents.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No residents found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function NewResidentForm({
  rooms,
  fieldDefs,
  onCreated,
}: {
  rooms: Room[];
  fieldDefs: CustomFieldDef[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    emergency_contact_relation: "",
    referral_source: "",
    intake_date: new Date().toISOString().slice(0, 10),
    bed_id: "",
  });
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const availableBeds = rooms.filter((r) => !r.resident_id);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/residents", {
        ...form,
        bed_id: form.bed_id ? Number(form.bed_id) : null,
        custom_fields: customValues,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create resident");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      {error && <div className="alert span-2">{error}</div>}
      <label>
        First name
        <input
          value={form.first_name}
          onChange={(e) => update("first_name", e.target.value)}
          required
        />
      </label>
      <label>
        Last name
        <input
          value={form.last_name}
          onChange={(e) => update("last_name", e.target.value)}
          required
        />
      </label>
      <label>
        Phone
        <input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
      </label>
      <label>
        Email
        <input value={form.email} onChange={(e) => update("email", e.target.value)} />
      </label>
      <label>
        Intake date
        <input
          type="date"
          value={form.intake_date}
          onChange={(e) => update("intake_date", e.target.value)}
          required
        />
      </label>
      <label>
        Bed assignment
        <select value={form.bed_id} onChange={(e) => update("bed_id", e.target.value)}>
          <option value="">Unassigned</option>
          {availableBeds.map((b) => (
            <option key={b.id} value={b.id}>
              {b.room_name} / {b.bed_label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Referral source
        <input
          value={form.referral_source}
          onChange={(e) => update("referral_source", e.target.value)}
        />
      </label>
      <div />
      <label>
        Emergency contact name
        <input
          value={form.emergency_contact_name}
          onChange={(e) => update("emergency_contact_name", e.target.value)}
        />
      </label>
      <label>
        Emergency contact phone
        <input
          value={form.emergency_contact_phone}
          onChange={(e) => update("emergency_contact_phone", e.target.value)}
        />
      </label>
      <label>
        Relation
        <input
          value={form.emergency_contact_relation}
          onChange={(e) => update("emergency_contact_relation", e.target.value)}
        />
      </label>

      <CustomFieldsForm
        defs={fieldDefs}
        values={customValues}
        onChange={(key, value) => setCustomValues((v) => ({ ...v, [key]: value }))}
      />

      <div className="span-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving..." : "Save resident"}
        </button>
      </div>
    </form>
  );
}
