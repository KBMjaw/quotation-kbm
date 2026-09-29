"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getRepo, getSupabase } from "@/lib/data/client";
import type { Repo } from "@/lib/data/repo";
import { sha256 } from "@/lib/image";
import type { Company, Material, QuotationSettings, UnitType } from "@/lib/types";
import { Button, Field, Input, Spinner, errorMessage } from "./ui";

interface DataCtx {
  repo: Repo;
  mode: "local" | "supabase";
  companies: Company[];
  units: UnitType[];
  materials: Material[];
  settings: QuotationSettings;
  refresh: () => Promise<void>;
  userEmail: string | null;
  /** Can manage companies, materials, units and quotation settings */
  isAdmin: boolean;
  /** Local mode: Settings are protected by a PIN */
  pinLocked: boolean;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData must be used inside <DataProvider>");
  return v;
}

const UNLOCK_KEY = "kipipl-qm:admin-unlocked";

export function DataProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<"admin" | "user">("user");
  const [data, setData] = useState<Pick<DataCtx, "companies" | "units" | "materials" | "settings"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  // Resolve the backend on the client only (localStorage / Supabase session).
  useEffect(() => {
    setRepo(getRepo());
    try {
      setUnlocked(sessionStorage.getItem(UNLOCK_KEY) === "1");
    } catch {}
    const sb = getSupabase();
    if (!sb) {
      setSession(null);
      return;
    }
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!repo) return;
    try {
      const [companies, units, materials, settings] = await Promise.all([
        repo.listCompanies(),
        repo.listUnits(),
        repo.listMaterials(),
        repo.getSettings(),
      ]);
      setData({ companies, units, materials, settings });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [repo]);

  const needsLogin = repo?.mode === "supabase" && session === null;

  useEffect(() => {
    if (!repo || session === undefined || needsLogin) return;
    refresh();
    const sb = getSupabase();
    if (sb && session) {
      sb.from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data }) => setRole(data?.role === "admin" ? "admin" : "user"));
    }
  }, [repo, session, needsLogin, refresh]);

  const value = useMemo<DataCtx | null>(() => {
    if (!repo || !data) return null;
    const local = repo.mode === "local";
    const pinLocked = local && !!data.settings.admin_pin_hash && !unlocked;
    return {
      repo,
      mode: repo.mode,
      ...data,
      refresh,
      userEmail: session?.user.email ?? null,
      isAdmin: local ? !pinLocked : role === "admin",
      pinLocked,
      unlock: async (pin: string) => {
        const ok = (await sha256(pin)) === data.settings.admin_pin_hash;
        if (ok) {
          setUnlocked(true);
          try {
            sessionStorage.setItem(UNLOCK_KEY, "1");
          } catch {}
        }
        return ok;
      },
      lock: () => {
        setUnlocked(false);
        try {
          sessionStorage.removeItem(UNLOCK_KEY);
        } catch {}
      },
      signOut: async () => {
        await getSupabase()?.auth.signOut();
        setData(null);
      },
    };
  }, [repo, data, refresh, session, role, unlocked]);

  if (needsLogin) return <LoginScreen />;
  if (error && !data)
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="mb-4 text-sm text-red-600">Could not load data: {error}</p>
        <Button onClick={refresh}>Retry</Button>
      </div>
    );
  if (!value) return <Spinner />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase()!;
    setBusy(true);
    setMsg(null);
    const res = signup
      ? await sb.auth.signUp({ email, password })
      : await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (res.error) setMsg(res.error.message);
    else if (signup && !res.data.session) setMsg("Check your email to confirm your account, then sign in.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">KIPIPL Quotation Maker</h1>
          <p className="text-sm text-slate-500">{signup ? "Create an account" : "Sign in to continue"}</p>
        </div>
        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? "new-password" : "current-password"}
          />
        </Field>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </Button>
        <button type="button" className="w-full text-center text-xs text-brand-700 hover:underline" onClick={() => setSignup(!signup)}>
          {signup ? "Have an account? Sign in" : "New user? Create an account"}
        </button>
      </form>
    </div>
  );
}
