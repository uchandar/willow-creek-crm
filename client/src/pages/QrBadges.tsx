import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Resident } from "../api";
import QrCode, { badgePayload } from "../QrCode";

export default function QrBadges() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/residents?status=active").then(setResidents).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-head no-print">
        <div>
          <Link to="/meetings" className="back-link">
            ← Back to meetings
          </Link>
          <h1>Resident QR badges</h1>
          <p className="muted">
            Print and cut out one badge per active resident. Badges contain only a random code — no names or
            health information are stored in the QR.
          </p>
        </div>
        <button className="btn-primary" onClick={() => window.print()}>
          Print badges
        </button>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="badge-sheet">
        {residents.map((r) =>
          r.qr_token ? (
            <div className="badge" key={r.id}>
              <div className="badge-brand">Willow Creek Sober Living</div>
              <QrCode value={badgePayload(r.qr_token)} size={150} />
              <div className="badge-name">
                {r.first_name} {r.last_name}
              </div>
              <div className="badge-sub">Meeting check-in</div>
            </div>
          ) : null
        )}
        {residents.length === 0 && !error && <p className="muted">No active residents.</p>}
      </div>
    </div>
  );
}
