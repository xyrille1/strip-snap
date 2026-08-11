"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, FabricImage, PencilBrush, loadSVGFromString, util } from "fabric";
import type { FabricObject } from "fabric";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { computeStripLayout, type StripFormat, type StylePreset } from "@/lib/compositor";
import { inferStripFormat, recolorStripBase } from "@/lib/stripRecolor";
import { STICKERS } from "@/lib/stickers";

export interface StripEditorSavedStrip {
  id: string;
  sessionId: string;
  stylePreset: string;
  signedUrl: string;
  createdAt: string;
}

export interface StripEditorProps {
  sessionId: string;
  /** Base strip being edited — never mutated; saving always creates a brand-new strip row/Storage object. */
  stripId: string;
  stylePreset: string;
  onCancel: () => void;
  onSaved: (newStrip: StripEditorSavedStrip) => void;
}

interface StripResponse {
  id: string;
  sessionId: string;
  stylePreset: string;
  signedUrl: string;
  createdAt: string;
}

type Tool = "draw" | "sticker" | "color";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

/** Curated freehand-draw palette — this app's own brand hex values (app/globals.css's --booth-ink/--booth-rust/--booth-forest) plus a few bright doodle colors. */
const DRAW_COLORS = ["#2b2620", "#8c3a1d", "#33422e", "#ffffff", "#f2c14e", "#e2412c"];
const DRAW_WIDTHS = [3, 6, 10];

interface BackgroundSwatch {
  id: string;
  label: string;
  color: string;
}

/** "original" is special-cased below — it reloads the pristine base image rather than running a recolor pass, so its `color` here is display-only (matches lib/compositor.ts's own film-black). */
const BACKGROUND_SWATCHES: BackgroundSwatch[] = [
  { id: "original", label: "Original", color: "#141210" },
  { id: "cream", label: "Cream", color: "#f5f6f8" },
  { id: "white", label: "White", color: "#ffffff" },
  { id: "blush", label: "Blush", color: "#f2c9c2" },
  { id: "sky", label: "Sky", color: "#c9dcf2" },
  { id: "forest", label: "Forest", color: "#33422e" },
  { id: "rust", label: "Rust", color: "#8c3a1d" },
];

/**
 * Full-screen modal strip editor — draw freehand doodles, place/drag a
 * curated set of stickers, and recolor the strip's background/margin, then
 * save the result as a brand-new strip via the existing `POST /api/strips`
 * (the same save shape `app/session/[id]/generate/GenerateClient.tsx`
 * already uses). The original strip is never touched.
 *
 * Fabric v6 notes (verified against the installed package's own .d.ts,
 * since the plan's guesses about the exact API surface needed
 * confirmation): `canvas.backgroundImage` is a plain settable property, not
 * a `setBackgroundImage(...)` method — v6 dropped that method in favor of
 * direct assignment. `canvas.setDimensions(size, { backstoreOnly: true })`
 * updates only the true pixel resolution (what actually gets exported);
 * left alone, `setDimensions` ALSO writes inline `style.width`/`height` in
 * px on the canvas/wrapper elements, which would permanently pin the
 * on-screen box to that pixel size and defeat responsive CSS sizing. Since
 * fabric copies the lower canvas's `className` onto the upper (interaction)
 * canvas verbatim, applying Tailwind's `h-auto w-auto max-h-* max-w-*`
 * directly on the `<canvas>` element below sizes both layers identically —
 * the same "true resolution, CSS shrinks the box" technique
 * components/booth/StripPreview.tsx already uses on a plain canvas — and
 * fabric's own pointer-coordinate math already accounts for a CSS size that
 * differs from the backstore resolution, so drag/resize stays accurate at
 * any on-screen scale. The one wrinkle: fabric's constructor itself sets a
 * default 300x150 CSS size on the canvas/upper/wrapper elements before this
 * component gets a chance to set real dimensions, so those stale inline
 * styles are explicitly cleared once the real size is known.
 */
