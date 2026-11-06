import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Download, Loader2, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractBook } from "@/lib/books.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shelfscan — Book photos to spreadsheet" },
      { name: "description", content: "Snap a book, add a SKU, and build a CSV inventory from your phone." },
      { property: "og:title", content: "Shelfscan — Book photos to spreadsheet" },
      { property: "og:description", content: "Snap a book, add a SKU, and build a CSV inventory from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Book = { id: string; title: string; author: string; series: string; sku: string };
const KEY = "shelfscan-books";

async function shrink(file: File): Promise<string> {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const max = 1280;
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
  const [books, setBooks] = useState<Book[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useServerFn(extractBook);

  useEffect(() => {
    try { setBooks(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(books)); }, [books, loaded]);

  const onFile = async (f?: File) => {
    if (!f) return;
    try { setImage(await shrink(f)); } catch { toast.error("Couldn't open that image"); }
  };

  const process = async () => {
    if (!image) return toast.error("Add a photo first");
    setBusy(true);
    try {
      const r = await run({ data: { image } });
      if (!r.title && !r.author) toast.warning("Couldn't read title — row added, edit it below");
      setBooks((b) => [{ id: crypto.randomUUID(), ...r, sku: sku.trim() }, ...b]);
      toast.success(r.title || "Book added");
      setImage(null); setSku("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  const update = (id: string, k: keyof Book, v: string) =>
    setBooks((b) => b.map((x) => (x.id === id ? { ...x, [k]: v } : x)));

  const download = () => {
    const rows = [["Book Title", "Author", "Book Series", "SKU"], ...books.map((b) => [b.title, b.author, b.series, b.sku])];
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `books-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Shelfscan</h1>
        <span className="ml-auto text-sm text-muted-foreground">{books.length} books</span>
      </header>

      <section className="rounded-2xl border bg-card p-4 shadow-soft">
        <label className="flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/50 text-muted-foreground">
          {image ? (
            <img src={image} alt="Book preview" className="h-full w-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-2"><Camera className="h-8 w-8" />Tap to take or choose a photo</span>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <Input className="mt-3 h-12 text-base" placeholder="SKU number" value={sku} onChange={(e) => setSku(e.target.value)} inputMode="text" />
        <Button className="mt-3 h-12 w-full text-base" onClick={process} disabled={busy || !image}>
          {busy ? <><Loader2 className="animate-spin" /> Reading…</> : "Process Book"}
        </Button>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Inventory</h2>
          <Button variant="outline" onClick={download} disabled={!books.length}><Download /> Download CSV</Button>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>{["Book Title", "Author", "Book Series", "SKU", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {books.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No books yet — snap your first one above.</td></tr>}
              {books.map((b) => (
                <tr key={b.id} className="border-t">
                  {(["title", "author", "series", "sku"] as const).map((k) => (
                    <td key={k} className="px-1 py-1">
                      <input className="w-full rounded-md bg-transparent px-2 py-1.5 outline-none focus:bg-muted" value={b[k]} onChange={(e) => update(b.id, k, e.target.value)} />
                    </td>
                  ))}
                  <td className="px-1"><Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setBooks((x) => x.filter((y) => y.id !== b.id))}><Trash2 /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
