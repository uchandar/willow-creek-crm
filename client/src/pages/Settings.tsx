import { useEffect, useState } from "react";
import { api, type CustomFieldDef } from "../api";

const FIELD_TYPES = ["text", "number", "date", "select", "checkbox"] as const;

export default function Settings() {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<(typeof FIELD_TYPES)[number]>("text");
  const [optionsText, setOptionsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get("/custom-fields?entity=resident")
      .then(setDefs)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setError(null);
    try {
      await api.post("/custom-fields", {
        entity: "resident",
        label,
        field_type: fieldType,
        options: fieldType === "select" ? optionsText.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      });
      setLabel("");
      setOptionsText("");
      setFieldType("text");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add field");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this field? Existing values for it will be removed from resident records.")) return;
    try {
      await api.del(`/custom-fields/${id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete field");
    }
  }

  return (
    <div>
      <h1>Settings</h1>
      <p className="muted">
        Admin-only. Define custom fields for resident records — the same idea Twenty CRM and Krayin use for
        custom objects, so you can track things like "Case Worker" or "Insurance Provider" without a code change.
      </p>

      {error && <div className="alert">{error}</div>}

      <div className="card">
        <h3>Add a custom field</h3>
        <form className="inline-form" onSubmit={handleAdd}>
          <input placeholder="Field label (e.g. Case Worker)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value as typeof fieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {fieldType === "select" && (
            <input
              placeholder="Options, comma separated"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
            />
          )}
          <button type="submit" className="btn-primary">
            Add field
          </button>
        </form>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Key</th>
            <th>Type</th>
            <th>Options</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {defs.map((d) => (
            <tr key={d.id}>
              <td>{d.label}</td>
              <td className="muted">{d.field_key}</td>
              <td>{d.field_type}</td>
              <td className="muted">{d.options ? d.options.join(", ") : "—"}</td>
              <td>
                <button className="btn-link" onClick={() => handleDelete(d.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {defs.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No custom fields defined yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
