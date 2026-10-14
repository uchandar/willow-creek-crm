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
  qr_token?: string | null;
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
  specimen_type?: string | null;
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
  meetings: ResidentMeeting[];
};

export type ResidentMeeting = {
  id: number;
  meeting_id: number;
  title: string;
  meeting_type: string;
  meeting_date: string;
  method: "qr" | "manual";
  checked_in_at: string;
  recorded_by_name: string | null;
};

export type Meeting = {
  id: number;
  title: string;
  meeting_type: string;
  meeting_date: string;
  start_time: string | null;
  location: string | null;
  created_by_name: string | null;
  attendee_count?: number;
};

export type MeetingDetail = Meeting & {
  attendees: Array<{
    id: number;
    resident_id: number;
    first_name: string;
    last_name: string;
    method: "qr" | "manual";
    checked_in_at: string;
    recorded_by_name: string | null;
  }>;
  notCheckedIn: Array<{ id: number; first_name: string; last_name: string }>;
};

export type AttendanceSummary = {
  from: string;
  to: string;
  houseMeetingsHeld: number;
  residents: Array<{
    id: number;
    first_name: string;
    last_name: string;
    attended: number;
    house: number;
    outside: number;
    last_meeting: string | null;
  }>;
};

export type Medication = {
  id: number;
  resident_id: number;
  name: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  times_per_day: number | null;
  units_per_dose: number;
  prescriber: string | null;
  pharmacy: string | null;
  rx_number: string | null;
  start_date: string | null;
  end_date: string | null;
  is_controlled: number;
  quantity_on_hand: number | null;
  instructions: string | null;
  active: number;
  taken_today: number;
  last_taken: string | null;
  last_count: string | null;
};

export type MedicationDose = {
  id: number;
  medication_id: number;
  medication_name: string;
  medication_dose: string | null;
  status: "taken" | "missed" | "refused" | "held";
  dose_time: string;
  observed_by_name: string | null;
  notes: string | null;
};

export type PillCount = {
  id: number;
  medication_id: number;
  medication_name: string;
  kind: "count" | "refill";
  count_date: string;
  expected_count: number | null;
  actual_count: number;
  discrepancy: number;
  counted_by_name: string | null;
  witness_name: string | null;
  notes: string | null;
};

export type MedPassRow = {
  id: number;
  resident_id: number;
  first_name: string;
  last_name: string;
  name: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  times_per_day: number | null;
  is_controlled: number;
  quantity_on_hand: number | null;
  instructions: string | null;
  taken_today: number;
  missed_today: number;
  last_taken: string | null;
};

// SQLite stores UTC "YYYY-MM-DD HH:MM:SS"; show it in the viewer's local time.
export function fmtUtc(ts: string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!ts) return "—";
  const d = new Date(ts.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, opts ?? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const MEETING_TYPES: Record<string, string> = {
  house: "House meeting",
  aa: "AA",
  na: "NA",
  smart: "SMART Recovery",
  celebrate_recovery: "Celebrate Recovery",
  other: "Other",
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
  dosesOutstanding: number;
  missedDosesToday: number;
  pillCountDiscrepancies: number;
  meetingAttendanceToday: number;
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
