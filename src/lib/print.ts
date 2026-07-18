import { documentToHtml, type PosDocument } from "@/lib/pos-document";
import { usePrinterStore } from "@/store/printer";

export async function printPosDocument(
  doc: PosDocument,
  options?: { silent?: boolean },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const html = documentToHtml(doc);
  const { deviceName, silentPrint } = usePrinterStore.getState();
  const desktop = window.zatgoDesktop;

  if (desktop?.printHtml) {
    const result = await desktop.printHtml({
      html,
      deviceName: deviceName || undefined,
      silent: options?.silent ?? silentPrint,
      landscape: false,
    });
    return result;
  }

  return printHtmlInBrowser(html);
}

function printHtmlInBrowser(html: string): Promise<{ ok: true } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) {
      frame.remove();
      resolve({ ok: false, message: "Could not open print preview" });
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      frame.remove();
    };

    win.focus();
    win.onafterprint = () => {
      cleanup();
      resolve({ ok: true });
    };

    setTimeout(() => {
      try {
        win.print();
      } catch {
        cleanup();
        resolve({ ok: false, message: "Browser print failed" });
      }
    }, 50);

    // Fallback if afterprint never fires
    setTimeout(() => {
      if (document.body.contains(frame)) {
        cleanup();
        resolve({ ok: true });
      }
    }, 60_000);
  });
}

export async function openCashDrawerIfNeeded(method: string) {
  const { openDrawerOnCash } = usePrinterStore.getState();
  if (!openDrawerOnCash || method !== "cash") return;
  const desktop = window.zatgoDesktop;
  if (!desktop?.openCashDrawer) return;
  await desktop.openCashDrawer();
}

export async function listDesktopPrinters() {
  return (await window.zatgoDesktop?.listPrinters()) ?? [];
}
