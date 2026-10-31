import { erpnextPing } from "@zatgo/erpnext";
import { useSiteStore } from "@/store/site";
import { useSessionStore } from "@/store/session";
import { ApiError } from "@/lib/offline/api-error";

export type LoginResult =
  | { ok: true; user: string; fullName: string; baseUrl: string }
  | { ok: false; message: string };

/** ERPNext username/password login (Electron main process — no CORS). */
export async function loginWithPassword(input: {
  baseUrl: string;
  usr: string;
  pwd: string;
}): Promise<LoginResult> {
  if (!window.zatgoDesktop?.erpnextLogin) {
    return {
      ok: false,
      message:
        "ERPNext login requires the Electron app. Run: pnpm --filter @zatgo/pos dev",
    };
  }

  const result = await window.zatgoDesktop.erpnextLogin({
    baseUrl: input.baseUrl.trim().replace(/\/$/, ""),
    usr: input.usr.trim(),
    pwd: input.pwd,
  });

  if (!result.ok) {
    useSessionStore.getState().setSession({
      connected: false,
      error: result.message,
    });
    return result;
  }

  useSessionStore.getState().setSession({
    connected: true,
    user: result.user,
    fullName: result.fullName,
    baseUrl: result.baseUrl,
    error: null,
  });

  return result;
}

export async function logoutFromErpnext(): Promise<void> {
  if (window.zatgoDesktop?.erpnextLogout) {
    await window.zatgoDesktop.erpnextLogout();
  }
  useSessionStore.getState().clearSession();
  useSiteStore.getState().reset();
}

/** Restore renderer session flag if Electron main still has cookies (hot reload). */
export async function hydrateErpnextSession(): Promise<void> {
  if (!window.zatgoDesktop?.erpnextGetSession) return;
  const s = await window.zatgoDesktop.erpnextGetSession();
  if (s) {
    useSessionStore.getState().setSession({
      connected: true,
      user: s.user,
      fullName: s.fullName,
      baseUrl: s.baseUrl,
      error: null,
    });
  } else {
    const { connected } = useSessionStore.getState();
    if (connected) useSessionStore.getState().clearSession();
  }
}

/** Authenticated site request via Electron cookie session. */
export async function erpnextApi<T = unknown>(
  methodPath: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!window.zatgoDesktop?.erpnextRequest) {
    throw new Error("Not running inside Electron");
  }
  const path = methodPath.startsWith("/api/")
    ? methodPath
    : `/api/method/${methodPath}`;
  let res: Awaited<ReturnType<NonNullable<typeof window.zatgoDesktop>["erpnextRequest"]>>;
  try {
    res = await window.zatgoDesktop.erpnextRequest({
      path,
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
    });
  } catch {
    throw new ApiError("Cannot reach the server — check your connection.", { network: true });
  }
  let json: {
    message?: T | string;
    exception?: string;
    exc_type?: string;
    _server_messages?: string;
  };
  try {
    json = JSON.parse(res.bodyText || "{}");
  } catch {
    // A proxy error page (502/504 ...) is not JSON: keep the HTTP status so the caller can classify it.
    json = {};
    if (res.ok) throw new ApiError("The site sent an unreadable response", { status: 502 });
  }
  if (res.status === 404 && /\/zatgo_core\.api\.v1\.resto_pos\./.test(path)) {
    throw new ApiError(
      "Restaurant POS is switched off on this site (or zatgo-core is outdated). Enable Restaurant in ZG System Settings → Industries.",
      { status: 404 },
    );
  }
  if (res.status === 404 && /\/zatgo_core\.api\.v1\.retail_pos\./.test(path)) {
    throw new ApiError(
      "Supermarket POS is switched off on this site (or zatgo-core is outdated). Enable Supermarket in ZG System Settings → Industries.",
      { status: 404 },
    );
  }
  if (!res.ok) {
    let detail =
      typeof json.message === "string"
        ? json.message
        : json.exception
          ? String(json.exception).split("\n")[0]
          : `HTTP ${res.status}`;
    if (json._server_messages) {
      try {
        const msgs = JSON.parse(json._server_messages) as string[];
        const first = msgs[0] ? (JSON.parse(msgs[0]) as { message?: string }) : null;
        if (first?.message) detail = first.message;
      } catch {
        /* keep detail */
      }
    }
    throw new ApiError(detail, { status: res.status, excType: json.exc_type ?? null });
  }
  return (json.message ?? json) as T;
}

/** Ping the site (public via `@zatgo/erpnext`, or authenticated session ping). */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const { connection, connected } = useSessionStore.getState();
  if (!connection.baseUrl.trim()) {
    return { ok: false, message: "Site URL is required" };
  }

  try {
    if (connected && window.zatgoDesktop?.erpnextRequest) {
      const res = await window.zatgoDesktop.erpnextRequest({
        path: "/api/method/ping",
        method: "GET",
      });
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      const body = JSON.parse(res.bodyText || "{}") as { message?: string };
      return {
        ok: true,
        message: body.message === "pong" ? "Connected (pong)" : "Site reachable",
      };
    }

    return erpnextPing(connection.baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return { ok: false, message };
  }
}
