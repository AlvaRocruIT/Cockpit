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
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskStatus = "Achieved" | "Working on" | "Not yet" | "Pending";
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
  if (v === "not yet") return "Not yet";
  return "Pending";
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

function rowsToSprintsFromSheet(json: Record<string, unknown>[]): Sprint[] {
  const sprintMap = new Map<string, Sprint>();

  for (const row of json) {
    const weekRaw = pick(row, ["Week", "week"]);
    const milestoneRaw = pick(row, ["Milestone", "milestone"]);
    const taskRaw = pick(row, ["Task", "task"]);
    const descRaw = pick(row, ["Task description", "Task Description", "description"]);
    const statusRaw = pick(row, ["Status", "status"]);
    const feedbackRaw = pick(row, ["Client feedback", "Client Feedback", "feedback"]);
    const retryRaw = pick(row, ["Retry required", "Retry required?", "retryRequired"]);
    const weeklyRaw = pick(row, ["Weekly  progress", "Weekly progress", "Weekly Progress%", "Weekly Progress"]);
    const overallRaw = pick(row, ["Overall progress ", "Overall progress", "Overall progress %", "Overall Progress %"]);
    const week = Number(String(weekRaw).trim());
    const milestone = String(milestoneRaw).trim();
    const task = String(taskRaw).trim();

    // skip non-task rows (meta/header/milestone title-only rows)
    if (!Number.isFinite(week) || week <= 0 || !milestone || !task) continue;

    const key = `${week}__${milestone}`;
    if (!sprintMap.has(key)) {
      sprintMap.set(key, {
        id: sprintMap.size + 1,
        week,
        title: milestone,
        tasks: [],
      });
    }

    const sprint = sprintMap.get(key)!;
    sprint.tasks.push({
      id: `${sprint.id}-${sprint.tasks.length + 1}`,
      name: task,
      description: String(descRaw ?? "").trim(),
      status: normalizeStatus(statusRaw),
      feedback: String(feedbackRaw ?? "").trim() || undefined,
      retryRequired: ["true", "yes", "1"].includes(String(retryRaw).trim().toLowerCase()),
      weeklyProgress: toDisplayPercent(weeklyRaw),
      overallProgress: toDisplayPercent(overallRaw),
    });
  }

  return [...sprintMap.values()].sort((a, b) => a.week - b.week);
}