export default function StripEditor({
  sessionId,
  stripId,
  stylePreset,
  onCancel,
  onSaved,
}: StripEditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const originalImageElRef = useRef<HTMLImageElement | null>(null);
  const originalFabricImageRef = useRef<FabricImage | null>(null);
  const strokesRef = useRef<FabricObject[]>([]);
  const formatRef = useRef<StripFormat | null>(null);

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [tool, setTool] = useState<Tool>("draw");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [drawWidth, setDrawWidth] = useState(DRAW_WIDTHS[0]);
  const [hasSelection, setHasSelection] = useState(false);
  const [activeSwatchId, setActiveSwatchId] = useState("original");
  const [toolError, setToolError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Lock body scroll while the modal is mounted.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Create the Fabric canvas + load the base strip image, once per mount.
  useEffect(() => {
    const canvasEl = canvasElRef.current;
    if (!canvasEl) return;

    let cancelled = false;
    const canvas = new Canvas(canvasEl, { enableRetinaScaling: false, selection: true });
    fabricCanvasRef.current = canvas;
    canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = drawColor;
    canvas.freeDrawingBrush.width = drawWidth;

    canvas.on("path:created", (event) => {
      strokesRef.current.push(event.path);
    });
    canvas.on("object:removed", (event) => {
      strokesRef.current = strokesRef.current.filter((path) => path !== event.target);
    });
    canvas.on("selection:created", () => setHasSelection(true));
    canvas.on("selection:updated", () => setHasSelection(true));
    canvas.on("selection:cleared", () => setHasSelection(false));

    async function load() {
      try {
        const response = await fetch(`/api/strips/${stripId}`);
        if (!response.ok) throw new Error("Could not load your strip.");
        const strip = (await response.json()) as StripResponse;
        if (cancelled) return;

        const fabricImage = await FabricImage.fromURL(strip.signedUrl, {
          crossOrigin: "anonymous",
        });
        if (cancelled) return;

        const element = fabricImage.getElement();
        const naturalWidth =
          element instanceof HTMLImageElement ? element.naturalWidth : fabricImage.width;
        const naturalHeight =
          element instanceof HTMLImageElement ? element.naturalHeight : fabricImage.height;

        const format = inferStripFormat(naturalWidth, naturalHeight);
        if (!format) {
          throw new Error("This strip's image isn't a recognized size. Please try again.");
        }
        formatRef.current = format;

        const layout = computeStripLayout(format, stylePreset as StylePreset, 1);
        canvas.setDimensions(
          { width: layout.canvasWidth, height: layout.canvasHeight },
          { backstoreOnly: true }
        );
        // Clear the stale inline CSS size fabric wrote at construction time
        // (see this component's doc comment) so the Tailwind classes on the
        // <canvas> element below are free to size the visible box.
        canvas.lowerCanvasEl.style.width = "";
        canvas.lowerCanvasEl.style.height = "";
        canvas.upperCanvasEl.style.width = "";
        canvas.upperCanvasEl.style.height = "";
        canvas.wrapperEl.style.width = "";
        canvas.wrapperEl.style.height = "";

        fabricImage.set({
          left: 0,
          top: 0,
          originX: "left",
          originY: "top",
          selectable: false,
          evented: false,
        });
        canvas.backgroundImage = fabricImage;
        canvas.requestRenderAll();

        originalFabricImageRef.current = fabricImage;
        if (element instanceof HTMLImageElement) {
          originalImageElRef.current = element;
        }

        setLoadState({ status: "ready" });
      } catch (err) {
        if (cancelled) return;
        setLoadState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not load your strip.",
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
      fabricCanvasRef.current = null;
      void canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawColor/drawWidth are only read here as the brush's INITIAL values; later changes are applied by the effect below, not by re-running this whole setup.
  }, [stripId, stylePreset]);

  // Drawing mode is only active while the Draw panel is selected.
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = tool === "draw";
  }, [tool]);

  // Keep the brush in sync with the selected color/width.
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !canvas.freeDrawingBrush) return;
    canvas.freeDrawingBrush.color = drawColor;
    canvas.freeDrawingBrush.width = drawWidth;
  }, [drawColor, drawWidth]);

  // Delete/Backspace removes the current selection while the modal is open.
  useEffect(() => {
    if (!hasSelection) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      deleteSelection();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deleteSelection reads canvas off a ref and has no reactive dependencies of its own.
  }, [hasSelection]);

  function deleteSelection() {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length === 0) return;
    canvas.discardActiveObject();
    canvas.remove(...activeObjects);
    canvas.requestRenderAll();
  }

  function handleUndoStroke() {
    const canvas = fabricCanvasRef.current;
    const lastPath = strokesRef.current.pop();
    if (!canvas || !lastPath) return;
    canvas.remove(lastPath);
    canvas.requestRenderAll();
  }

  function handleClearStrokes() {
    const canvas = fabricCanvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return;
    canvas.remove(...strokesRef.current);
    strokesRef.current = [];
    canvas.requestRenderAll();
  }

  async function handleAddSticker(svgMarkup: string) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    setToolError(null);
    try {
      const { objects, options } = await loadSVGFromString(svgMarkup);
      const validObjects = objects.filter((object): object is FabricObject => object !== null);
      if (validObjects.length === 0) return;

      const sticker = util.groupSVGElements(validObjects, options);
      const targetSize = 64; // px, on this editor's 408px-wide canvas
      const intrinsic = Math.max(sticker.width || targetSize, sticker.height || targetSize);
      const scale = targetSize / intrinsic;

      sticker.set({
        left: canvas.getWidth() / 2,
        top: canvas.getHeight() / 2,
        originX: "center",
        originY: "center",
        scaleX: scale,
        scaleY: scale,
      });

      canvas.add(sticker);
      canvas.setActiveObject(sticker);
      canvas.requestRenderAll();
    } catch {
      setToolError("Could not add that sticker. Please try again.");
    }
  }

  async function handleSelectSwatch(swatch: BackgroundSwatch) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    setActiveSwatchId(swatch.id);
    setToolError(null);

    if (swatch.id === "original") {
      if (originalFabricImageRef.current) {
        canvas.backgroundImage = originalFabricImageRef.current;
        canvas.requestRenderAll();
      }
      return;
    }

    const imageEl = originalImageElRef.current;
    if (!imageEl) return;

    try {
      const dataUrl = recolorStripBase(imageEl, swatch.color);
      const recolored = await FabricImage.fromURL(dataUrl);
      recolored.set({
        left: 0,
        top: 0,
        originX: "left",
        originY: "top",
        selectable: false,
        evented: false,
      });
      canvas.backgroundImage = recolored;
      canvas.requestRenderAll();
    } catch (err) {
      setToolError(err instanceof Error ? err.message : "Could not recolor the strip.");
    }
  }

  async function handleSave() {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !formatRef.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 });
      const response = await fetch("/api/strips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          stylePreset,
          format: formatRef.current,
          imageDataUrl: dataUrl,
        }),
      });
      if (!response.ok) {
        throw new Error("Could not save your edited strip. Please try again.");
      }
      const newStrip = (await response.json()) as StripEditorSavedStrip;
      onSaved(newStrip);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save your edited strip. Please try again."
      );
      setSaving(false);
    }
  }

  const ready = loadState.status === "ready";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit your photo strip"
      className="fixed inset-0 z-50 flex flex-col bg-ink/80 print:hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b-booth border-structural-gray bg-panel px-4 py-3">
        <p className="font-display text-lg text-ink">Edit strip</p>
        <div className="flex gap-2">
          <Button variant="default" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!ready || saving}>
            {saving ? "Saving…" : "Save as new strip"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 overflow-auto px-4 py-4 sm:flex-row sm:items-start sm:justify-center">
        <div
          className="relative mx-auto w-fit rounded-booth border-booth border-structural-gray bg-panel p-2 shadow-booth"
          style={{ touchAction: "none" }}
        >
          <canvas
            ref={canvasElRef}
            className="block h-auto max-h-[55dvh] w-auto max-w-[16rem] sm:max-h-[75dvh] sm:max-w-[18rem]"
          />
          {loadState.status === "loading" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-panel/90">
              <p className="font-sans text-sm text-ink-secondary">Loading your strip…</p>
            </div>
          ) : null}
          {loadState.status === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel/95 p-4 text-center">
              <Badge variant="warning">{loadState.message}</Badge>
            </div>
          ) : null}
        </div>

        <div className="w-full max-w-sm shrink-0 rounded-booth border-booth border-structural-gray bg-panel p-4 shadow-booth">
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Editor tools">
            {(
              [
                { id: "draw", label: "Draw" },
                { id: "sticker", label: "Stickers" },
                { id: "color", label: "Color" },
              ] as const
            ).map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tool === entry.id}
                onClick={() => setTool(entry.id)}
                className={[
                  "rounded-full border-booth px-3 py-2 font-sans text-sm font-medium transition-colors",
                  tool === entry.id
                    ? "border-ink bg-ink text-cream"
                    : "border-ink bg-transparent text-ink hover:bg-ink/10",
                ].join(" ")}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tool === "draw" ? (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-sans text-xs font-semibold text-ink-secondary">Color</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {DRAW_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Draw color ${color}`}
                        aria-pressed={drawColor === color}
                        onClick={() => setDrawColor(color)}
                        className={[
                          "h-8 w-8 rounded-full border-2",
                          drawColor === color ? "border-forest" : "border-structural-gray",
                        ].join(" ")}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-sans text-xs font-semibold text-ink-secondary">
                    Brush size
                  </p>
                  <div className="mt-2 flex gap-2">
                    {DRAW_WIDTHS.map((width) => (
                      <button
                        key={width}
                        type="button"
                        aria-label={`Brush size ${width}px`}
                        aria-pressed={drawWidth === width}
                        onClick={() => setDrawWidth(width)}
                        className={[
                          "flex h-9 w-9 items-center justify-center rounded-full border-booth-inner font-sans text-xs",
                          drawWidth === width
                            ? "border-forest bg-forest text-cream"
                            : "border-structural-gray bg-transparent text-ink",
                        ].join(" ")}
                      >
                        {width}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="default" onClick={handleUndoStroke}>
                    Undo
                  </Button>
                  <Button variant="default" onClick={handleClearStrokes}>
                    Clear
                  </Button>
                </div>
              </div>
            ) : null}

            {tool === "sticker" ? (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-sans text-xs font-semibold text-ink-secondary">Add a sticker</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STICKERS.map((sticker) => (
                      <button
                        key={sticker.id}
                        type="button"
                        aria-label={`Add ${sticker.label} sticker`}
                        onClick={() => void handleAddSticker(sticker.svgMarkup)}
                        className="flex h-11 w-11 items-center justify-center rounded-booth border-booth-inner border-structural-gray bg-cream [&>svg]:block [&>svg]:h-6 [&>svg]:w-6"
                        dangerouslySetInnerHTML={{ __html: sticker.svgMarkup }}
                      />
                    ))}
                  </div>
                </div>

                {hasSelection ? (
                  <Button variant="default" onClick={deleteSelection}>
                    Delete
                  </Button>
                ) : (
                  <p className="font-sans text-xs text-ink-secondary">
                    Tap a sticker to add it, then drag/resize/rotate it on the strip.
                  </p>
                )}
              </div>
            ) : null}

            {tool === "color" ? (
              <div className="flex flex-col gap-4">
                <p className="font-sans text-xs font-semibold text-ink-secondary">
                  Background color
                </p>
                <div className="flex flex-wrap gap-2">
                  {BACKGROUND_SWATCHES.map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      aria-label={swatch.label}
                      aria-pressed={activeSwatchId === swatch.id}
                      onClick={() => void handleSelectSwatch(swatch)}
                      title={swatch.label}
                      className={[
                        "h-8 w-8 rounded-full border-2",
                        activeSwatchId === swatch.id ? "border-forest" : "border-structural-gray",
                      ].join(" ")}
                      style={{ backgroundColor: swatch.color }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {toolError ? (
            <p className="mt-3 font-sans text-xs text-rust-body" role="alert">
              {toolError}
            </p>
          ) : null}
          {saveError ? (
            <p className="mt-3 font-sans text-xs text-rust-body" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
