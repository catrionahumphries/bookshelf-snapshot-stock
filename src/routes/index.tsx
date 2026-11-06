import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Download, Loader2, Trash2, BookOpen, AlertTriangle, Check, LogOut, Images, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { queuePhoto, retryPhoto } from "@/lib/photo-queue.functions";
import { photoCounts, needsPhotoAttention, type PhotoJob } from "@/lib/photo-queue";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shelfscan — Book photos to spreadsheet" },
      { name: "description", content: "Snap a stack of books, and build a synced CSV inventory from your phone." },
      { property: "og:title", content: "Shelfscan — Book photos to spreadsheet" },
      { property: "og:description", content: "Snap a stack of books, and build a synced CSV inventory from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Book = {
  id: string; title: string; author: string; series_name: string; volume: string;
  sku: string; needs_review: boolean; review_note: string;
};
type Field = "title" | "author" | "series_name" | "volume" | "sku";
const COLS: [Field, string][] = [["title", "Book Title"], ["author", "Author"], ["series_name", "Series Name"], ["volume", "Volume #"], ["sku", "SKU"]];

async function shrink(file: File): Promise<string> {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const max = 2000;
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  const context = c.getContext("2d");
  if (!context) { URL.revokeObjectURL(img.src); throw new Error("Couldn't prepare image"); }
  context.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return c.toDataURL("image/jpeg", 0.85);
}
const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  return session ? <Inventory email={session.user.email ?? ""} /> : <SignIn />;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { data, error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (mode === "up" && !data.session) toast.success("Check your email to confirm your account.");
  };
  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Google sign-in failed");
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-6 flex items-center gap-2"><BookOpen className="h-7 w-7 text-primary" /><h1 className="font-display text-3xl font-semibold">Shelfscan</h1></div>
      <p className="mb-6 text-muted-foreground">Sign in to see your inventory on any device.</p>
      <Button variant="outline" className="h-12 w-full text-base" onClick={google}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
        Continue with Google
      </Button>
      <div className="my-4 text-center text-sm text-muted-foreground">or</div>
      <form onSubmit={submit} className="space-y-3">
        <Input className="h-12 text-base" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input className="h-12 text-base" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        <Button className="h-12 w-full text-base" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : mode === "in" ? "Sign in" : "Create account"}</Button>
      </form>
      {mode === "in" && <button className="mt-3 text-sm text-muted-foreground" onClick={async () => {
        if (!email) { toast.error("Enter your email first"); return; }
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) toast.error(error.message); else toast.success("Check your email for a reset link.");
      }}>Forgot password?</button>}
      <button className="mt-4 text-sm text-primary" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </main>
  );
}