function rowsToSprintsFromSheetRows(rows: (string | number)[][]): Sprint[] {
  const sprintMap = new Map<string, Sprint>();

  // Header is expected at Excel row 6 => index 5
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const week = Number(String(r[0] ?? "").trim());
    const milestone = String(r[1] ?? "").trim();
    const task = String(r[2] ?? "").trim();
    const description = String(r[3] ?? "").trim();
    const status = normalizeStatus(r[4]);
    const feedback = String(r[5] ?? "").trim();
    const retry = ["true", "yes", "1"].includes(String(r[6] ?? "").trim().toLowerCase());
    const weeklyProgress = toDisplayPercent(r[7]);
    const overallProgress = toDisplayPercent(r[8]);

    if (!Number.isFinite(week) || week <= 0 || !milestone || !task) continue;

    const key = `${week}__${milestone}`;
    if (!sprintMap.has(key)) {
      sprintMap.set(key, { id: sprintMap.size + 1, week, title: milestone, tasks: [] });
    }

    const sprint = sprintMap.get(key)!;
    sprint.tasks.push({
      id: `${sprint.id}-${sprint.tasks.length + 1}`,
      name: task,
      description,
      status,
      feedback: feedback || undefined,
      retryRequired: retry,
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

function rowsToSprints(rows: RawTemplateRow[]): Sprint[] {
  const map = new Map<string, Sprint>();

  rows.forEach((row, idx) => {
    const week = Number(row.week);
    const milestoneTitle = String(row.milestone ?? "").trim();
    const taskName = String(row.task ?? "").trim();

    // skip non-task rows (meta/header/empty)
    if (!Number.isFinite(week) || week <= 0 || !milestoneTitle || !taskName) return;

    const sprintKey = `${week}__${milestoneTitle}`;
    if (!map.has(sprintKey)) {
      map.set(sprintKey, {
        id: map.size + 1,
        week,
        title: milestoneTitle,
        tasks: [],
      });
    }
  
    const sprint = map.get(sprintKey)!;
    sprint.tasks.push({
      id: `${sprint.id}-${sprint.tasks.length + 1}`,
      name: taskName,
      description: String(row.description ?? "").trim(),
      status: normalizeStatus(row.status),
      feedback: String(row.feedback ?? "").trim() || undefined,
      retryRequired: toBool(row.retryRequired),
      weeklyProgress: 0,   // automate later
      overallProgress: 0,  // automate later
    });
  });

  return Array.from(map.values()).sort((a, b) => a.week - b.week);
}

// ─── Project mock data ────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  client: string;
  color: string;
  initials: string;
  status: "active" | "paused" | "completed";
  week: number;
  totalWeeks: number;
}

const MOCK_PROJECTS: Project[] = [
  { id: "p1", name: "Conversational AI Platform", client: "Luke Hartmann", color: "#111111", initials: "LH", status: "active",    week: 3, totalWeeks: 5 },
  { id: "p2", name: "E-Commerce Chatbot",         client: "Sofía Martínez", color: "#6366f1", initials: "SM", status: "active",    week: 4, totalWeeks: 6 },
  { id: "p3", name: "Internal HR Assistant",      client: "Apex Corp",      color: "#0891b2", initials: "AC", status: "paused",    week: 1, totalWeeks: 4 },
  { id: "p4", name: "Knowledge Base Agent",       client: "DataSync GmbH",  color: "#16a34a", initials: "DG", status: "active",    week: 3, totalWeeks: 5 },
  { id: "p5", name: "Support Automation",         client: "NovaTech Inc.",   color: "#d97706", initials: "NT", status: "completed", week: 5, totalWeeks: 5 },
];

const PROJECT_STATUS_STYLES = {
  active:    { label: "Active",    color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  paused:    { label: "Paused",    color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  completed: { label: "Completed", color: "#6366f1", bg: "#f5f3ff", border: "#ddd6fe" },
};

// ─── ProjectSelector ──────────────────────────────────────────────────────────

function ProjectSelector({ selected, onChange }: { selected: Project; onChange: (p: Project) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const st = PROJECT_STATUS_STYLES[selected.status];

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-border bg-white hover:border-foreground/25 transition-all group"
        style={{ minWidth: 0 }}
      >
        {/* Avatar */}
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold font-mono"
          style={{ backgroundColor: selected.color }}
        >
          {selected.initials}
        </div>

        {/* Labels */}
        <div className="text-left hidden sm:block">
          <p className="text-xs font-semibold text-foreground leading-none truncate max-w-[140px]">{selected.name}</p>
          <p className="text-[10px] font-mono text-muted-foreground leading-none mt-0.5 truncate max-w-[140px]">{selected.client}</p>
        </div>

        {/* Status dot */}
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />

        <ChevronDown size={12} className="text-muted-foreground flex-shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-[#f3f3f3] rounded-2xl border border-[#e2e2e2] shadow-xl z-50 overflow-hidden">
          {/* Dropdown header */}
          <div className="px-4 py-3 border-b border-border" style={{ backgroundColor: "#fafafa" }}>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Projects</p>
          </div>

          {/* Project list */}
          <div className="py-1.5 max-h-72 overflow-y-auto">
            {MOCK_PROJECTS.map((project) => {
              const pst = PROJECT_STATUS_STYLES[project.status];
              const isSelected = project.id === selected.id;
              const progressPct = Math.round((project.week / project.totalWeeks) * 100);
              return (
                <button
                  key={project.id}
                  onClick={() => { onChange(project); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/60"
                  style={{ backgroundColor: isSelected ? "#f5f5f5" : undefined }}
                >
                  {/* Avatar */}
                  <div className="absolute top-full left-0 mt-2 w-72 bg-[#f3f3f3] rounded-2xl border border-[#e2e2e2] shadow-xl z-50 overflow-hidden">
                    {project.initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground truncate">{project.name}</p>
                      <span
                        className="flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                        style={{ color: pst.color, backgroundColor: pst.bg, border: `1px solid ${pst.border}` }}
                      >
                        {pst.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Building2 size={9} className="text-muted-foreground flex-shrink-0" />
                      <p className="text-[10px] font-mono text-muted-foreground truncate">{project.client}</p>
                      <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0 ml-auto">
                        Wk {project.week}/{project.totalWeeks}
                      </span>
                    </div>
                    {/* Mini progress bar */}
                    <div className="mt-1.5 h-0.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${progressPct}%`, backgroundColor: project.color }} />
                    </div>
                  </div>

                  {/* Selected check */}
                  {isSelected && (
                    <div className="flex-shrink-0 flex items-center gap-1">
                      <span className="w-8 h-[2px] rounded-full" style={{ backgroundColor: project.color }} />
                      <Check size={12} className="flex-shrink-0" style={{ color: "#16a34a" }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2.5 border-t border-border" style={{ backgroundColor: "#fafafa" }}>
            <p className="text-[10px] font-mono text-muted-foreground">
              <FolderKanban size={9} className="inline mr-1" />
              {MOCK_PROJECTS.length} projects · Supabase-ready
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Achieved:    { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", label: "Achieved",  icon: CheckCircle2 },
  "Working on":{ color: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "In Progress",icon: Clock },
  "Not yet":   { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "Not Yet",   icon: AlertCircle },
  Pending:     { color: "#9ca3af", bg: "#f9fafb", border: "#e5e7eb", label: "Upcoming",  icon: Circle },
};

// ─── Shared utilities ─────────────────────────────────────────────────────────

function getSprintProgress(sprint: Sprint) {
  const tasks = sprint.tasks;
  const achieved = tasks.filter((t) => t.status === "Achieved").length;
  const inProgress = tasks.filter((t) => t.status === "Working on").length;
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
  const colors: Record<string, string> = { Achieved: "#16a34a", "Working on": "#d97706", "Not yet": "#dc2626" };
  return (
    <div className="flex gap-[5px] items-center">
      {(["Achieved", "Working on", "Not yet"] as const).map((s) => (
        <div key={s} className="w-3 h-3 rounded-full transition-all" style={{
          backgroundColor: status === "Pending" ? "#e5e7eb" : status === s ? colors[s] : "#e5e7eb",
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

function FeedbackModal({ taskId, taskName, existingFeedback, onSave, onClose }: {
  taskId: string; taskName: string; existingFeedback?: string;
  onSave: (taskId: string, feedback: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(existingFeedback ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Client Feedback</p>
            <h3 className="text-sm font-semibold text-foreground">{taskName}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X size={16} /></button>
        </div>
        <div className="p-6">
          <textarea className="w-full rounded-xl border border-border bg-secondary p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-foreground/20 font-sans" rows={4} placeholder="Leave your feedback or comment here..." value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors">Cancel</button>
            <button onClick={() => { onSave(taskId, text); onClose(); }} className="px-4 py-2 text-sm rounded-lg bg-foreground text-white flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Send size={13} />Send Feedback
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SprintCard({ sprint, onFeedback }: { sprint: Sprint; onFeedback: (taskId: string, taskName: string, existing?: string) => void }) {
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
            {(["Achieved", "Working on", "Not yet"] as const).map((s, i) => {
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
                    <button onClick={() => onFeedback(task.id, task.name, task.feedback)} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all">
                      <MessageSquare size={12} />{task.feedback ? "Edit" : "Feedback"}
                    </button>
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
                  <TrafficLight status="Pending" />
                  <span className="text-sm text-foreground">{task.name}</span>
                  <StatusBadge status="Pending" />
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
                <Bar dataKey="Not Yet" stackId="a" fill="#dc2626" />
                <Bar dataKey="Pending" stackId="a" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
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
  const [selectedProject, setSelectedProject] = useState<Project>(MOCK_PROJECTS[0]);
  const [feedbackModal, setFeedbackModal] = useState<{ taskId: string; taskName: string; existing?: string } | null>(null);

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
  setSprints(parsed);
};
  
  const allTasks = sprints.flatMap((s) => s.tasks);
  const totalTasks = allTasks.length;
  const achievedCount = allTasks.filter((t) => t.status === "Achieved").length;
  const inProgressCount = allTasks.filter((t) => t.status === "Working on").length;
  const notYetCount = allTasks.filter((t) => t.status === "Not yet").length;
  const pendingCount = allTasks.filter((t) => t.status === "Pending").length;
  const overallPct = totalTasks === 0 ? 0 : Math.round((achievedCount / totalTasks) * 100);

  const chartData = sprints.map((sprint) => {
    const { achieved, inProgress, total } = getSprintProgress(sprint);
    const notYet = sprint.tasks.filter((t) => t.status === "Not yet").length;
    const pending = total - achieved - inProgress - notYet;
    return { name: `Wk ${sprint.week}`, fullName: sprint.title, Achieved: achieved, "In Progress": inProgress, "Not Yet": notYet, Pending: pending };
  });

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
                <h1 className="text-base font-semibold text-foreground">Conversational AI Platform</h1>
                <p className="text-xs text-muted-foreground font-mono">5-Week Development Roadmap</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Project selector */}
              <div>
                <div className="mt-2">
                  <ProjectSelector selected={selectedProject} onChange={setSelectedProject} />
                </div>
              </div>
              {/* Tab nav */}
              <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-secondary">
                <button
                  onClick={() => setView("dashboard")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={view === "dashboard" ? { backgroundColor: "#111", color: "#fff" } : { color: "#888" }}
                >
                  <LayoutDashboard size={12} />Dashboard
                </button>
                <button
                  onClick={() => setView("email")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={view === "email" ? { backgroundColor: "#111", color: "#fff" } : { color: "#888" }}
                >
                  <Mail size={12} />Email Update
                </button>
              </div>
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
        </div>

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

        {/* ── Action bar ── */}
          <div className="border-t border-border py-2.5 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
              const link = document.createElement("a");
              link.href = "/templates/cockpit_template.xlsx";
              link.download = "cockpit_template.xlsx";
              document.body.appendChild(link);
              link.click();
             document.body.removeChild(link);
        }}
              
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground bg-white hover:border-foreground/25 hover:text-foreground transition-all"
            >
              <Download size={12} />
              Download Template
            </button>

            <button
              onClick={() => {
                document.getElementById("project-import")?.click();
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground bg-white hover:border-foreground/25 hover:text-foreground transition-all"
            >
              <Upload size={12} />
              Import Project Data
            </button>
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
              { label: "Blocked / Behind", value: notYetCount, color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
              { label: "Upcoming", value: pendingCount, color: "#9ca3af", bg: "#f9fafb", border: "#e5e7eb" },
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
                {[{ label: "Achieved", color: "#16a34a" }, { label: "In Progress", color: "#d97706" }, { label: "Not Yet", color: "#dc2626" }, { label: "Upcoming", color: "#e5e7eb" }].map((l) => (
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
                <Bar dataKey="Not Yet" stackId="a" fill="#dc2626" />
                <Bar dataKey="Pending" stackId="a" fill="#e5e7eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sprint cards */}
          <div className="space-y-4">
            {sprints.map((sprint) => (
              <SprintCard key={sprint.id} sprint={sprint} onFeedback={(taskId, taskName, existing) => setFeedbackModal({ taskId, taskName, existing })} />
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
        <FeedbackModal taskId={feedbackModal.taskId} taskName={feedbackModal.taskName} existingFeedback={feedbackModal.existing} onSave={handleSaveFeedback} onClose={() => setFeedbackModal(null)} />
      )}
    </div>
  );
}
