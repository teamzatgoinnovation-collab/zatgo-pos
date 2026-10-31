import { documentToHtml, type PosDocument } from "@/lib/pos-document";
import { usePrinterStore } from "@/store/printer";
import { usePosSettings } from "@/lib/offline/settings";
import type { Paper } from "@/lib/invoice-html";

/** The paper to use: this device's choice, else the site's ZG POS Settings (80mm by default). Kitchen tickets are always 80mm. */
export function activePaper(doc?: PosDocument): Paper {
  if (doc?.kind === "kitchen") return "80mm";
  return usePrinterStore.getState().paper ?? usePosSettings.getState().settings.counter.paperSize;
}

export async function printPosDocument(
  doc: PosDocument,
  options?: { silent?: boolean; paper?: Paper },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const paper = options?.paper ?? activePaper(doc);
  const html = documentToHtml(doc, paper);
  const { deviceName, silentPrint } = usePrinterStore.getState();
  const desktop = window.zatgoDesktop;

  if (desktop?.printHtml) {
    const result = await desktop.printHtml({
      html,
      deviceName: deviceName || undefined,
      silent: options?.silent ?? silentPrint,
      landscape: false,
      paper,
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
