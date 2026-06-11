import { createClient } from "@supabase/supabase-js";
import AuthPage, { AuthUser, MOCK_USERS } from "./AuthPage";
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
);

import { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  MessageSquare,
  ChevronDown,
  ChevronUp,
  X,
  Send,
  CheckCircle2,
  Clock,
  Circle,
  AlertCircle,
  Mail,
  LayoutDashboard,
  Sparkles,  
  Building2,
  FolderKanban,
  ExternalLink,
  ArrowRight,
  Copy,
  Check,
  User,
  Link2,
  ChevronRight,
  Download,
  Upload,
  ShieldCheck,
  UserCircle,
  LogOut,
  Lock,
} from "lucide-react";
import * as XLSX from "xlsx";


// ─── Types ───────────────────────────────────────────────────────────────────

type TaskStatus = "Achieved" | "Working on" | "Delayed" | "Upcoming";
type View = "dashboard" | "email";

interface Task {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  feedback?: string;
  retryRequired?: boolean;
  weeklyProgress: number;
  overallProgress: number;
}

interface Sprint {
  id: number;
  week: number;
  title: string;
  tasks: Task[];
  currentWeek?: boolean;
}

const STATUS_COLORS = {
  achieved: "#16a34a",
  working: "#d97706",
  delayed: "#dc2626",
  upcoming: "#6b7280",
};

const STATUS_LABELS = {
  achieved: "Achieved",
  working: "Working on",
  delayed: "Delayed",
  upcoming: "Upcoming",
};
// ─── Data ────────────────────────────────────────────────────────────────────

  type RawTemplateRow = {
  week?: number | string;
  milestone?: string;
  task?: string;
  description?: string;
  status?: TaskStatus | string;
  feedback?: string;
  retryRequired?: boolean | string;
};

function normalizeStatus(value: unknown): TaskStatus {
  const v = String(value ?? "").trim().toLowerCase();

  if (v === "achieved") return "Achieved";
  if (v === "working on" || v === "in progress") return "Working on";
  if (v === "delayed") return "Delayed";
  if (v === "upcoming") return "Upcoming";

  console.warn("Unknown task status, fallback to Upcoming:", value);
  return "Upcoming";
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  }
  return "";
}

function toDisplayPercent(value: unknown): number {
  const n = Number(String(value ?? "").replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(n)) return 0;
  // Excel percent-formatted cells often come as 0..1
  return n <= 1 ? Number((n * 100).toFixed(2)) : Number(n.toFixed(2));
}

function rowsToSprintsFromSheetRows(rows: (string | number)[][]): Sprint[] {
  const sprintMap = new Map<string, Sprint>();

  // Row 0 = header, data starts at index 1
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];

    const milestoneOrder = Number(row[0] ?? "");
    const milestone = String(row[2] ?? "").trim();
    const task = String(row[3] ?? "").trim();

    if (!milestone || !task || !Number.isFinite(milestoneOrder) || milestoneOrder <= 0) continue;

    const description = String(row[4] ?? "").trim();
    const status = normalizeStatus(row[5]);
    const feedback = String(row[6] ?? "").trim();
    const retryRequired = ["true", "yes", "1"].includes(String(row[7] ?? "").trim().toLowerCase());
    const weeklyProgress = toDisplayPercent(row[8]);
    const overallProgress = toDisplayPercent(row[9]);

    const key = `${milestoneOrder}__${milestone}`;

    if (!sprintMap.has(key)) {
      sprintMap.set(key, {
        id: sprintMap.size + 1,
        week: milestoneOrder,
        title: milestone,
        tasks: [],
      });
    }

    const sprint = sprintMap.get(key)!;
    sprint.tasks.push({
      id: `${sprint.id}-${sprint.tasks.length + 1}`,
      name: task,
      description,
      status,
      feedback: feedback || undefined,
      retryRequired,
      weeklyProgress,
      overallProgress,
    });
  }

  return [...sprintMap.values()].sort((a, b) => a.week - b.week);
}

function toBool(value: unknown): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

// ─── Project mock data ────────────────────────────────────────────────────────

type ProjectCondition = "active" | "paused" | "cancelled" | "completed";

interface Project {
  id: string;
  name: string;
  client: string;
  color: string;
  initials: string;
  condition: ProjectCondition;
  week: number;
  totalWeeks: number;
}

const PROJECT_COLORS = [
  "#111111",
  "#6366f1",
  "#0891b2",
  "#16a34a",
  "#d97706",
];

function getClientInitials(ClientName: string): string {
  const words = ClientName.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0][0].toUpperCase();

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function normalizeProjectCondition(value: unknown): ProjectCondition {
  const condition = String(value ?? "").trim().toLowerCase();

  if (condition === "active") return "active";
  if (condition === "paused") return "paused";
  if (condition === "cancelled" || condition === "canceled") return "cancelled";
  if (condition === "completed") return "completed";

  console.warn(
    `Unknown project condition "${String(value)}". Using "active" as fallback.`
  );

  return "active";
}

