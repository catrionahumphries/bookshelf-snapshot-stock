import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanBarcode, X, Loader2, RotateCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queueIsbn } from "@/lib/isbn-queue.functions";
import { acceptBarcode, normalizeIsbn } from "@/lib/isbn";

type Scan = { id: string; isbn: string; sku: string; format: string; state: "saving" | "saved" | "failed" };

export function BarcodeScanner({ sku, format, onSaved }: { sku: string; format: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [validation, setValidation] = useState("");
  const [scans, setScans] = useState<Scan[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const latest = useRef({ sku, format, onSaved });
  const last = useRef<{ isbn: string; time: number } | null>(null);
  const queue = useServerFn(queueIsbn);
  latest.current = { sku, format, onSaved };

  const save = async (scan: Scan) => {
    setScans((items) => items.map((item) => item.id === scan.id ? { ...item, state: "saving" } : item));
    try {
      await queue({ data: { id: scan.id, isbn: scan.isbn, sku: scan.sku, format: scan.format } });
      setScans((items) => items.map((item) => item.id === scan.id ? { ...item, state: "saved" } : item));
      const ctx = audio.current;
      if (ctx && ctx.state === "running") {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.start(); oscillator.stop(ctx.currentTime + 0.12);
      }
      latest.current.onSaved();
    } catch {
      setScans((items) => items.map((item) => item.id === scan.id ? { ...item, state: "failed" } : item));
    }
  };
  const add = (isbn: string) => {
    const scan: Scan = { id: crypto.randomUUID(), isbn, sku: latest.current.sku, format: latest.current.format, state: "saving" };
    setScans((items) => [scan, ...items]);
    void save(scan);
  };
  const addRef = useRef(add);
  addRef.current = add;
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    setCameraError("");
    last.current = null;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped || !video.current) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false }, video.current, (result) => {
          if (stopped || !result) return;
          const isbn = normalizeIsbn(result.getText());
          if (!isbn) return;
          const now = Date.now();
          const accepted = acceptBarcode(last.current, isbn, now);
          last.current = { isbn, time: now };
          if (accepted) addRef.current(isbn);
        });
        if (stopped) controls.stop();
      } catch {
        if (!stopped) setCameraError("Camera unavailable. Allow camera access, or enter an ISBN below.");
      }
    };
    void start();
    return () => { stopped = true; controls?.stop(); };
  }, [open]);
  useEffect(() => () => { void audio.current?.close(); }, []);

  return <div className="mt-3 border-t pt-3">
    <Button variant="outline" className="h-12 w-full" onClick={() => {
      if (!audio.current) audio.current = new AudioContext();
      void audio.current.resume().catch(() => undefined);
      setOpen(true);
    }}><ScanBarcode />Scan barcodes</Button>
    {open && <section className="mt-3 space-y-3" aria-label="Barcode scanner">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">ISBN scanner · SKU {sku || "—"}{format ? ` · ${format}` : ""}</span><Button size="icon" variant="ghost" aria-label="Close barcode scanner" disabled={scans.some((scan) => scan.state !== "saved")} onClick={() => setOpen(false)}><X /></Button></div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
        <video ref={video} className="h-full w-full object-cover" muted playsInline aria-label="Live barcode camera" />
        {!cameraError && <div className="pointer-events-none absolute inset-x-8 top-1/3 h-1/3 rounded border-2 border-primary" />}
      </div>
      {cameraError && <p role="alert" className="text-sm text-warning">{cameraError}</p>}
      <form className="flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        const isbn = normalizeIsbn(manual);
        if (!isbn) { setValidation("Enter a valid ISBN-10 or ISBN-13."); return; }
        setValidation(""); setManual(""); add(isbn);
      }}>
        <Input aria-label="Enter ISBN" placeholder="ISBN" value={manual} onChange={(event) => setManual(event.target.value)} />
        <Button type="submit" size="icon" aria-label="Add ISBN"><Plus /></Button>
      </form>
      {validation && <p role="alert" className="text-sm text-warning">{validation}</p>}
      <p role="status" className="text-sm text-muted-foreground">{scans.filter((scan) => scan.state === "saved").length} scans saved{scans.some((scan) => scan.state === "saving") ? " · Saving scans…" : ""}</p>
      {scans.filter((scan) => scan.state === "failed").map((scan) => <div key={scan.id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 break-words text-warning">{scan.isbn} · Not saved</span><Button size="sm" variant="outline" onClick={() => void save(scan)}><RotateCcw />Retry</Button></div>)}
      {scans.some((scan) => scan.state === "saving") && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </section>}
  </div>;
}