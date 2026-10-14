const BASE = "/api";

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) =>
    request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: unknown) =>
    request(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: (path: string) => request(path, { method: "DELETE" }),
};

export type Staff = { id: number; name: string; email: string; role: string };

export type Room = {
  id: number;
  room_name: string;
  bed_label: string;
  monthly_rate: number;
  resident_id: number | null;
  first_name: string | null;
  last_name: string | null;
};

export type Resident = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  referral_source: string | null;
  intake_date: string;
  move_out_date: string | null;
  status: "active" | "alumni" | "discharged";
  bed_id: number | null;
  room_name?: string | null;
  bed_label?: string | null;
};

export type CheckIn = {
  id: number;
  resident_id: number;
  checkin_date: string;
  checkin_type: string;
  status: string;
  notes: string | null;
  recorded_by_name?: string | null;
};

export type CaseNote = {
  id: number;
  resident_id: number;
  category: string;
  note: string;
  author_name?: string | null;
  created_at: string;
};

export type Payment = {
  id: number;
  resident_id: number;
  amount_cents: number;
  due_date: string;
  paid_date: string | null;
  status: "due" | "paid" | "late" | "waived";
  notes: string | null;
};

export type CustomFieldDef = {
  id: number;
  entity: string;
  field_key: string;
  label: string;
  field_type: "text" | "number" | "date" | "select" | "checkbox";
  options: string[] | null;
  sort_order: number;
};

export type Screening = {
  id: number;
  resident_id: number;
  test_date: string;
  panel: string | null;
  result: "pending" | "negative" | "positive" | "inconclusive" | "refused";
  substances_flagged: string | null;
  notes: string | null;
  administered_by_name?: string | null;
};

export type Task = {
  id: number;
  resident_id: number | null;
  title: string;
  due_date: string | null;
  assigned_to: number | null;
  assigned_to_name?: string | null;
  status: "open" | "done";
  first_name?: string | null;
  last_name?: string | null;
};

export type AuditEntry = {
  id: number;
  staff_id: number | null;
  staff_name: string | null;
  action: string;
  entity: string;
  entity_id: number | null;
  summary: string;
  created_at: string;
};

export type ResidentDetail = Resident & {
  checkins: CheckIn[];
  notes: CaseNote[];
  payments: Payment[];
  screenings: Screening[];
  tasks: Task[];
  customFields: Record<string, string>;
};

export type DashboardSummary = {
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  activeResidents: number;
  checkinsToday: number;
  flaggedCheckins: number;
  overduePayments: number;
  openTasks: number;
  overdueTasks: number;
  pendingScreenings: number;
  recentNotes: Array<{
    id: number;
    category: string;
    note: string;
    created_at: string;
    first_name: string;
    last_name: string;
    author_name: string | null;
  }>;
};
