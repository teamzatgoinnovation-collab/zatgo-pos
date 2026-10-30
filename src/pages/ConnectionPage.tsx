import { Button, cn, PageHeader } from "@zatgo/ui";
import { Loader2 } from "@zatgo/icons";
import { useState } from "react";
import { toast } from "sonner";
import { FeaturePreferences } from "@/components/pos/FeaturePreferences";
import { PrinterSettings } from "@/components/pos/PrinterSettings";
import {
  loginWithPassword,
  logoutFromErpnext,
  testConnection,
} from "@/lib/client";
import { useSiteStore } from "@/store/site";
import { useSessionStore } from "@/store/session";

const inputClass =
  "h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 outline-none focus:border-[var(--color-primary)]";

export function ConnectionPage() {
  const connection = useSessionStore((s) => s.connection);
  const setConnection = useSessionStore((s) => s.setConnection);

  const connected = useSessionStore((s) => s.connected);
  const user = useSessionStore((s) => s.user);
  const fullName = useSessionStore((s) => s.fullName);
  const lastError = useSessionStore((s) => s.lastError);
  const site = useSiteStore((s) => s.profile);

  const [baseUrl, setBaseUrl] = useState(connection.baseUrl);
  const [usr, setUsr] = useState(user ?? "");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const site = baseUrl.trim().replace(/\/$/, "");
    setConnection({ baseUrl: site });
    setBusy(true);
    try {
      const result = await loginWithPassword({
        baseUrl: site,
        usr,
        pwd,
      });
      if (result.ok) {
        setPwd("");
        toast.success(`Signed in as ${result.fullName || result.user}`);
      } else {
        toast.error(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    setBusy(true);
    try {
      await logoutFromErpnext();
      toast.success("Signed out");
    } finally {
      setBusy(false);
    }
  };

  const onPing = async () => {
    const site = baseUrl.trim().replace(/\/$/, "");
    if (!connected && site !== connection.baseUrl) {
      setConnection({ baseUrl: site });
    }
    setBusy(true);
    try {
      const result = await testConnection();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Setup"
        description="Site profile, module preferences (tables / kitchen), printer, and ERPNext sign-in."
      />

      <FeaturePreferences />

      <PrinterSettings />

      {site ? (
        <section className="mb-8 text-sm">
          <h2 className="mb-2 font-medium text-[var(--color-muted-foreground)]">Site profile</h2>
          <p>
            Company {site.company ?? "—"} · {site.currency ?? "—"} · industries:{" "}
            {site.industries.length ? site.industries.join(", ") : "none"}
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Set in ZG System Settings on the site, not in this app.
          </p>
        </section>
      ) : null}

      <form
        className="max-w-xl space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4"
        onSubmit={(e) => void onLogin(e)}
      >
        <h2 className="text-sm font-medium">ERPNext login</h2>

        {connected ? (
          <div className="rounded-[var(--radius-lg)] bg-[var(--pos-sidebar-active)] px-3 py-2 text-sm">
            Signed in as <strong>{fullName || user}</strong>
          </div>
        ) : null}
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Site URL</span>
          <input
            className={inputClass}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://demo.zatgo.online"
            autoComplete="url"
            disabled={connected}
            required
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Email / User</span>
          <input
            className={inputClass}
            value={usr}
            onChange={(e) => setUsr(e.target.value)}
            autoComplete="username"
            disabled={connected}
            required={!connected}
          />
        </label>
        {!connected ? (
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Password</span>
            <input
              type="password"
              className={inputClass}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {!connected ? (
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Sign in
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => void onLogout()} disabled={busy}>
              Sign out
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => void onPing()} disabled={busy}>
            Test site
          </Button>
        </div>

        <p className="text-sm text-[var(--color-muted-foreground)]">
          Status:{" "}
          <span className={connected ? "text-[var(--color-primary)]" : ""}>
            {connected ? `Connected as ${user}` : "Not signed in"}
          </span>
          {lastError ? ` — ${lastError}` : null}
        </p>
      </form>
    </div>
  );
}
