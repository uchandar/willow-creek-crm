import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Task } from "../api";

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "">("open");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    api
      .get(`/tasks${q}`)
      .then(setTasks)
      .catch((e) => setError(e.message));
  }

  useEffect(load, [statusFilter]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.post("/tasks", { title, due_date: dueDate || null });
      setTitle("");
      setDueDate("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task");
    }
  }

  async function toggleDone(task: Task) {
    await api.put(`/tasks/${task.id}`, { status: task.status === "done" ? "open" : "done" });
    load();
  }

  return (
    <div>
      <h1>Tasks</h1>
      <p className="muted">House-wide follow-ups — move-ins, renewals, maintenance, anything with a due date.</p>

      {error && <div className="alert">{error}</div>}

      <form className="inline-form" onSubmit={handleAdd}>
        <input
          placeholder="New task (e.g. Renew lease for Room 2)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button type="submit" className="btn-primary">
          Add task
        </button>
      </form>

      <div className="filter-row">
        {(["open", "done", ""] as const).map((s) => (
          <button
            key={s || "all"}
            className={`chip ${statusFilter === s ? "chip-active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s || "all"}
          </button>
        ))}
      </div>

      <ul className="note-list">
        {tasks.map((t) => (
          <li key={t.id} className={t.status === "done" ? "task-done" : ""}>
            <div className="note-list-head">
              <label className="task-check">
                <input type="checkbox" checked={t.status === "done"} onChange={() => toggleDone(t)} />
                {t.title}
              </label>
              {t.due_date && <span className="muted small">due {t.due_date}</span>}
            </div>
            {t.first_name && (
              <div className="muted small">
                Resident:{" "}
                <Link to={`/residents/${t.resident_id}`}>
                  {t.first_name} {t.last_name}
                </Link>
              </div>
            )}
          </li>
        ))}
        {tasks.length === 0 && <li className="muted">No tasks here.</li>}
      </ul>
    </div>
  );
}
