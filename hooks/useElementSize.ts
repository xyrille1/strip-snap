"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Tracks a ref'd element's content-box size via `ResizeObserver`, for
 * container-based fluid layouts (e.g. components/booth/StripEditor.tsx's
 * canvas, which needs its on-screen CSS size driven by available panel
 * space rather than fixed Tailwind breakpoints). Returns `undefined` until
 * the element is mounted and the first observation lands, so callers should
 * seed a sane default for that window rather than assume a size immediately.
 */
export function useElementSize<T extends HTMLElement>(): [RefObject<T>, ElementSize | undefined] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize | undefined>(undefined);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { inlineSize, blockSize } = entry.contentBoxSize?.[0] ?? {
        inlineSize: entry.contentRect.width,
        blockSize: entry.contentRect.height,
      };
      setSize({ width: inlineSize, height: blockSize });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
