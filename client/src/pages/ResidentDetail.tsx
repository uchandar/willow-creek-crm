import { Fragment, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type ResidentDetail, type CustomFieldDef } from "../api";
import CustomFieldsForm from "../CustomFieldsForm";

export default function ResidentDetailPage() {
  const { id } = useParams();
  const [resident, setResident] = useState<ResidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"checkins" | "screenings" | "notes" | "tasks" | "payments">(
    "checkins"
  );
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);

  function load() {
    api
      .get(`/residents/${id}`)
      .then(setResident)
      .catch((e) => setError(e.message));
  }

  useEffect(load, [id]);
  useEffect(() => {
    api.get("/custom-fields?entity=resident").then(setFieldDefs).catch(() => {});
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!resident) return <div className="muted">Loading...</div>;

  return (
    <div>
      <Link to="/residents" className="back-link">
        ← Back to residents
      </Link>

      <div className="page-head">
        <div>
          <h1>
            {resident.first_name} {resident.last_name}
          </h1>
          <p className="muted">
            {resident.room_name ? `${resident.room_name} / ${resident.bed_label}` : "Unassigned"}
            {" · "}
            <span className={`tag tag-status-${resident.status}`}>{resident.status}</span>
          </p>
        </div>
        <StatusControl resident={resident} onChange={load} />
      </div>

      <div className="detail-grid">
        <div className="card">
          <h3>Contact</h3>
          <dl>
            <dt>Phone</dt>
            <dd>{resident.phone || "—"}</dd>
            <dt>Email</dt>
            <dd>{resident.email || "—"}</dd>
            <dt>Intake date</dt>
            <dd>{resident.intake_date}</dd>
            <dt>Referral source</dt>
            <dd>{resident.referral_source || "—"}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Emergency contact</h3>
          <dl>
            <dt>Name</dt>
            <dd>{resident.emergency_contact_name || "—"}</dd>
            <dt>Phone</dt>
            <dd>{resident.emergency_contact_phone || "—"}</dd>
            <dt>Relation</dt>
            <dd>{resident.emergency_contact_relation || "—"}</dd>
          </dl>
        </div>
        {fieldDefs.length > 0 && (
          <CustomFieldsCard resident={resident} fieldDefs={fieldDefs} onChange={load} />
        )}
      </div>

      <div className="tab-row">
        <button className={tab === "checkins" ? "tab-active" : ""} onClick={() => setTab("checkins")}>
          Check-ins
        </button>
        <button className={tab === "screenings" ? "tab-active" : ""} onClick={() => setTab("screenings")}>
          Drug screenings
        </button>
        <button className={tab === "notes" ? "tab-active" : ""} onClick={() => setTab("notes")}>
          Case notes
        </button>
        <button className={tab === "tasks" ? "tab-active" : ""} onClick={() => setTab("tasks")}>
          Tasks
        </button>
        <button className={tab === "payments" ? "tab-active" : ""} onClick={() => setTab("payments")}>
          Payments
        </button>
      </div>

      {tab === "checkins" && <CheckInsPanel residentId={resident.id} checkins={resident.checkins} onChange={load} />}
      {tab === "screenings" && (
        <ScreeningsPanel residentId={resident.id} screenings={resident.screenings} onChange={load} />
      )}
      {tab === "notes" && <NotesPanel residentId={resident.id} notes={resident.notes} onChange={load} />}
      {tab === "tasks" && <TasksPanel residentId={resident.id} tasks={resident.tasks} onChange={load} />}
      {tab === "payments" && <PaymentsPanel residentId={resident.id} payments={resident.payments} onChange={load} />}
    </div>
  );
}