function rowsToImportedProjects(rows: (string | number)[][]): Project[] {
  const headerRowIndex = rows.findIndex((row) => {
    const headers = row.map((cell) => String(cell ?? "").trim().toLowerCase());

    return (
      headers.includes("project name") &&
      headers.includes("client") &&
      headers.includes("condition") &&
      headers.includes("week") &&
      headers.includes("totalweeks")
    );
  });

  if (headerRowIndex === -1) {
    console.warn(
      'Project metadata headers not found. Expected: "Project Name", "Client", "Condition", "Week", "TotalWeeks".'
    );
    return [];
  }

  const headers = rows[headerRowIndex].map((cell) =>
    String(cell ?? "").trim().toLowerCase()
  );

  const projectNameIndex = headers.indexOf("project name");
  const clientIndex = headers.indexOf("client");
  const conditionIndex = headers.indexOf("condition");
  const weekIndex = headers.indexOf("week");
  const totalWeeksIndex = headers.indexOf("totalweeks");

  const metadataRow = rows
    .slice(headerRowIndex + 1)
    .find((row) => String(row?.[projectNameIndex] ?? "").trim() !== "");

  if (!metadataRow) {
    console.warn('No project metadata row found below the "Project Name" header.');
    return [];
  }

  const name =
    String(metadataRow[projectNameIndex] ?? "").trim() || "Unnamed Project";

  const client =
    String(metadataRow[clientIndex] ?? "").trim() || "Unknown Client";

  const parsedWeek = Number(metadataRow[weekIndex]);
  const parsedTotalWeeks = Number(metadataRow[totalWeeksIndex]);

  const totalWeeks =
    Number.isFinite(parsedTotalWeeks) && parsedTotalWeeks > 0
      ? parsedTotalWeeks
      : 1;

  const week =
    Number.isFinite(parsedWeek) && parsedWeek > 0
      ? Math.min(parsedWeek, totalWeeks)
      : 1;

  return [
    {
      id: "p1",
      name,
      client,
      condition: normalizeProjectCondition(metadataRow[conditionIndex]),
      week,
      totalWeeks,
      initials: getClientInitials(client),
      color: PROJECT_COLORS[0],
    },
  ];
}

const PROJECT_CONDITION_STYLES: Record<
  ProjectCondition,
  { label: string; color: string; bg: string; border: string }
> = {
  active: {
    label: "Active",
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
  },
  paused: {
    label: "Paused",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
  },
  cancelled: {
    label: "Cancelled",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  completed: {
    label: "Completed",
    color: "#6366f1",
    bg: "#f5f3ff",
    border: "#ddd6fe",
  },
};

// ─── UserMenu ────────────────────────────────────────────────────────────────

function UserMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isAdmin = user.role === "admin";
  const roleStyle = isAdmin
    ? { color: "#6366f1", bg: "#f5f3ff", border: "#ddd6fe" }
    : { color: "#0891b2", bg: "#f0f9ff", border: "#bae6fd" };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-border bg-white hover:border-foreground/25 transition-all"
      >
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold font-mono flex-shrink-0"
          style={{ backgroundColor: user.color }}
        >
          {user.initials}
        </div>
        <span className="text-xs font-medium text-foreground hidden sm:inline max-w-[100px] truncate">{user.name.split(" ")[0]}</span>
        <ChevronDown size={11} className="text-muted-foreground flex-shrink-0" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl border border-border shadow-xl z-50 overflow-hidden">
          {/* User info */}
          <div className="px-4 py-4 border-b border-border" style={{ backgroundColor: "#fafafa" }}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold font-mono flex-shrink-0"
                style={{ backgroundColor: user.color }}
              >
                {user.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
                <p className="text-[10px] font-mono text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            {/* Role badge */}
            <div className="mt-3 flex items-center gap-1.5">
              {isAdmin
                ? <ShieldCheck size={11} style={{ color: roleStyle.color }} />
                : <UserCircle size={11} style={{ color: roleStyle.color }} />
              }
              <span
                className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
                style={{ color: roleStyle.color, backgroundColor: roleStyle.bg, border: `1px solid ${roleStyle.border}` }}
              >
                {isAdmin ? "Administrator" : "Client"}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                {isAdmin ? "Full access" : "Read-only"}
              </span>
            </div>
          </div>

          {/* Access summary */}
          <div className="px-4 py-3 border-b border-border space-y-1.5">
            {[
              { label: "View project dashboard",       granted: true },
              { label: "Submit client feedback",        granted: true },
              { label: "Manage milestones & tasks",     granted: isAdmin },
              { label: "Access all projects",           granted: isAdmin },
              { label: "Send email updates",            granted: isAdmin },
              { label: "Import / export data",          granted: isAdmin },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: item.granted ? "#f0fdf4" : "#f9fafb", border: `1px solid ${item.granted ? "#bbf7d0" : "#e5e7eb"}` }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.granted ? "#16a34a" : "#d1d5db" }} />
                </div>
                <p className="text-[10px] font-mono" style={{ color: item.granted ? "#111" : "#aaa" }}>{item.label}</p>
              </div>
            ))}
          </div>

          {/* Sign out */}
          <div className="p-2">
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Unauthorized panel ───────────────────────────────────────────────────────

function UnauthorizedPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
        style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}
      >
        <Lock size={22} style={{ color: "#dc2626" }} strokeWidth={1.8} />
      </div>
      <p className="text-sm font-semibold text-foreground">Access Restricted</p>
      <p className="text-xs text-muted-foreground mt-2 max-w-xs leading-relaxed">
        This section is only available to administrators. Contact your project manager if you need access.
      </p>
    </div>
  );
}


// ─── ProjectSelector ──────────────────────────────────────────────────────────

