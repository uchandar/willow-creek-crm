import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Layout from "./Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Residents from "./pages/Residents";
import ResidentDetail from "./pages/ResidentDetail";
import Rooms from "./pages/Rooms";
import Tasks from "./pages/Tasks";
import Settings from "./pages/Settings";
import AuditLog from "./pages/AuditLog";
import Meetings from "./pages/Meetings";
import MeetingDetail from "./pages/MeetingDetail";
import QrBadges from "./pages/QrBadges";
import MedPass from "./pages/MedPass";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { staff, loading } = useAuth();
  if (loading) return <div className="muted center-screen">Loading...</div>;
  if (!staff) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { staff, loading } = useAuth();
  if (loading) return <div className="muted center-screen">Loading...</div>;
  if (!staff || staff.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="residents" element={<Residents />} />
        <Route path="residents/:id" element={<ResidentDetail />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="meetings/:id" element={<MeetingDetail />} />
        <Route path="qr-badges" element={<QrBadges />} />
        <Route path="med-pass" element={<MedPass />} />
        <Route
          path="settings"
          element={
            <RequireAdmin>
              <Settings />
            </RequireAdmin>
          }
        />
        <Route
          path="activity-log"
          element={
            <RequireAdmin>
              <AuditLog />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
