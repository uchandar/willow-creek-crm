import { useEffect, useState } from "react";
import { api, type AuditEntry } from "../api";

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/audit-log?limit=200")
      .then(setEntries)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1>Activity log</h1>
      <p className="muted">
        Admin-only record of who changed what — status changes, flagged check-ins, incident notes, screening
        results, and permission-gated actions. Mirrors the role/permission auditing EspoCRM builds in for
        HIPAA-adjacent privacy needs.
      </p>

      {error && <div className="alert">{error}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Staff</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="muted small">{e.created_at}</td>
              <td>{e.staff_name || <span className="muted">system</span>}</td>
              <td>
                <span className="tag tag-general">{e.action}</span>
              </td>
              <td className="muted">{e.entity}</td>
              <td>{e.summary}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No activity recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