function ProjectSelector({
  selected,
  projects,
  onChange,
}: {
  selected: Project | null;
  projects: Project[];
  onChange: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedStyle = selected
    ? PROJECT_CONDITION_STYLES[selected.condition]
    : PROJECT_CONDITION_STYLES.active;

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-border bg-white hover:border-foreground/25 transition-all"
      >
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold font-mono"
          style={{ backgroundColor: selected?.color ?? "#111111" }}
        >
          {selected?.initials ?? "?"}
        </div>

        <div className="text-left hidden sm:block">
          <p className="text-xs font-semibold text-foreground leading-none truncate max-w-[140px]">
            {selected?.name ?? "Select Project"}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground leading-none mt-0.5 truncate max-w-[140px]">
            {selected?.client ?? "Import Excel data"}
          </p>
        </div>

        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: selected ? selectedStyle.color : "#9ca3af" }}
        />

        <ChevronDown
          size={12}
          className="text-muted-foreground flex-shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl border border-border shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-[#fafafa]">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              Projects
            </p>
          </div>

          <div className="py-1.5 max-h-72 overflow-y-auto">
            {projects.length === 0 ? (
              <p className="px-4 py-3 text-xs font-mono text-muted-foreground">
                Import Excel data to load a project
              </p>
            ) : (
              projects.map((project) => {
                const conditionStyle =
                  PROJECT_CONDITION_STYLES[project.condition];

                const isSelected = project.id === selected?.id;

                const progressPct =
                  project.totalWeeks === 0
                    ? 0
                    : Math.round((project.week / project.totalWeeks) * 100);

                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      onChange(project);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/60"
                    style={{
                      backgroundColor: isSelected ? "#f5f5f5" : undefined,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-bold font-mono"
                      style={{ backgroundColor: project.color }}
                    >
                      {project.initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {project.name}
                        </p>

                        <span
                          className="flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                          style={{
                            color: conditionStyle.color,
                            backgroundColor: conditionStyle.bg,
                            border: `1px solid ${conditionStyle.border}`,
                          }}
                        >
                          {conditionStyle.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <Building2
                          size={9}
                          className="text-muted-foreground flex-shrink-0"
                        />

                        <p className="text-[10px] font-mono text-muted-foreground truncate">
                          {project.client}
                        </p>

                        <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0 ml-auto">
                          Wk {project.week}/{project.totalWeeks}
                        </span>
                      </div>

                      <div className="mt-1.5 h-0.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${progressPct}%`,
                            backgroundColor: project.color,
                          }}
                        />
                      </div>
                    </div>

                    {isSelected && (
                      <Check
                        size={12}
                        className="flex-shrink-0"
                        style={{ color: "#16a34a" }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-border bg-[#fafafa]">
            <p className="text-[10px] font-mono text-muted-foreground">
              <FolderKanban size={9} className="inline mr-1" />
              {projects.length} {projects.length === 1 ? "project" : "projects"} ·
              Supabase-ready
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Achieved: {
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    label: "Achieved",
    icon: CheckCircle2,
  },
  "Working on": {
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    label: "In Progress",
    icon: Clock,
  },
  Delayed: {
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    label: "Delayed",
    icon: AlertCircle,
  },
  Upcoming: {
    color: "#9ca3af",
    bg: "#f9fafb",
    border: "#e5e7eb",
    label: "Upcoming",
    icon: Circle,
  },
};

// ─── Shared utilities ─────────────────────────────────────────────────────────

function getSprintProgress(sprint: Sprint) {
  const tasks = sprint.tasks;
  const achieved = tasks.filter((t) => t.status === "Achieved").length;
  const inProgress = tasks.filter((t) => t.status === "Working on").length;
  const delayed = tasks.filter((t) => t.status === "Delayed").length;
  const total = tasks.length;
  const pct = total === 0 ? 0 : Math.round((achieved / total) * 100);
  return { achieved, inProgress, total, pct };
}

function getSprintColor(sprint: Sprint) {
  const { achieved, inProgress, total } = getSprintProgress(sprint);
  if (achieved === total) return "#16a34a";
  if (inProgress > 0 || achieved > 0) return "#d97706";
  return "#9ca3af";
}

// ─── Shared components ────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 56, stroke = 5, color }: { pct: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f0f0" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

function TrafficLight({ status }: { status: TaskStatus }) {
  const colors: Record<string, string> = { "Achieved": "#16a34a", "Working on": "#d97706", "Delayed": "#dc2626", "Upcoming": "#9ca3af" };
  return (
    <div className="flex gap-[5px] items-center">
      {(["Achieved", "Working on", "Delayed", "Upcoming"] as const).map((s) => (
        <div key={s} className="w-3 h-3 rounded-full transition-all" style={{
          backgroundColor: status === "Upcoming" ? "#e5e7eb" : status === s ? colors[s] : "#e5e7eb",
          boxShadow: status === s ? `0 0 0 2px white, 0 0 0 3px ${STATUS_CONFIG[status].color}` : "none",
        }} />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium font-mono" style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <Icon size={11} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-border rounded-xl px-4 py-3 shadow-lg text-xs font-mono">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p: any) => <p key={p.name} style={{ color: p.fill }}>{p.name}: {p.value}</p>)}
      </div>
    );
  }
  return null;
};

// ─── Dashboard components ─────────────────────────────────────────────────────

function renderMessage(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all">{part}</a>
      : <span key={i}>{part}</span>
  );
}

function FeedbackModal({ taskName, project, client, currentUser, messages, onClose, onSent }: {
  taskName: string; project: string; client: string;
  currentUser: { email: string; role: string; name: string };
  messages: { message: string; sender_role: string; created_at: string }[];
  onClose: () => void;
  onSent: (msg: { message: string; sender_role: string; created_at: string }) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "feedback",
          message: trimmed,
          email: currentUser.email,
          client,
          project,
          task: taskName,
          sender_role: currentUser.role,
        }),
      });
      onSent({ message: trimmed, sender_role: currentUser.role, created_at: new Date().toISOString() });
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Feedback</p>
            <h3 className="text-sm font-semibold text-foreground">{taskName}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No messages yet.</p>
          )}
          {messages.map((m, i) => {
            const isMe = m.sender_role === currentUser.role;
            return (
              <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[75%] px-3 py-2 rounded-2xl text-xs leading-relaxed"
                  style={isMe
                    ? { backgroundColor: "#111111", color: "#fff" }
                    : { backgroundColor: "#f1f5f9", color: "#111111" }}>
                  {m.message}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0">
          <input
            className="flex-1 rounded-xl border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            autoFocus
          />
          <button onClick={send} disabled={!text.trim() || sending}
            className="p-2 rounded-xl bg-foreground text-white disabled:opacity-40 transition-opacity hover:opacity-80">
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SprintCard({ sprint, onFeedback, isAdmin, communications }: {
  sprint: Sprint;
  onFeedback: (taskName: string) => void;
  isAdmin: boolean;
  communications: Record<string, { sender_role: string }[]>;
}) {
  const [expanded, setExpanded] = useState(sprint.currentWeek ?? sprint.week === 1);
  const { achieved, inProgress, total, pct } = getSprintProgress(sprint);
  const color = getSprintColor(sprint);
  return (
    <div className="rounded-2xl border overflow-hidden transition-shadow hover:shadow-md" style={{ borderColor: sprint.currentWeek ? color : "rgba(0,0,0,0.08)" }}>
      <div className="px-6 py-4 flex items-center justify-between cursor-pointer select-none" style={{ backgroundColor: sprint.currentWeek ? `${color}08` : "#fafafa" }} onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <ProgressRing pct={pct} color={color} />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-mono font-medium" style={{ color }}>{pct}%</div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Week {sprint.week}</span>
              {sprint.currentWeek && <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Current</span>}
            </div>
            <h2 className="text-base font-semibold text-foreground mt-0.5">{sprint.title}</h2>
            <span className="text-xs text-muted-foreground font-mono">
              <span style={{ color: "#16a34a" }}>{achieved}</span> done · <span style={{ color: "#d97706" }}>{inProgress}</span> active · <span className="text-muted-foreground">{total - achieved - inProgress}</span> remaining
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {(["Achieved", "Working on", "Delayed"] as const).map((s, i) => {
              const sc = ["#16a34a", "#d97706", "#dc2626"][i];
              const has = s === "Achieved" ? achieved > 0 : s === "Working on" ? inProgress > 0 : total - achieved - inProgress > 0 && sprint.currentWeek;
              return <div key={s} className="w-4 h-4 rounded-full" style={{ backgroundColor: has ? sc : "#e5e7eb" }} />;
            })}
          </div>
          {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </div>
      </div>
      <div className="h-1 w-full bg-muted"><div className="h-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
      {expanded && (
        <div className="divide-y divide-border">
          {sprint.tasks.map((task) => (
            <div key={task.id} className="px-6 py-4 hover:bg-secondary/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 pt-0.5"><TrafficLight status={task.status} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{task.name}</span>
                        <StatusBadge status={task.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{task.description}</p>
                      {task.feedback && (
                        <div className="mt-2 flex items-start gap-2">
                          <MessageSquare size={12} className="flex-shrink-0 mt-0.5 text-blue-500" />
                          <p className="text-xs italic rounded-lg px-2.5 py-1.5" style={{ backgroundColor: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>{task.feedback}</p>
                        </div>
                      )}
                    </div>
                    {(() => {
                      const msgs = communications[task.name] ?? [];
                      const hasClientMsg = msgs.some(m => m.sender_role === "client");
                      const lastSender = msgs.length > 0 ? msgs[msgs.length - 1].sender_role : null;
                      const hasUnread = lastSender !== null && lastSender !== (isAdmin ? "admin" : "client");
                      const showButton = !isAdmin || hasClientMsg;
                      if (!showButton) return null;
                      return (
                        <button onClick={() => onFeedback(task.name)} className="relative flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all">
                          {hasUnread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500" />}
                          <MessageSquare size={12} />Feedback
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Email Template components ────────────────────────────────────────────────

interface EmailConfig {
  clientName: string;
  projectLink: string;
  completedMilestoneIdx: number;
  nextMilestoneIdx: number;
  senderName: string;
  senderRole: string;
  senderContact: string;
}

function EmailPreview({ config, sprints, chartData, overallPct }: {
  config: EmailConfig;
  sprints: Sprint[];
  chartData: any[];
  overallPct: number;
}) {
  const completedSprint = sprints[config.completedMilestoneIdx];
  const nextSprint = sprints[config.nextMilestoneIdx];
  const completedColor = getSprintColor(completedSprint);
  const { pct: completedPct } = getSprintProgress(completedSprint);

  const nextTasks = nextSprint.tasks.slice(0, 3);

  return (
    <div className="email-print-target bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
      {/* Email meta bar */}
      <div className="email-meta-bar px-6 py-3 border-b border-border bg-secondary/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs font-mono text-muted-foreground ml-2">New Message — Milestone Update</span>
        </div>
        <span className="text-xs font-mono text-muted-foreground">To: {config.clientName || "Client"}</span>
      </div>

      {/* Email body */}
      <div className="p-8 max-w-2xl mx-auto space-y-6">

        {/* Email header — project name + milestone badge */}
        <div className="flex items-start justify-between pb-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-mono font-bold">AI</span>
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Conversational AI Platform</p>
              <h1 className="text-base font-semibold text-foreground mt-0.5">Project Update</h1>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-medium"
            style={{ color: completedColor, backgroundColor: `${completedColor}12`, border: `1px solid ${completedColor}30` }}
          >
            <CheckCircle2 size={11} strokeWidth={2.5} />
            Week {completedSprint.week} Complete
          </span>
        </div>

        {/* Greeting */}
        <div>
          <p className="text-sm text-foreground leading-relaxed">
            Hi <span className="font-semibold">{config.clientName || "[Client Name]"}</span>,
          </p>
        </div>

        {/* Success notification block */}
        <div className="rounded-2xl p-5 border" style={{ backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#16a34a" }}>
              <CheckCircle2 size={16} color="white" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Another milestone completed on schedule. ✅</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-mono font-medium" style={{ color: "#16a34a" }}>Week {completedSprint.week} — {completedSprint.title}</span> has been delivered successfully with {getSprintProgress(completedSprint).achieved} of {getSprintProgress(completedSprint).total} tasks completed.
              </p>
              {/* Mini traffic lights row */}
              <div className="flex items-center gap-2 mt-3">
                {completedSprint.tasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="flex items-center gap-1 text-xs font-mono" style={{ color: "#16a34a" }}>
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                ))}
                <span className="text-xs font-mono text-muted-foreground ml-1">All tasks achieved</span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div>
          <p className="text-sm text-muted-foreground mb-3">You can review the completed work here:</p>
          <a
            href={config.projectLink || "#"}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: "#111111" }}
          >
            <ExternalLink size={14} />
            View Completed Work
            <ArrowRight size={13} />
          </a>
          {config.projectLink && (
            <p className="text-xs font-mono text-muted-foreground mt-2 truncate">{config.projectLink}</p>
          )}
        </div>

        {/* Feedback request */}
        <div className="rounded-2xl p-5 border border-border" style={{ backgroundColor: "#eff6ff" }}>
          <div className="flex items-start gap-3">
            <MessageSquare size={16} className="flex-shrink-0 mt-0.5 text-blue-500" />
            <div>
              <p className="text-sm font-semibold text-foreground">Your feedback matters</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Please take a moment to review the completed work and share any feedback or questions. Your input directly shapes the next iteration.
              </p>
            </div>
          </div>
        </div>

        {/* Next milestone card */}
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">Next Milestone</p>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <div className="px-5 py-4 flex items-center gap-4" style={{ backgroundColor: "#fafafa" }}>
              <div className="relative flex-shrink-0">
                <ProgressRing pct={0} size={44} stroke={4} color="#9ca3af" />
                <div className="absolute inset-0 flex items-center justify-center text-xs font-mono font-medium text-muted-foreground">0%</div>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Week {nextSprint.week}</p>
                <p className="text-sm font-semibold text-foreground">{nextSprint.title}</p>
              </div>
              <div className="ml-auto flex gap-1.5">
                <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />
                <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />
                <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />
              </div>
            </div>
            <div className="h-0.5 w-full bg-muted" />
            <div className="divide-y divide-border">
              {nextTasks.map((task, i) => (
                <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}.</span>
                  <TrafficLight status="Upcoming" />
                  <span className="text-sm text-foreground">{task.name}</span>
                  <StatusBadge status="Upcoming" />
                </div>
              ))}
              {nextSprint.tasks.length > 3 && (
                <div className="px-5 py-3 flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">+{nextSprint.tasks.length - 3} more tasks in this sprint</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress section */}
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">Project Progress</p>
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <ProgressRing pct={overallPct} size={52} stroke={5} color="#16a34a" />
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold" style={{ color: "#16a34a" }}>{overallPct}%</div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Overall completion</p>
                  <p className="text-xs font-mono text-muted-foreground">across all 5 sprints</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                {[{ label: "Done", color: "#16a34a" }, { label: "Active", color: "#d97706" }, { label: "Upcoming", color: "#e5e7eb" }].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} barSize={22} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f5f5f5", radius: 4 }} />
                <Bar dataKey="Achieved" stackId="a" fill="#16a34a" />
                <Bar dataKey="In Progress" stackId="a" fill="#d97706" />
                <Bar dataKey="Delayed" stackId="a" fill="#dc2626" />
                <Bar dataKey="Upcoming" stackId="a" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Closing */}
        <div className="pt-2 pb-2">
          <p className="text-sm text-foreground leading-relaxed">
            Thank you for your continued collaboration.{" "}
            <strong className="font-semibold text-foreground">Every milestone brings us one step closer to delivering a solution aligned with your goals.</strong>
          </p>
          <p className="text-sm text-foreground leading-relaxed mt-3">
            Looking forward to your feedback and to the next stage of the project.
          </p>
        </div>

        {/* Signature */}
        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground mb-3">Best regards,</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-semibold">{(config.senderName || "A").charAt(0)}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{config.senderName || "Álvaro"}</p>
              <p className="text-xs font-mono text-muted-foreground">{config.senderRole || "AI Chatbot Developer"}</p>
              <p className="text-xs font-mono text-muted-foreground">{config.senderContact || ""}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailTemplateView({ sprints, chartData, overallPct }: { sprints: Sprint[]; chartData: any[]; overallPct: number }) {
  const [config, setConfig] = useState<EmailConfig>({
    clientName: "Luke",
    projectLink: "https://your-project-link.com",
    completedMilestoneIdx: 0,
    nextMilestoneIdx: 1,
    senderName: "Álvaro",
    senderRole: "AI Chatbot Developer",
    senderContact: "",
  });
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 900);
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const completedOptions = sprints.map((s, i) => ({ value: i, label: `Week ${s.week} — ${s.title}` }));
  const nextOptions = sprints.map((s, i) => ({ value: i, label: `Week ${s.week} — ${s.title}` }));
  
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">

        {/* ── Config panel ── */}
        <div className="space-y-4 lg:sticky lg:top-24">

          {/* Panel header */}
          <div className="rounded-2xl border border-border bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-border" style={{ backgroundColor: "#fafafa" }}>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Email Configuration</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">Compose Update</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Client name */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1.5">
                  <User size={11} /> Client Name
                </label>
                <input
                  type="text"
                  value={config.clientName}
                  onChange={(e) => setConfig((c) => ({ ...c, clientName: e.target.value }))}
                  placeholder="Luke"
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15"
                />
              </div>

              {/* Project link */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1.5">
                  <Link2 size={11} /> Project Link
                </label>
                <input
                  type="url"
                  value={config.projectLink}
                  onChange={(e) => setConfig((c) => ({ ...c, projectLink: e.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15 font-mono"
                />
              </div>

              {/* Completed milestone */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1.5">
                  <CheckCircle2 size={11} /> Completed Milestone
                </label>
                <select
                  value={config.completedMilestoneIdx}
                  onChange={(e) => setConfig((c) => ({ ...c, completedMilestoneIdx: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15 font-mono"
                >
                  {completedOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Next milestone */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1.5">
                  <ChevronRight size={11} /> Next Milestone
                </label>
                <select
                  value={config.nextMilestoneIdx}
                  onChange={(e) => setConfig((c) => ({ ...c, nextMilestoneIdx: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15 font-mono"
                >
                  {nextOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Sender info */}
          <div className="rounded-2xl border border-border bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-border" style={{ backgroundColor: "#fafafa" }}>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Sender</p>
            </div>
            <div className="p-5 space-y-3">
              <input type="text" value={config.senderName} onChange={(e) => setConfig((c) => ({ ...c, senderName: e.target.value }))} placeholder="Your name" className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15" />
              <input type="text" value={config.senderRole} onChange={(e) => setConfig((c) => ({ ...c, senderRole: e.target.value }))} placeholder="Role / Title" className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15 font-mono" />
              <input type="text" value={config.senderContact} onChange={(e) => setConfig((c) => ({ ...c, senderContact: e.target.value }))} placeholder="Contact info (optional)" className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15 font-mono" />
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ backgroundColor: generating ? "#555" : "#111111" }}
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Generate Email Update
              </>
            )}
          </button>

          {generated && (
            <p className="text-xs font-mono text-center" style={{ color: "#16a34a" }}>
              <CheckCircle2 size={11} className="inline mr-1" />
              Email preview ready
            </p>
          )}
        </div>

        {/* ── Preview panel ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Preview</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {generated ? "Email ready to send" : "Configure and generate to preview"}
              </p>
            </div>
            {generated && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all"
                >
                  {copied ? <><Check size={12} style={{ color: "#16a34a" }} />Copied</> : <><Copy size={12} />Copy</>}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "#111111" }}
                >
                  <Download size={12} />
                  Export PDF
                </button>
              </div>
            )}
          </div>

          {!generated ? (
            <div className="rounded-2xl border border-dashed border-border bg-secondary/30 flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Mail size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">No preview yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-48">Configure the fields on the left, then click "Generate Email Update"</p>
            </div>
          ) : (
            <EmailPreview config={config} sprints={sprints} chartData={chartData} overallPct={overallPct} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [selectedFile, setSelectedFile] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{ taskId: string; taskName: string } | null>(null);
  const [communications, setCommunications] = useState<Record<string, { message: string; sender_role: string; created_at: string }[]>>({});
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      const email = session.user.email ?? "";
      const user = MOCK_USERS[email] ?? {
        email,
        name: email.split("@")[0],
        role: "admin" as const,
        initials: email.slice(0, 2).toUpperCase(),
        color: "#111111",
      };
      setCurrentUser(user);
    }
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      const email = session.user.email ?? "";
      const user = MOCK_USERS[email] ?? {
        email,
        name: email.split("@")[0],
        role: "admin" as const,
        initials: email.slice(0, 2).toUpperCase(),
        color: "#111111",
      };
      setCurrentUser(user);
    } else {
      setCurrentUser(null);
    }
  });

  return () => subscription.unsubscribe();
}, []);

  const loadSavedProjects = async () => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/projects`);

    if (!response.ok) {
      throw new Error(`Failed to load projects: ${response.status}`);
    }

    const data = await response.json();

const mappedProjects: Project[] = (data.projects ?? []).map((p: any, index: number) => ({
  id: p.id,
  name: p.project,
  client: p.client,
  condition: p.condition,
  week: p.week,
  totalWeeks: p.total_weeks,
  initials: getClientInitials(p.client),
  color: PROJECT_COLORS[index % PROJECT_COLORS.length],
}));

console.log("Loaded projects:", mappedProjects);
    
setProjects(mappedProjects);
setSelectedProject(mappedProjects[0] ?? null);
    
  } catch (error) {
     console.error("Could not load saved projects:", error);
  }
};

  useEffect(() => {
    loadSavedProjects();
  }, []);

  useEffect(() => {
  if (!selectedProject) return;

  const loadProjectStatus = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/project-status/${encodeURIComponent(selectedProject.name)}`
      );
      const data = await response.json();
      
const milestoneMap = new Map();

for (const row of data.records ?? []) {
  if (!milestoneMap.has(row.milestone)) {
    milestoneMap.set(row.milestone, {
      id: milestoneMap.size + 1,
      week: row.milestone_order ?? milestoneMap.size + 1,
      title: row.milestone,
      tasks: [],
    });
  }

  milestoneMap.get(row.milestone).tasks.push({
    id: row.id,
    name: row.task,
    description: "",
    status: row.status,
    feedback: row.feedback ?? undefined,
    retryRequired: row.retry_required ?? false,
    weeklyProgress: row.status === "Achieved" ? 100 : 0,
    overallProgress: row.status === "Achieved" ? 100 : 0,
  });
}

const reconstructedSprints = Array.from(milestoneMap.values()).sort((a, b) => a.week - b.week);

console.log("[DEBUG] Records count:", data.records?.length);
console.log("[DEBUG] Reconstructed sprints:", reconstructedSprints);
console.log("[DEBUG] Reached setSprints");
      
setSprints(reconstructedSprints);
    
    } catch (error) {
      console.error("Could not load project status:", error);
    }
  };

    loadProjectStatus();

  const loadCommunications = async () => {
    if (!selectedProject) return;
    console.log("[DEBUG] loadCommunications called for", selectedProject?.name);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/communications/${encodeURIComponent(selectedProject.name)}`);
      const data = await res.json();
      const grouped: Record<string, { message: string; sender_role: string; created_at: string }[]> = {};
      for (const msg of data.messages ?? []) {
        const key = msg.task;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(msg);
      }
      setCommunications(grouped);
    } catch {}
  };

  loadCommunications();
}, [selectedProject]);
  
  const handleSaveFeedback = (taskId: string, feedback: string) => {
    setSprints((prev) =>
      prev.map((sprint) => ({
        ...sprint,
        tasks: sprint.tasks.map((task) => task.id === taskId ? { ...task, feedback: feedback || undefined } : task),
      }))
    );
  };

  const handleFileUpload = async (file: File) => {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const jsonRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    defval: "",
  });

  const parsed = rowsToSprintsFromSheetRows(jsonRows);
  console.log(JSON.stringify(parsed[0], null, 2));
  setSprints(parsed);

  const importedProjects = rowsToImportedProjects(jsonRows);

  console.log("[DEBUG] Imported projects:", importedProjects);

  setProjects(importedProjects);
  setSelectedProject(importedProjects[0] ?? null);

  const firstProject = importedProjects[0];

  console.log("[DEBUG] First project:", firstProject);

  if (!firstProject) {
    return;
  }

  try {
    const response = await fetch(
  `${import.meta.env.VITE_API_URL}/projects`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project: firstProject.name,
          client: firstProject.client,
          condition: firstProject.condition,
          week: firstProject.week,
          total_weeks: firstProject.totalWeeks,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Backend request failed with status ${response.status}`
      );
    }

    const result = await response.json();
    console.log("[DEBUG] Project saved to backend:", result);

    console.log("[DEBUG] Entering Project_status loop");
    
    for (const sprint of parsed) {
   for (const task of sprint.tasks) {
     
  console.log("[DEBUG]", task.name, task.status);
     
   const response = await fetch(
  `${import.meta.env.VITE_API_URL}/project-status`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      milestone: sprint.title,
      task: task.name,
      status: task.status,
      feedback: task.feedback ?? null,
      retry_required: task.retryRequired ?? false,
      client: firstProject.client,
      project: firstProject.name,
      milestone_order: sprint.week,
      task_order: sprint.tasks.indexOf(task) + 1,
    }),
  }
);

const result = await response.json();

console.log("[DEBUG] Project status response:", result);
  }
}
console.log("[DEBUG] Finished Project_status loop");
console.log("[DEBUG] Project status records saved");
    
  } catch (error) {
    console.error("Project could not be saved to backend:", error);
  }
};
  
  const allTasks = sprints.flatMap((s) => s.tasks);
  const totalTasks = allTasks.length;
  const achievedCount = allTasks.filter((t) => t.status === "Achieved").length;
  const inProgressCount = allTasks.filter((t) => t.status === "Working on").length;
  const delayedCount = allTasks.filter((t) => t.status === "Delayed").length;
  const upcomingCount = allTasks.filter((t) => t.status === "Upcoming").length;
  const overallPct =
  sprints.length === 0
    ? 0
    : Math.round(
        sprints.reduce((sum, sprint) => {
          const totalTasksInMilestone = sprint.tasks.length;

          if (totalTasksInMilestone === 0) return sum;

          const achievedTasksInMilestone = sprint.tasks.filter(
            (task) => task.status === "Achieved"
          ).length;

          return sum + achievedTasksInMilestone / totalTasksInMilestone;
        }, 0) /
          sprints.length *
          100
      );

  const chartData = sprints.map((sprint) => {
    const { achieved, inProgress, total } = getSprintProgress(sprint);
    const delayed = sprint.tasks.filter((t) => t.status === "Delayed").length;
    const upcoming = total - achieved - inProgress - delayed;
    return { name: `Wk ${sprint.week}`, fullName: sprint.title, Achieved: achieved, "In Progress": inProgress, "Delayed": delayed, "Upcoming": upcoming };
  });

  if (!currentUser) {
    return <AuthPage onAuth={(user) => setCurrentUser(user)} />;
  }
  
  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Header ── */}
      <header className="border-b border-border bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <span className="text-white text-xs font-mono font-bold">AI</span>
              </div>
              <div>
                <h1 className="text-base font-semibold text-foreground">Chatbot Project Cockpit</h1>
                <p className="text-xs text-muted-foreground font-mono">
                  {selectedProject?.name || "Select Project"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action bar ── */}
          <div className="border-t border-border py-2.5 flex items-center gap-2 flex-wrap">
            {/* ZONE B · Project selector */}
            
    {isAdmin && (
      <div className="flex-shrink-0">
        <ProjectSelector
          selected={selectedProject}
          projects={projects}
          onChange={setSelectedProject}
        />
      </div>
   )}
            
      <div className="flex-1" />

           {/* ZONE C · View toggle (admin) or Project title (client) */}
      {isAdmin ? (
        <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-secondary flex-shrink-0">
          <button
            onClick={() => setView("dashboard")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={view === "dashboard" ? { backgroundColor: "#111", color: "#fff" } : { color: "#888" }}
          >
            <LayoutDashboard size={11} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => setView("email")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={view === "email" ? { backgroundColor: "#111", color: "#fff" } : { color: "#888" }}
            >
              <Mail size={11} />
              <span className="hidden sm:inline">Email Update</span>
            </button>
          )}
        </div>
      ) : (
        <div className="absolute left-1/2 -translate-x-1/2">
          <p className="text-lg font-semibold text-foreground">
            Dashboard
          </p>
        </div>
      )}

      {/* Hidden import input */}
      <input
        id="project-import"
        type="file"
        accept=".xlsx"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setSelectedFile(file.name);
          await handleFileUpload(file);
        }}
      />

      {/* ZONE D · Secondary actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => {
            const link = document.createElement("a");
            link.href = `${import.meta.env.BASE_URL}templates/cockpit_template.xlsx`;
            link.download = "cockpit_template.xlsx";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground bg-white hover:border-foreground/25 hover:text-foreground transition-all"
          title="Download Template"
        >
          <Download size={11} />
          <span className="hidden lg:inline">Template</span>
        </button>

        <button
          onClick={() => {
            document.getElementById("project-import")?.click();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground bg-white hover:border-foreground/25 hover:text-foreground transition-all"
          title="Import Project Data"
        >
          <Upload size={11} />
          <span className="hidden lg:inline">Import</span>
        </button>
      </div>

      <div className="w-px self-stretch py-3 flex-shrink-0">
        <div className="w-full h-full bg-border" />
      </div>
            <div className="flex items-center gap-4">
              {/* Overall progress */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground font-mono">{overallPct}%</p>
                  <p className="text-xs text-muted-foreground">Overall</p>
                </div>
                <ProgressRing pct={overallPct} size={44} stroke={4} color="#16a34a" />
              </div>
            </div>
          </div>
      </header>
      {selectedFile && (
        <p className="text-xs text-green-600">
          ✓ {selectedFile} loaded successfully
        </p>
      )}

      {/* ── Dashboard view ── */}
      {view === "dashboard" && (
        <main className="max-w-6xl mx-auto px-6 py-8">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Completed", value: achievedCount, color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
              { label: "In Progress", value: inProgressCount, color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
              { label: "Blocked/Delayed", value: delayedCount, color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
              { label: "Upcoming", value: upcomingCount, color: "#9ca3af", bg: "#f9fafb", border: "#e5e7eb" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl p-5 border" style={{ backgroundColor: stat.bg, borderColor: stat.border }}>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest" style={{ color: stat.color }}>{stat.label}</p>
                    <p className="text-3xl font-bold mt-1" style={{ color: stat.color, fontFamily: "'DM Mono', monospace" }}>{stat.value}</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mb-1">/{totalTasks} tasks</p>
                </div>
                <div className="mt-3 h-1.5 rounded-full" style={{ backgroundColor: `${stat.color}20` }}>
                  <div className="h-full rounded-full" style={{ width: `${totalTasks === 0 ? 0 : (stat.value / totalTasks) * 100}%`, backgroundColor: stat.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-2xl border border-border bg-white p-6 mb-8">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Sprint Progress Overview</h2>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">Task distribution by week</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                {[{ label: "Achieved", color: "#16a34a" }, { label: "In Progress", color: "#d97706" }, { label: "Delayed", color: "#dc2626" }, { label: "Upcoming", color: "#e5e7eb" }].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={28} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "DM Mono, monospace", fill: "#888" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fontFamily: "DM Mono, monospace", fill: "#888" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f5f5f5", radius: 4 }} />
                <Bar dataKey="Achieved" stackId="a" fill="#16a34a" />
                <Bar dataKey="In Progress" stackId="a" fill="#d97706" />
                <Bar dataKey="Delayed" stackId="a" fill="#dc2626" />
                <Bar dataKey="Upcoming" stackId="a" fill="#e5e7eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sprint cards */}
          <div className="space-y-4">
            {sprints.map((sprint) => (
              <SprintCard key={sprint.id} sprint={sprint} isAdmin={isAdmin} communications={communications} onFeedback={(taskName) => setFeedbackModal({ taskId: "", taskName })} />
            ))}
          </div>

          {/* Legend */}
          <div className="mt-8 flex items-center justify-center gap-6 pb-8">
            <p className="text-xs text-muted-foreground font-mono">Status Legend:</p>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex items-center gap-1.5 text-xs font-mono" style={{ color: cfg.color }}>
                  <Icon size={12} strokeWidth={2.5} />{cfg.label}
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ── Email view ── */}
      {view === "email" && (
        <EmailTemplateView sprints={sprints} chartData={chartData} overallPct={overallPct} />
      )}
        {/* Feedback modal */}
        {feedbackModal && (
          <FeedbackModal
          taskName={feedbackModal.taskName}
          project={selectedProject?.name ?? ""}
          client={selectedProject?.client ?? ""}
          currentUser={{ email: currentUser.email, role: currentUser.role, name: currentUser.name }}
          messages={communications[feedbackModal.taskName] ?? []}
          onClose={() => setFeedbackModal(null)}
          onSent={(msg) => {
            setCommunications(prev => ({
              ...prev,
              [feedbackModal.taskName]: [...(prev[feedbackModal.taskName] ?? []), msg],
            }));
          }}
        />
      )}
    </div>
  );
}