function CustomFieldsCard({
  resident,
  fieldDefs,
  onChange,
}: {
  resident: ResidentDetail;
  fieldDefs: CustomFieldDef[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(resident.customFields || {});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/residents/${resident.id}`, { custom_fields: values });
      setEditing(false);
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head-row">
        <h3>Additional details</h3>
        <button className="btn-link" onClick={() => setEditing((e) => !e)}>
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      {editing ? (
        <div className="form-grid">
          <CustomFieldsForm
            defs={fieldDefs}
            values={values}
            onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
          />
          <div className="span-2">
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <dl>
          {fieldDefs.map((def) => (
            <Fragment key={def.id}>
              <dt>{def.label}</dt>
              <dd>{resident.customFields?.[def.field_key] || "—"}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

function StatusControl({ resident, onChange }: { resident: ResidentDetail; onChange: () => void }) {
  const [saving, setSaving] = useState(false);
  async function setStatus(status: string) {
    setSaving(true);
    try {
      await api.put(`/residents/${resident.id}`, {
        status,
        move_out_date: status !== "active" ? new Date().toISOString().slice(0, 10) : null,
      });
      onChange();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="status-control">
      {["active", "alumni", "discharged"].map((s) => (
        <button
          key={s}
          className={`chip ${resident.status === s ? "chip-active" : ""}`}
          disabled={saving}
          onClick={() => setStatus(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function CheckInsPanel({
  residentId,
  checkins,
  onChange,
}: {
  residentId: number;
  checkins: ResidentDetail["checkins"];
  onChange: () => void;
}) {
  const [type, setType] = useState("daily");
  const [status, setStatus] = useState("ok");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/residents/${residentId}/checkins`, {
        checkin_type: type,
        status,
        notes: notes || null,
      });
      setNotes("");
      onChange();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form className="inline-form" onSubmit={handleAdd}>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="curfew">Curfew</option>
          <option value="drug_test">Drug test</option>
          <option value="chore">Chore</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ok">OK</option>
          <option value="missed">Missed</option>
          <option value="flagged">Flagged</option>
        </select>
        <input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={submitting}>
          Log check-in
        </button>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Status</th>
            <th>Notes</th>
            <th>Recorded by</th>
          </tr>
        </thead>
        <tbody>
          {checkins.map((c) => (
            <tr key={c.id}>
              <td>{c.checkin_date}</td>
              <td>{c.checkin_type}</td>
              <td>
                <span className={`tag tag-ci-${c.status}`}>{c.status}</span>
              </td>
              <td>{c.notes || "—"}</td>
              <td>{c.recorded_by_name || "—"}</td>
            </tr>
          ))}
          {checkins.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No check-ins logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function NotesPanel({
  residentId,
  notes,
  onChange,
}: {
  residentId: number;
  notes: ResidentDetail["notes"];
  onChange: () => void;
}) {
  const [category, setCategory] = useState("general");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/residents/${residentId}/notes`, { category, note });
      setNote("");
      onChange();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form className="inline-form stacked" onSubmit={handleAdd}>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="general">General</option>
          <option value="incident">Incident</option>
          <option value="progress">Progress</option>
          <option value="family_contact">Family contact</option>
        </select>
        <textarea
          placeholder="Write a case note..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <button type="submit" className="btn-primary" disabled={submitting}>
          Add note
        </button>
      </form>

      <ul className="note-list">
        {notes.map((n) => (
          <li key={n.id}>
            <div className="note-list-head">
              <span className={`tag tag-${n.category}`}>{n.category}</span>
              <span className="muted small">{new Date(n.created_at).toLocaleString()}</span>
            </div>
            <div>{n.note}</div>
            {n.author_name && <div className="muted small">— {n.author_name}</div>}
          </li>
        ))}
        {notes.length === 0 && <li className="muted">No case notes yet.</li>}
      </ul>
    </div>
  );
}

function PaymentsPanel({
  residentId,
  payments,
  onChange,
}: {
  residentId: number;
  payments: ResidentDetail["payments"];
  onChange: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    setSubmitting(true);
    try {
      await api.post(`/residents/${residentId}/payments`, {
        amount_cents: Math.round(Number(amount) * 100),
        due_date: dueDate,
      });
      setAmount("");
      onChange();
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid(paymentId: number) {
    await api.put(`/residents/${residentId}/payments/${paymentId}`, {
      status: "paid",
      paid_date: new Date().toISOString().slice(0, 10),
    });
    onChange();
  }

  return (
    <div>
      <form className="inline-form" onSubmit={handleAdd}>
        <input
          type="number"
          placeholder="Amount ($)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button type="submit" className="btn-primary" disabled={submitting}>
          Add charge
        </button>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>Due date</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Paid date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>{p.due_date}</td>
              <td>${(p.amount_cents / 100).toFixed(2)}</td>
              <td>
                <span className={`tag tag-pay-${p.status}`}>{p.status}</span>
              </td>
              <td>{p.paid_date || "—"}</td>
              <td>
                {p.status !== "paid" && (
                  <button className="btn-link" onClick={() => markPaid(p.id)}>
                    Mark paid
                  </button>
                )}
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No charges logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ScreeningsPanel({
  residentId,
  screenings,
  onChange,
}: {
  residentId: number;
  screenings: ResidentDetail["screenings"];
  onChange: () => void;
}) {
  const [panel, setPanel] = useState("12-panel");
  const [result, setResult] = useState("negative");
  const [substances, setSubstances] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/residents/${residentId}/screenings`, {
        panel,
        result,
        substances_flagged: result === "positive" ? substances : null,
      });
      setSubstances("");
      onChange();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="Panel (e.g. 12-panel)" value={panel} onChange={(e) => setPanel(e.target.value)} />
        <select value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="negative">Negative</option>
          <option value="positive">Positive</option>
          <option value="inconclusive">Inconclusive</option>
          <option value="refused">Refused</option>
          <option value="pending">Pending (send to lab)</option>
        </select>
        {result === "positive" && (
          <input
            placeholder="Substances flagged"
            value={substances}
            onChange={(e) => setSubstances(e.target.value)}
          />
        )}
        <button type="submit" className="btn-primary" disabled={submitting}>
          Log screening
        </button>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Panel</th>
            <th>Result</th>
            <th>Flagged substances</th>
            <th>Administered by</th>
          </tr>
        </thead>
        <tbody>
          {screenings.map((s) => (
            <tr key={s.id}>
              <td>{s.test_date}</td>
              <td>{s.panel || "—"}</td>
              <td>
                <span className={`tag tag-screen-${s.result}`}>{s.result}</span>
              </td>
              <td>{s.substances_flagged || "—"}</td>
              <td>{s.administered_by_name || "—"}</td>
            </tr>
          ))}
          {screenings.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No screenings logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TasksPanel({
  residentId,
  tasks,
  onChange,
}: {
  residentId: number;
  tasks: ResidentDetail["tasks"];
  onChange: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/tasks", { title, due_date: dueDate || null, resident_id: residentId });
      setTitle("");
      setDueDate("");
      onChange();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleDone(taskId: number, currentStatus: string) {
    await api.put(`/tasks/${taskId}`, { status: currentStatus === "done" ? "open" : "done" });
    onChange();
  }

  return (
    <div>
      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="New task" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button type="submit" className="btn-primary" disabled={submitting}>
          Add task
        </button>
      </form>

      <ul className="note-list">
        {tasks.map((t) => (
          <li key={t.id} className={t.status === "done" ? "task-done" : ""}>
            <div className="note-list-head">
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={() => toggleDone(t.id, t.status)}
                />
                {t.title}
              </label>
              {t.due_date && <span className="muted small">due {t.due_date}</span>}
            </div>
          </li>
        ))}
        {tasks.length === 0 && <li className="muted">No tasks yet.</li>}
      </ul>
    </div>
  );
}
