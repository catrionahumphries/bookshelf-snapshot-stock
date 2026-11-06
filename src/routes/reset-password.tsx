import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Shelfscan" },
      { name: "description", content: "Choose a new password for your Shelfscan book inventory." },
      { property: "og:title", content: "Reset password — Shelfscan" },
      { property: "og:description", content: "Choose a new password for your Shelfscan book inventory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    navigate({ to: "/" });
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-6 flex items-center gap-2"><BookOpen className="h-7 w-7 text-primary" /><h1 className="font-display text-3xl font-semibold">Shelfscan</h1></div>
      <p className="mb-6 text-muted-foreground">Choose a new password.</p>
      <form onSubmit={submit} className="space-y-3">
        <Input className="h-12 text-base" type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        <Button className="h-12 w-full text-base" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : "Save new password"}</Button>
      </form>
    </main>
  );
}
