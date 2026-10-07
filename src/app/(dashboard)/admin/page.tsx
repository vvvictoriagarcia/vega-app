"use client";

// ============================================================
// /admin — Vega platform admin: client accounts and invitations.
//
// Visible only to emails in PLATFORM_ADMIN_EMAILS (checked by the
// API on every call; this page just asks /api/admin/me first so a
// non-admin sees "not found" instead of a broken table).
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Loader2, MailPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ClientRow {
  id: string;
  name: string;
  ownerEmail: string | null;
  members: number;
  whatsapp: "connected" | "disconnected" | "none";
  createdAt: string;
}

type Gate = "loading" | "admin" | "denied";

export default function AdminPage() {
  const t = useTranslations("AdminPage");
  const [gate, setGate] = useState<Gate>("loading");
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/clients", { cache: "no-store" });
    if (!res.ok) {
      setClients([]);
      toast.error(t("loadFailed"));
      return;
    }
    const json = (await res.json()) as { clients: ClientRow[] };
    setClients(json.clients);
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      const json = res.ok ? ((await res.json()) as { isAdmin: boolean }) : { isAdmin: false };
      if (cancelled) return;
      setGate(json.isAdmin ? "admin" : "denied");
      if (json.isAdmin) void load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const createClientAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, ownerEmail }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(t("invited", { email: ownerEmail.trim() }));
      setBusinessName("");
      setOwnerEmail("");
      void load();
      return;
    }
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    const key =
      json.error === "business_name"
        ? "errorBusinessName"
        : json.error === "owner_email"
          ? "errorOwnerEmail"
          : json.error === "already_registered"
            ? "errorAlreadyRegistered"
            : "errorGeneric";
    setFormError(t(key));
  };

  if (gate === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t("loading")} />
      </div>
    );
  }

  if (gate === "denied") {
    return <p className="py-16 text-center text-muted-foreground">{t("notFound")}</p>;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MailPlus className="h-5 w-5" aria-hidden="true" />
            {t("newClientTitle")}
          </CardTitle>
          <CardDescription>{t("newClientDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createClientAccount} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="businessName">{t("businessNameLabel")}</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t("businessNamePlaceholder")}
                  maxLength={120}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ownerEmail">{t("ownerEmailLabel")}</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  autoComplete="off"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder={t("ownerEmailPlaceholder")}
                  required
                />
              </div>
            </div>
            {formError && (
              <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? t("sending") : t("submit")}
              </Button>
              <span className="text-xs text-muted-foreground">{t("passwordNote")}</span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            {t("clientsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clients === null ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t("loading")} />
          ) : clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th scope="col" className="py-2 pr-3 font-medium">{t("colBusiness")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("colOwner")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("colMembers")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("colWhatsapp")}</th>
                    <th scope="col" className="py-2 font-medium">{t("colCreated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="border-b border-border/60">
                      <td className="py-3 pr-3 font-medium text-foreground">{c.name}</td>
                      <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{c.ownerEmail ?? "—"}</td>
                      <td className="py-3 pr-3">{c.members}</td>
                      <td className="py-3 pr-3">
                        <Badge variant={c.whatsapp === "connected" ? "default" : "outline"}>
                          {t(`whatsapp_${c.whatsapp}`)}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
