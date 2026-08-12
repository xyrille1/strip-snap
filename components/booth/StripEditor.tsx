"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, FabricImage, PencilBrush, loadSVGFromString, util } from "fabric";
import type { FabricObject } from "fabric";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { computeStripLayout, type StripFormat, type StylePreset } from "@/lib/compositor";
import { inferStripFormat, recolorStripBase } from "@/lib/stripRecolor";
import { STICKERS } from "@/lib/stickers";
import { useElementSize } from "@/hooks/useElementSize";

/**
 * Fluid on-screen sizing for the Fabric canvas below (all px, in CSS/display
 * units — never touches the canvas's true pixel resolution, which stays
 * whatever `computeStripLayout` says regardless of viewport). The content
 * row's own size is a real, container-independent measurement (it's a flex
 * child of this modal's `fixed inset-0` column, so its size comes from the
 * viewport, not from its children) — see the sizing effect below for how the
 * budget is split between this canvas and the fixed-width tools panel.
 */
const MAX_CANVAS_DISPLAY_WIDTH = 520;
/** The canvas panel's own padding (`p-2`) + border (`border-booth`), eaten from available space on both axes. */
const CANVAS_PANEL_CHROME = 24;
/** Tools panel's `max-w-sm` footprint (384px) + the row's `gap-4` (16px), reserved out of row width when panels sit side-by-side at `sm:` and up. */
const TOOLS_PANEL_ROW_ALLOWANCE = 400;
/** Mirrors the old fixed `55dvh` cap, but relative to the row's real available height (already excludes the header) rather than the raw viewport. */
const MOBILE_CANVAS_HEIGHT_SHARE = 0.55;
/** Tailwind's `sm:` breakpoint — the same threshold the content row switches from stacked to side-by-side at. */
const ROW_LAYOUT_MIN_WIDTH = 640;

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
/** Continuous brush-width range (px), replacing the old 3/6/10 fixed presets. */
const DRAW_WIDTH_MIN = 2;
const DRAW_WIDTH_MAX = 16;

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
 * updates only the true pixel resolution (what actually gets exported, per
 * `lib/compositor.ts`'s `computeStripLayout` — this never changes with
 * viewport size); left alone, `setDimensions` ALSO writes inline
 * `style.width`/`height` in px on the canvas/wrapper elements, which would
 * permanently pin the on-screen box to that pixel size and defeat responsive
 * sizing. Fabric's own pointer-coordinate math already accounts for a CSS
 * size that differs from the backstore resolution, so drag/resize stays
 * accurate at any on-screen scale — the same "true resolution, CSS shrinks
 * the box" technique components/booth/StripPreview.tsx uses on a plain
 * canvas, extended here to be fluid: a `hooks/useElementSize` observer on
 * the content row (an independently-sized flex child of this modal, not
 * driven by its own content — see the sizing effect below) computes a
 * contain-fit CSS box from real available space each resize, rather than
 * stepping through two fixed Tailwind breakpoints. Fabric only auto-copies
 * the lower canvas's `className` onto the upper (interaction) canvas, not
 * inline style, so the sizing effect explicitly sets width/height on all
 * three fabric-managed elements (lower + upper canvas + wrapper) itself to
 * keep the interaction layer aligned with the visible one. The one wrinkle:
 * fabric's constructor itself sets a default 300x150 CSS size on the
 * canvas/upper/wrapper elements before this component gets a chance to set
 * real dimensions, so those stale inline styles are explicitly cleared once
 * the real (backstore) size is known, ahead of the sizing effect taking
 * over display sizing.
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
  const [rowRef, rowSize] = useElementSize<HTMLDivElement>();

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [canvasAspect, setCanvasAspect] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>("draw");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [drawWidth, setDrawWidth] = useState(3);
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
    const canvas = new Canvas(canvasEl, { enableRetinaScaling: true, selection: true });
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
        // Drives the fluid-sizing effect below — display size is computed
        // from this aspect ratio plus the content row's real available
        // space, never from `layout.canvasWidth/canvasHeight` directly.
        setCanvasAspect(layout.canvasWidth / layout.canvasHeight);

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

  // Drives the on-screen (CSS) canvas size continuously from the content
  // row's actual available space, replacing the old two-breakpoint
  // max-h/max-w scheme. The row's own size is independent of its children
  // (it's a flex child of this modal's `fixed inset-0` column, so its size
  // comes from the viewport minus the header — not from what's inside it),
  // so this isn't circular. `layout.canvasWidth/canvasHeight` (the export
  // resolution) never changes here — only the CSS box does. Sets width/
  // height/maxWidth/maxHeight on all three fabric-managed elements (lower +
  // upper canvas + wrapper), not just the ref'd `<canvas>`, because fabric
  // only auto-copies `className` from lower to upper (see this file's doc
  // comment) — inline style isn't included in that, so the interaction
  // (upper) layer would otherwise drift out of alignment with the visible
  // (lower) layer.
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !canvasAspect || !rowSize) return;

    const isRowLayout = typeof window !== "undefined" && window.innerWidth >= ROW_LAYOUT_MIN_WIDTH;
    const availableWidth = Math.max(
      isRowLayout
        ? rowSize.width - TOOLS_PANEL_ROW_ALLOWANCE - CANVAS_PANEL_CHROME
        : rowSize.width - CANVAS_PANEL_CHROME,
      0
    );
    const availableHeight = Math.max(
      isRowLayout
        ? rowSize.height - CANVAS_PANEL_CHROME
        : rowSize.height * MOBILE_CANVAS_HEIGHT_SHARE - CANVAS_PANEL_CHROME,
      0
    );

    // Contain-fit within available space — no MIN floor here: for a tall
    // format (more shots), height legitimately becomes the binding
    // constraint, and forcing a wider-than-fits width would just push the
    // canvas past `availableHeight` into overflow instead of shrinking to
    // stay fully visible. `1` is only a guard against a literal 0/negative
    // width (e.g. a still-settling first layout pass), not a UX floor.
    const fitWidth = Math.min(availableWidth, availableHeight * canvasAspect);
    const displayWidth = Math.min(Math.max(fitWidth, 1), MAX_CANVAS_DISPLAY_WIDTH);
    const displayHeight = displayWidth / canvasAspect;

    for (const el of [canvas.lowerCanvasEl, canvas.upperCanvasEl, canvas.wrapperEl]) {
      el.style.width = `${displayWidth}px`;
      el.style.height = `${displayHeight}px`;
      // Neutralizes the <canvas> element's seed max-h/max-w classes (JSX
      // below) once real measurements are available, so they only ever act
      // as a pre-measurement placeholder, never a competing constraint.
      el.style.maxWidth = "none";
      el.style.maxHeight = "none";
    }
  }, [rowSize, canvasAspect]);

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
      // Canvas backstore units (fixed regardless of viewport — see
      // lib/compositor.ts), not CSS/display pixels, so this stays the same
      // proportional size on-screen at any display scale.
      const targetSize = 64;
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
      style={{
        // This modal is `fixed inset-0`, so it escapes the safe-area padding
        // app/globals.css puts on `body` — pad it directly here instead.
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
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

      <div
        ref={rowRef}
        className="flex flex-1 flex-col items-center gap-4 overflow-auto px-4 py-4 sm:flex-row sm:items-start sm:justify-center"
      >
        <div
          className="relative mx-auto w-fit rounded-booth border-booth border-structural-gray bg-panel p-2 shadow-booth"
          style={{ touchAction: "none" }}
        >
          <canvas
            ref={canvasElRef}
            // Pre-measurement seed only — once the row is measured and the
            // strip's aspect ratio is known, the sizing effect above takes
            // over via inline style (and neutralizes these caps) so the
            // canvas can grow past 18rem on tablet/laptop/desktop.
            className="block h-auto max-h-[55dvh] w-auto max-w-[18rem]"
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
                  <div className="flex items-center justify-between">
                    <p className="font-sans text-xs font-semibold text-ink-secondary">
                      Brush size
                    </p>
                    <p className="font-sans text-xs text-ink-secondary">{drawWidth}px</p>
                  </div>
                  <input
                    type="range"
                    aria-label="Brush size"
                    min={DRAW_WIDTH_MIN}
                    max={DRAW_WIDTH_MAX}
                    step={1}
                    value={drawWidth}
                    onChange={(event) => setDrawWidth(Number(event.target.value))}
                    className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full border-booth-inner border-structural-gray bg-transparent accent-forest"
                  />
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
                        disabled={!ready}
                        className="flex h-11 w-11 items-center justify-center rounded-booth border-booth-inner border-structural-gray bg-cream disabled:opacity-40 [&>svg]:block [&>svg]:h-6 [&>svg]:w-6"
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
                      disabled={!ready}
                      className={[
                        "h-8 w-8 rounded-full border-2 disabled:opacity-40",
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
