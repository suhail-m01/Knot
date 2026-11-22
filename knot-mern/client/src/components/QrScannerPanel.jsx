import { useEffect, useId, useRef, useState } from 'react';

/**
 * Camera QR scanner for check-in (html5-qrcode). The first successful decode is passed to
 * onDecode and the camera stops, so one scan cannot trigger repeated check-ins.
 * Scanning needs camera permission and a secure origin; if it is unavailable, the manual code
 * field next to it still works.
 */
export function QrScannerPanel({ onDecode, disabled }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const scannerRef = useRef(null);
  const handledRef = useRef(false);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const regionId = `qr-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => () => {
    stop();
  }, []);

  async function stop() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        /* already stopped */
      }
    }
    setActive(false);
  }

  async function start() {
    setError(null);
    handledRef.current = false;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(regionId, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 220, height: 220 } },
        (text) => {
          if (handledRef.current) return;
          handledRef.current = true;
          onDecodeRef.current?.(text);
          stop();
        },
        () => {},
      );
      setActive(true);
    } catch {
      scannerRef.current = null;
      setError('The camera is not available. Allow camera access on a secure page, or type the code below.');
      setActive(false);
    }
  }

  return (
    <div className="stack">
      {!active ? (
        <button type="button" className="btn" onClick={start} disabled={disabled}>
          Scan a pass with the camera
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={stop}>
          Stop camera
        </button>
      )}
      <div id={regionId} className="scanner-region" aria-label="Camera preview" />
      {error && <p className="alert alert-warn small">{error}</p>}
    </div>
  );
}
