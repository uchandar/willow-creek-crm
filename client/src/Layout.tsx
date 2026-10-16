import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Layout() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">WC</div>
          <div>
            <div className="brand-name">Willow Creek</div>
            <div className="brand-sub">Sober Living CRM</div>
          </div>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/residents" className={({ isActive }) => (isActive ? "active" : "")}>
            Residents
          </NavLink>
          <NavLink to="/rooms" className={({ isActive }) => (isActive ? "active" : "")}>
            Rooms &amp; Beds
          </NavLink>
          <NavLink to="/calendar" className={({ isActive }) => (isActive ? "active" : "")}>
            Calendar
          </NavLink>
          <NavLink to="/meetings" className={({ isActive }) => (isActive ? "active" : "")}>
            House meetings
          </NavLink>
          <NavLink to="/med-pass" className={({ isActive }) => (isActive ? "active" : "")}>
            Med pass
          </NavLink>
          <NavLink to="/tasks" className={({ isActive }) => (isActive ? "active" : "")}>
            Tasks
          </NavLink>
          {staff?.role === "admin" && (
            <>
              <NavLink to="/activity-log" className={({ isActive }) => (isActive ? "active" : "")}>
                Activity log
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
                Settings
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="staff-name">{staff?.name}</div>
          <div className="staff-role">{staff?.role?.replace("_", " ")}</div>
          <button className="btn-link" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
