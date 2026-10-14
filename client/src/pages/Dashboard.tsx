import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DashboardSummary } from "../api";

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/dashboard")
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!summary) return <div className="muted">Loading...</div>;

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">Today at a glance.</p>

      <div className="stat-grid">
        <StatCard label="Active residents" value={summary.activeResidents} />
        <StatCard
          label="Beds occupied"
          value={`${summary.occupiedBeds} / ${summary.totalBeds}`}
        />
        <StatCard label="Available beds" value={summary.availableBeds} accent="good" />
        <StatCard label="Check-ins today" value={summary.checkinsToday} />
        <StatCard
          label="Flagged / missed today"
          value={summary.flaggedCheckins}
          accent={summary.flaggedCheckins > 0 ? "warn" : undefined}
        />
        <StatCard
          label="Overdue payments"
          value={summary.overduePayments}
          accent={summary.overduePayments > 0 ? "warn" : undefined}
        />
        <StatCard label="Open tasks" value={summary.openTasks} />
        <StatCard
          label="Overdue tasks"
          value={summary.overdueTasks}
          accent={summary.overdueTasks > 0 ? "warn" : undefined}
        />
        <StatCard
          label="Pending screenings"
          value={summary.pendingScreenings}
          accent={summary.pendingScreenings > 0 ? "warn" : undefined}
        />
      </div>

      <h2>Recent case notes</h2>
      {summary.recentNotes.length === 0 && (
        <p className="muted">No case notes yet.</p>
      )}
      <ul className="note-list">
        {summary.recentNotes.map((n) => (
          <li key={n.id}>
            <div className="note-list-head">
              <Link to={`/residents`}>
                {n.first_name} {n.last_name}
              </Link>
              <span className={`tag tag-${n.category}`}>{n.category}</span>
              <span className="muted small">
                {new Date(n.created_at).toLocaleString()}
              </span>
            </div>
            <div>{n.note}</div>
            {n.author_name && <div className="muted small">— {n.author_name}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "good" | "warn";
}) {
  return (
    <div className={`stat-card ${accent ? `stat-${accent}` : ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