function Inventory({ email }: { email: string }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "review">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: Field; dir: "asc" | "desc" } | null>(null);
  const [jobs, setJobs] = useState<PhotoJob[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string | null>(null);
  const completedRef = useRef<Map<string, string> | null>(null);
  const run = useServerFn(queuePhoto);
  const retry = useServerFn(retryPhoto);

  const load = async () => {
    const { data, error } = await supabase.from("books").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Couldn't load inventory"); else setBooks(data as Book[]);
  };
  const loadJobs = async () => {
    const { data, error } = await supabase.from("photo_jobs").select("id,sku,status,result_count,error_message,pause_kind,created_at,lease_until").order("created_at", { ascending: false });
    if (error) { toast.error("Couldn't load photo queue"); return; }
    const next = data ?? [];
    const previous = completedRef.current;
    if (previous) for (const job of next) {
      if (job.status === "completed" && previous.get(job.id) !== "completed") {
        toast.success(job.result_count ? `${job.result_count} books added${job.sku ? ` · ${job.sku}` : ""}` : `No books found${job.sku ? ` · ${job.sku}` : ""}`);
        await load();
      }
    }
    completedRef.current = new Map(next.map((job) => [job.id, job.status]));
    setJobs(next);
  };
  useEffect(() => {
    load();
    loadJobs();
    const onFocus = () => { load(); loadJobs(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const counts = photoCounts(jobs);
  useEffect(() => {
    if (!counts.pending) return;
    const timer = window.setInterval(() => { if (!document.hidden) loadJobs(); }, 5000);
    return () => window.clearInterval(timer);
  }, [counts.pending]);

  const onFile = async (f?: File) => {
    if (!f) return;
    setPreparing(true);
    try { setImage(await shrink(f)); jobIdRef.current = crypto.randomUUID(); } catch { toast.error("Couldn't open that image"); }
    finally { setPreparing(false); }
  };

  const process = async () => {
    if (!image) return;
    setBusy(true);
    try {
      const id = jobIdRef.current ?? crypto.randomUUID();
      jobIdRef.current = id;
      const preview = window.location.hostname === "localhost" || window.location.hostname.startsWith("id-preview--") || window.location.hostname.includes("-dev.lovable.app");
      await run({ data: { id, image, sku, preview } });
      toast.success("Photo queued");
      setImage(null); setSku("");
      jobIdRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
      await loadJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  const retryJob = async (id: string) => {
    setRetrying(id);
    try { await retry({ data: { id } }); toast.success("Photo queued again"); await loadJobs(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't retry photo"); }
    finally { setRetrying(null); }
  };

  const patch = async (id: string, p: Partial<Book>) => {
    setBooks((b) => b.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const { error } = await supabase.from("books").update(p).eq("id", id);
    if (error) toast.error("Couldn't save change");
  };
  const remove = async (id: string) => {
    setBooks((b) => b.filter((x) => x.id !== id));
    await supabase.from("books").delete().eq("id", id);
  };

  const download = () => {
    const rows = [[...COLS.map((c) => c[1]), "Needs Review"], ...books.map((b) => [...COLS.map(([k]) => b[k]), b.needs_review ? "Yes" : "No"])];
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `books-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const reviewCount = books.filter((b) => b.needs_review).length;
  const q = query.trim().toLowerCase();
  const shown = (filter === "review" ? books.filter((b) => b.needs_review) : books)
    .filter((b) => !q || COLS.some(([k]) => (b[k] ?? "").toLowerCase().includes(q)))
    .sort((a, b) => sort ? (sort.dir === "asc" ? 1 : -1) * (a[sort.key] ?? "").localeCompare(b[sort.key] ?? "", undefined, { numeric: true, sensitivity: "base" }) : 0);
  const toggleSort = (key: Field) => setSort((s) => s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Shelfscan</h1>
        <span className="ml-auto truncate text-sm text-muted-foreground">{books.length} books</span>
        <Button size="icon" variant="ghost" aria-label={`Sign out ${email}`} onClick={() => supabase.auth.signOut()}><LogOut /></Button>
      </header>

      <section className="rounded-2xl border bg-card p-4 shadow-soft">
        <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/50 text-muted-foreground">
          {image ? <img src={image} alt="Books preview" className="h-full w-full object-contain" /> : (
            <span className="flex flex-col items-center gap-2 text-center">{preparing ? <Loader2 className="h-8 w-8 animate-spin" /> : <Camera className="h-8 w-8" />}<span>{preparing ? "Opening photo…" : "Book photo"}</span></span>
          )}
        </div>
        <input ref={cameraRef} aria-label="Take book photo" type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy || preparing} onChange={(e) => onFile(e.target.files?.[0])} />
        <input ref={fileRef} aria-label="Choose camera roll photo" type="file" accept="image/*" className="sr-only" disabled={busy || preparing} onChange={(e) => onFile(e.target.files?.[0])} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12" disabled={busy || preparing} onClick={() => cameraRef.current?.click()}><Camera />Take photo</Button>
          <Button variant="outline" className="h-12" disabled={busy || preparing} onClick={() => fileRef.current?.click()}><Images />Camera roll</Button>
        </div>
        <Input className="mt-3 h-12 text-base" placeholder="SKU number" aria-label="SKU number" maxLength={100} disabled={busy} value={sku} onChange={(e) => { setSku(e.target.value); jobIdRef.current = crypto.randomUUID(); }} />
        <p className="mt-1 px-1 text-xs text-muted-foreground">Every book in this photo gets this SKU.</p>
        <Button className="mt-3 h-12 w-full text-base" onClick={process} disabled={busy || preparing || !image}>
          {busy ? <><Loader2 className="animate-spin" /> Uploading…</> : "Queue Photo"}
        </Button>
      </section>

      {jobs.length > 0 && <section className="mt-4 border-b pb-4" aria-label="Photo queue">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" role="status">
          <span className="flex items-center gap-2">{counts.pending > 0 && <Loader2 className="h-4 w-4 animate-spin" />}{counts.pending} photos pending</span>
          <span className="text-muted-foreground">{counts.completed} completed</span>
          {counts.attention > 0 && <span className="text-warning">{counts.attention} need attention</span>}
        </div>
        {jobs.filter((job) => needsPhotoAttention(job)).map((job) => <div key={job.id} className="mt-3 flex items-start gap-3 text-sm">
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1"><p className="font-medium break-words">{job.sku || "Photo"}</p><p className="text-muted-foreground break-words">{job.error_message || "This photo hasn't finished. Retry when you're ready."}</p></div>
          {job.pause_kind !== "refusal" && <Button variant="outline" size="sm" disabled={!!retrying} onClick={() => retryJob(job.id)}><RotateCcw className={retrying === job.id ? "animate-spin" : ""} />Retry</Button>}
        </div>)}
      </section>}

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">Inventory</h2>
          <div className="flex rounded-lg border p-0.5 text-sm">
            <button className={`rounded-md px-3 py-1 ${filter === "all" ? "bg-muted font-medium" : ""}`} onClick={() => setFilter("all")}>All</button>
            <button className={`rounded-md px-3 py-1 ${filter === "review" ? "bg-muted font-medium" : ""}`} onClick={() => setFilter("review")}>To check ({reviewCount})</button>
          </div>
          <Button className="ml-auto" variant="outline" onClick={download} disabled={!books.length}><Download /> CSV</Button>
        </div>
        <Input className="mb-3 h-11 text-base" type="search" placeholder="Search title, author, series, SKU…" aria-label="Search inventory" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr><th className="w-8" />{COLS.map(([k, h]) => <th key={h} className="px-1 py-1 font-medium" aria-sort={sort?.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left hover:bg-background/60" onClick={() => toggleSort(k)}>
                  {h}<span className="text-xs">{sort?.key === k ? (sort.dir === "asc" ? "A→Z" : "Z→A") : ""}</span>
                </button>
              </th>)}<th /></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{q ? "No matching books." : filter === "review" ? "Nothing to check." : "No books yet — snap your first photo above."}</td></tr>}
              {shown.map((b) => (
                <tr key={b.id} className={`border-t ${b.needs_review ? "bg-warning/10" : ""}`}>
                  <td className="pl-2">
                    {b.needs_review ? (
                      <button title={b.review_note ? `${b.review_note} — tap to mark checked` : "Tap to mark checked"} aria-label="Mark as checked" onClick={() => patch(b.id, { needs_review: false })}>
                        <AlertTriangle className="h-4 w-4 text-warning" />
                      </button>
                    ) : (
                      <button title="Flag for checking" aria-label="Flag for checking" onClick={() => patch(b.id, { needs_review: true })}><Check className="h-4 w-4 text-muted-foreground/50" /></button>
                    )}
                  </td>
                  {COLS.map(([k]) => (
                    <td key={k} className={`px-1 py-1 ${k === "volume" ? "w-20" : ""}`}>
                      <input className="w-full rounded-md bg-transparent px-2 py-1.5 outline-none focus:bg-muted" defaultValue={b[k]}
                        onBlur={(e) => e.target.value !== b[k] && patch(b.id, { [k]: e.target.value })} />
                      {k === "title" && b.needs_review && b.review_note && <p className="px-2 pb-1 text-xs text-muted-foreground">{b.review_note}</p>}
                    </td>
                  ))}
                  <td className="px-1"><Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(b.id)}><Trash2 /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
