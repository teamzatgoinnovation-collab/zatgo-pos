import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

/** The ZATCA QR as an SVG string (drawn on the device, no network). Level M: ZATCA payloads are ~100-300 bytes. */
export function qrSvgMarkup(payload: string): string {
  if (!payload) return "";
  return renderToStaticMarkup(createElement(QRCodeSVG, { value: payload, size: 160, level: "M", marginSize: 0 }));
}
