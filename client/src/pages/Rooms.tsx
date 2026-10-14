import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Room } from "../api";
import { useAuth } from "../AuthContext";

export default function Rooms() {
  const { staff } = useAuth();
  const isAdmin = staff?.role === "admin";
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ room_name: "", bed_label: "", monthly_rate: "" });

  function load() {
    api.get("/rooms").then(setRooms).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleAddBed(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/rooms", {
        room_name: form.room_name,
        bed_label: form.bed_label,
        monthly_rate: form.monthly_rate ? Math.round(Number(form.monthly_rate) * 100) : 0,
      });
      setForm({ room_name: "", bed_label: "", monthly_rate: "" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add bed");
    }
  }

  const grouped = rooms.reduce<Record<string, Room[]>>((acc, r) => {
    (acc[r.room_name] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Rooms &amp; Beds</h1>
          <p className="muted">Occupancy board.</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Add bed"}
          </button>
        )}
      </div>

      {error && <div className="alert">{error}</div>}

      {showForm && isAdmin && (
        <form className="card form-grid" onSubmit={handleAddBed}>
          <label>
            Room name
            <input
              value={form.room_name}
              onChange={(e) => setForm((f) => ({ ...f, room_name: e.target.value }))}
              required
            />
          </label>
          <label>
            Bed label
            <input
              value={form.bed_label}
              onChange={(e) => setForm((f) => ({ ...f, bed_label: e.target.value }))}
              required
            />
          </label>
          <label>
            Monthly rate ($)
            <input
              type="number"
              value={form.monthly_rate}
              onChange={(e) => setForm((f) => ({ ...f, monthly_rate: e.target.value }))}
            />
          </label>
          <div className="span-2">
            <button type="submit" className="btn-primary">
              Save bed
            </button>
          </div>
        </form>
      )}

      <div className="bed-board">
        {Object.entries(grouped).map(([roomName, beds]) => (
          <div className="room-card" key={roomName}>
            <h3>{roomName}</h3>
            <div className="bed-list">
              {beds.map((b) => (
                <div key={b.id} className={`bed ${b.resident_id ? "bed-occupied" : "bed-open"}`}>
                  <div className="bed-label">{b.bed_label}</div>
                  {b.resident_id ? (
                    <Link to={`/residents/${b.resident_id}`}>
                      {b.first_name} {b.last_name}
                    </Link>
                  ) : (
                    <span className="muted">Open</span>
                  )}
                  <div className="muted small">${(b.monthly_rate / 100).toFixed(0)}/mo</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {rooms.length === 0 && <p className="muted">No rooms/beds set up yet.</p>}
      </div>
    </div>
  );
}
