import { ErpnextLoginCard } from "@zatgo/ui";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { loginWithPassword, testConnection } from "@/lib/client";
import { useSessionStore } from "@/store/session";

export function LoginPage() {
  const navigate = useNavigate();
  const connection = useSessionStore((s) => s.connection);
  const connected = useSessionStore((s) => s.connected);
  const lastError = useSessionStore((s) => s.lastError);

  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  if (connected) {
    return <Navigate to="/sell" replace />;
  }

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await loginWithPassword({
        baseUrl: connection.baseUrl,
        usr,
        pwd,
      });
      if (result.ok) {
        toast.success(`Signed in as ${result.fullName || result.user}`);
        navigate("/sell", { replace: true });
      } else {
        toast.error(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onPing = async () => {
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
    <ErpnextLoginCard
      productTitle="POS"
      usr={usr}
      pwd={pwd}
      busy={busy}
      error={lastError}
      onUsrChange={setUsr}
      onPwdChange={setPwd}
      onSubmit={(e) => void onLogin(e)}
      onTestSite={() => void onPing()}
      footerHint={
        <>
          Login runs in the Electron process and stores a Frappe session cookie (sid). Use{" "}
          <code className="rounded bg-[var(--color-muted)] px-1">pnpm dev:pos</code>.
        </>
      }
    />
  );
}
