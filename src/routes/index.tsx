import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Download, Loader2, Trash2, BookOpen, AlertTriangle, Check, LogOut } from "lucide-react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { extractBooks } from "@/lib/books.functions";

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
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
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
    if (error) return toast.error(error.message);
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
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.930-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.290c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
        Continue with Google
      </Button>
      <div className="my-4 text-center text-sm text-muted-foreground">or</div>
      <form onSubmit={submit} className="space-y-3">
        <Input className="h-12 text-base" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input className="h-12 text-base" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        <Button className="h-12 w-full text-base" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : mode === "in" ? "Sign in" : "Create account"}</Button>
      </form>
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
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useServerFn(extractBooks);

  const load = async () => {
    const { data, error } = await supabase.from("books").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Couldn't load inventory"); else setBooks(data as Book[]);
  };
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const onFile = async (f?: File) => {
    if (!f) return;
    try { setImage(await shrink(f)); } catch { toast.error("Couldn't open that image"); }
  };

  const process = async () => {
    if (!image) return;
    setBusy(true);
    try {
      const r = await run({ data: { image, skuStart: sku } });
      if (!r.count) toast.warning("No books found in that photo");
      else toast.success(`${r.count} book${r.count > 1 ? "s" : ""} added${r.uncertain ? ` · ${r.uncertain} to check` : ""}`);
      setImage(null); setSku("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
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
  const shown = filter === "review" ? books.filter((b) => b.needs_review) : books;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Shelfscan</h1>
        <span className="ml-auto truncate text-sm text-muted-foreground">{books.length} books</span>
        <Button size="icon" variant="ghost" aria-label={`Sign out ${email}`} onClick={() => supabase.auth.signOut()}><LogOut /></Button>
      </header>

      <section className="rounded-2xl border bg-card p-4 shadow-soft">
        <label className="flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/50 text-muted-foreground">
          {image ? <img src={image} alt="Books preview" className="h-full w-full object-contain" /> : (
            <span className="flex flex-col items-center gap-2 text-center"><Camera className="h-8 w-8" />Tap to photograph one or more books</span>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <Input className="mt-3 h-12 text-base" placeholder="Starting SKU (e.g. SKU-1001)" value={sku} onChange={(e) => setSku(e.target.value)} />
        <p className="mt-1 px-1 text-xs text-muted-foreground">Several books in one photo get numbered up from this SKU.</p>
        <Button className="mt-3 h-12 w-full text-base" onClick={process} disabled={busy || !image}>
          {busy ? <><Loader2 className="animate-spin" /> Reading &amp; researching…</> : "Process Books"}
        </Button>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">Inventory</h2>
          <div className="flex rounded-lg border p-0.5 text-sm">
            <button className={`rounded-md px-3 py-1 ${filter === "all" ? "bg-muted font-medium" : ""}`} onClick={() => setFilter("all")}>All</button>
            <button className={`rounded-md px-3 py-1 ${filter === "review" ? "bg-muted font-medium" : ""}`} onClick={() => setFilter("review")}>To check ({reviewCount})</button>
          </div>
          <Button className="ml-auto" variant="outline" onClick={download} disabled={!books.length}><Download /> CSV</Button>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr><th className="w-8" />{COLS.map(([, h]) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}<th /></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{filter === "review" ? "Nothing to check." : "No books yet — snap your first photo above."}</td></tr>}
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
