import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Badges encode only an opaque token (prefixed so the scanner can reject
// unrelated QR codes) — never the resident's name or other PHI.
export function badgePayload(token: string) {
  return `WCSL:${token}`;
}

export default function QrCode({ value, size = 160 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className="qr-placeholder" />;
  return <img src={src} width={size} height={size} alt="Resident check-in QR code" className="qr-img" />;
}
