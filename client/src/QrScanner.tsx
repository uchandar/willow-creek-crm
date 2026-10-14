import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Props = {
  onScan: (text: string) => void;
  paused?: boolean;
};

// Camera-based QR scanner (works in mobile Safari and Chrome over HTTPS).
// The same code is ignored for a few seconds so one badge isn't submitted
// repeatedly while it stays in frame.
export default function QrScanner({ onScan, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  useEffect(() => {
    pausedRef.current = paused;
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    async function start() {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera. Use the badge-number box or manual check-in instead.");
        setActive(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
      } catch {
        setError("Camera permission was blocked. Allow camera access for this site and try again.");
        setActive(false);
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => {});
      tick();
    }

    function tick() {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !pausedRef.current) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        const scale = Math.min(1, 640 / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            const now = Date.now();
            const last = lastRef.current;
            if (code.data !== last.text || now - last.at > 4000) {
              lastRef.current = { text: code.data, at: now };
              onScanRef.current(code.data);
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }

    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, facing]);

  return (
    <div className="scanner">
      {active ? (
        <>
          <div className="scanner-frame">
            <video ref={videoRef} muted playsInline />
            <div className="scanner-target" />
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <div className="scanner-actions">
            <button className="btn-link" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>
              Switch camera
            </button>
            <button className="btn-link" onClick={() => setActive(false)}>
              Stop camera
            </button>
          </div>
        </>
      ) : (
        <button className="btn-primary btn-big" onClick={() => setActive(true)}>
          Start camera scanner
        </button>
      )}
      {error && <div className="alert">{error}</div>}
    </div>
  );
}
