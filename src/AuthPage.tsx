import { useState, useRef, useEffect } from "react";
import {
  Mail,
  ArrowRight,
  CheckCircle2,
  RefreshCcw,
  ShieldCheck,
  Lock,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  email: string;
  name: string;
  role: "admin" | "client";
  projectId?: string;
  initials: string;
  color: string;
}

// ─── Mock registry and Demo accounts list──────────────────────────────────────
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "";

const DEMO_ACCOUNTS = [
  { label: "Admin",               email: "alvaro@cockpit.app",   role: "admin"  as const, color: "#111111", name: "Álvaro",        initials: "AL" },
  { label: "Client — AI Project", email: "luke@hartmann.com",    role: "client" as const, color: "#111111", name: "Luke Hartmann",  initials: "LH" },
  { label: "Client — E-Commerce", email: "sofia@martinez.com",   role: "client" as const, color: "#6366f1", name: "Sofía Martínez", initials: "SM" },
  { label: "Client — HR Tool",    email: "contact@apexcorp.com", role: "client" as const, color: "#0891b2", name: "Apex Corp",      initials: "AC" },
];

async function fetchProfile(email: string): Promise<AuthUser | null> {
  const res = await fetch(`${BACKEND_URL}/profile/${encodeURIComponent(email)}`);
  if (!res.ok) return null;
  const { profile } = await res.json();
  if (!profile) return null;
  const name = profile.client_name ?? email.split("@")[0];
  const words = name.trim().split(" ");
  const initials = words.length >= 2
    ? words[0][0].toUpperCase() + words[1][0].toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return {
    email: profile.email,
    name,
    role: profile.role ?? "client",
    projectId: profile.project ?? undefined,
    initials,
    color: "#111111",
  };
}
// ─── AuthPage ─────────────────────────────────────────────────────────────────

type AuthStep = "idle" | "loading" | "sent";

interface Props {
  onAuth: (user: AuthUser) => void;
}

export default function AuthPage({ onAuth }: Props) {
  const [step, setStep] = useState<AuthStep>("idle");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (demoRef.current && !demoRef.current.contains(e.target as Node)) setDemoOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setStep("loading");
   const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: "https://alvarocruit.github.io/Cockpit/",
    },
  });
  if (error) {
    setError(error.message);
    setStep("idle");
  } else {
    setStep("sent");
  }
}

  async function handleMagicLink() {
    const trimmed = email.trim().toLowerCase();
    const user = await fetchProfile(trimmed);
    if (user) {
      onAuth(user);
    } else {
      onAuth({ email: trimmed, name: trimmed.split("@")[0], role: "admin", initials: trimmed.slice(0, 2).toUpperCase(), color: "#111111" });
    }
  }

    async function handleDemoLogin(demoEmail: string) {
    setEmail(demoEmail);
    setDemoOpen(false);
    setStep("loading");
    const user = await fetchProfile(demoEmail);
    if (user) onAuth(user);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#f7f7f8" }}
    >
      {/* Card */}
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center mb-3 shadow-sm">
            <span className="text-white text-xs font-mono font-bold tracking-tight">AI</span>
          </div>
          <p className="text-sm font-semibold text-foreground">Cockpit</p>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">Project Tracker</p>
        </div>

        {/* ── IDLE / LOADING STATE ── */}
        {(step === "idle" || step === "loading") && (
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="px-6 pt-6 pb-5 border-b border-border" style={{ backgroundColor: "#fafafa" }}>
              <h1 className="text-base font-semibold text-foreground">Sign in to Cockpit</h1>
              <p className="text-xs font-mono text-muted-foreground mt-1 leading-relaxed">
                Enter your email and we'll send you a secure magic link — no password needed.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1.5">
                  <Mail size={10} />
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="you@company.com"
                  disabled={step === "loading"}
                  autoFocus
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15 disabled:opacity-50 transition-all"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                />
                {error && (
                  <p className="text-xs mt-1.5" style={{ color: "#dc2626" }}>{error}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={step === "loading"}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-70"
                style={{ backgroundColor: "#111111" }}
              >
                {step === "loading" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending magic link…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Send Magic Link
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </form>

            {/* Security note */}
            <div className="px-6 pb-5 flex items-center gap-2">
              <ShieldCheck size={11} className="text-muted-foreground flex-shrink-0" />
              <p className="text-[10px] font-mono text-muted-foreground">
                Secure, password-free authentication. Links expire in 15 minutes.
              </p>
            </div>
          </div>
        )}

        {/* ── SENT STATE ── */}
        {step === "sent" && (
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-8 text-center">
              {/* Success icon */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}
              >
                <CheckCircle2 size={26} style={{ color: "#16a34a" }} strokeWidth={1.8} />
              </div>

              <h2 className="text-base font-semibold text-foreground">Check your inbox</h2>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                We sent a magic link to
              </p>
              <p
                className="text-xs font-mono font-semibold text-foreground mt-1 px-3 py-1.5 rounded-lg inline-block"
                style={{ backgroundColor: "#f5f5f5", border: "1px solid rgba(0,0,0,0.08)" }}
              >
                {email}
              </p>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                Click the link in your email to sign in. The link expires in 15 minutes.
              </p>
            </div>

            {/* Demo shortcut */}
            <div
              className="mx-6 mb-6 p-4 rounded-xl border"
              style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}
            >
              <p className="text-xs font-mono font-semibold mb-1" style={{ color: "#d97706" }}>
                Demo environment
              </p>
              <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                No real email is sent. Click below to simulate the magic link click.
              </p>
              <button
                onClick={handleMagicLink}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                style={{ backgroundColor: "#d97706", color: "#fff" }}
              >
                Simulate magic link click
                <ArrowRight size={12} />
              </button>
            </div>

            {/* Try different email */}
            <div className="px-6 pb-6 text-center">
              <button
                onClick={() => { setStep("idle"); setEmail(""); }}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCcw size={10} />
                Use a different email
              </button>
            </div>
          </div>
        )}

        {/* Demo accounts */}
        <div ref={demoRef} className="mt-4 relative">
          <button
            onClick={() => setDemoOpen((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border bg-white text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all"
          >
            Demo accounts
            <ChevronDown size={11} style={{ transform: demoOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
