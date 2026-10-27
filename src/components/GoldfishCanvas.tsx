import { useEffect, useRef } from 'react';
import { startAsciiGoldfish } from '../lib/asciiGoldfish';

export default function GoldfishCanvas({ contained = false }: { contained?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return startAsciiGoldfish(canvas);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={
        contained
          ? 'pointer-events-none absolute inset-0 z-0 h-full w-full bg-[#111214] touch-none'
          : 'pointer-events-none fixed inset-0 z-0 h-[100dvh] w-screen bg-[#111214] touch-none'
      }
    />
  );
}
