import type { CustomFieldDef } from "./api";

export default function CustomFieldsForm({
  defs,
  values,
  onChange,
}: {
  defs: CustomFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (defs.length === 0) return null;
  return (
    <>
      {defs.map((def) => (
        <label key={def.id}>
          {def.label}
          {def.field_type === "select" ? (
            <select
              value={values[def.field_key] || ""}
              onChange={(e) => onChange(def.field_key, e.target.value)}
            >
              <option value="">—</option>
              {(def.options || []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : def.field_type === "checkbox" ? (
            <select
              value={values[def.field_key] || ""}
              onChange={(e) => onChange(def.field_key, e.target.value)}
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          ) : (
            <input
              type={def.field_type === "number" ? "number" : def.field_type === "date" ? "date" : "text"}
              value={values[def.field_key] || ""}
              onChange={(e) => onChange(def.field_key, e.target.value)}
            />
          )}
        </label>
      ))}
    </>
  );
}
