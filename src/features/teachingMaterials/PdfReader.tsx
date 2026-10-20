import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Maximize, Minimize, PanelTopClose,
  PanelTopOpen, RefreshCw, ScanSearch, Search, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { TextLayer } from "pdfjs-dist";
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import { focusScroll, focusZoom, regionFromDrag, type FocusRegion } from "./exhibitFocus";
import { clampPage, clampZoom, type FitMode } from "./materialTypes";
import { openPdf, type OpenedPdf } from "./pdfEngine";
import {
  boundedOutputScale, cssScale, effectiveZoom, findMatches, nextZoomStep,
  normalizeSearch, readerKeyAction, type SearchMatch, type Size,
} from "./readerModel";
import "./teachingMaterials.css";

export interface ReaderView {
  page: number;
  zoom: number;
  fitMode: FitMode;
}

export interface ReaderErrorCopy {
  message: string;
  retryable: boolean;
}

export interface PdfReaderProps {
  active?: boolean;
  /** Changes whenever the document, account or authorization changes. */
  documentKey: string;
  title: string;
  subtitle?: string;
  variant: "tutor" | "student";
  loadBytes: (signal: AbortSignal) => Promise<Uint8Array>;
  initialView?: ReaderView | null;
  onViewChange?: (view: ReaderView) => void;
  /** Called once per load, after the first page rendered successfully. */
  onRendered?: () => void;
  onPresentationChange?: (presenting: boolean) => void;
  describeError?: (error: unknown) => ReaderErrorCopy;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  /** Content beside the page (tutor notes); hidden while presenting. */
  aside?: ReactNode;
  /** Content under the toolbar (coverage strip); hidden while presenting. */
  belowToolbar?: ReactNode;
  /** A page to show; a new request object jumps again to the same page. */
  jumpTo?: { page: number } | null;
  /** Focus the page once it first renders (keyboard flow across documents). */
  focusOnLoad?: boolean;
  /** Open already presenting in the full-window layout (continuing a presentation). */
  startPresenting?: boolean;
  /** Tools that stay in the toolbar while presenting (calculator, quick check). */
  tools?: ReactNode;
  /** Layer over the reader, inside it so it also shows in full screen. */
  overlay?: ReactNode;
  /** Zoom to an exhibit on a page; a new request object applies it again. */
  focusTo?: { page: number; region: FocusRegion } | null;
  onFocusChange?: (region: FocusRegion | null) => void;
}

type Presenting = "off" | "fullscreen" | "expanded";

const DEFAULT_ERROR: ReaderErrorCopy = { message: "The PDF could not be opened.", retryable: true };

export function PdfReader({
  active = true, documentKey, title, subtitle, variant, loadBytes, initialView, onViewChange, onRendered,
  onPresentationChange, describeError, toolbarStart, toolbarEnd, aside, belowToolbar, jumpTo,
  focusOnLoad = false, startPresenting = false, tools, overlay, focusTo, onFocusChange,
}: PdfReaderProps) {
  const rootRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageBoxRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadBytesRef = useRef(loadBytes);
  loadBytesRef.current = loadBytes;
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;
  const describeRef = useRef(describeError);
  describeRef.current = describeError;

  const [pdf, setPdf] = useState<OpenedPdf | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<ReaderErrorCopy>(DEFAULT_ERROR);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "ready" | "error">("idle");
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [page, setPage] = useState(initialView?.page ?? 1);
  const [pageInput, setPageInput] = useState(String(initialView?.page ?? 1));
  const [fitMode, setFitMode] = useState<FitMode>(initialView?.fitMode ?? "width");
  const [customZoom, setCustomZoom] = useState(clampZoom(initialView?.zoom ?? 1));
  const [pageSize, setPageSize] = useState<Size | null>(null);
  const [containerSize, setContainerSize] = useState<Size | null>(null);
  // Full screen needs a fresh user gesture, so a continued presentation uses the full-window layout.
  const [presenting, setPresenting] = useState<Presenting>(startPresenting ? "expanded" : "off");
  const focusOnLoadRef = useRef(focusOnLoad);
  const [toolsCollapsed, setToolsCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [searchStatus, setSearchStatus] = useState("");
  const pageTextsRef = useRef<string[] | null>(null);
  const searchedRef = useRef("");
  const renderedOnceRef = useRef(false);

  const pageCount = pdf?.pageCount ?? 0;
  const zoom = effectiveZoom(fitMode, customZoom, containerSize, pageSize);

  // ------------------------------------------------------------- loading
  useEffect(() => {
    let cancelled = false;
    let opened: OpenedPdf | null = null;
    const controller = new AbortController();
    renderedOnceRef.current = false;
    pageTextsRef.current = null;
    setPdf(null);
    setPageSize(null);
    setLoadState("loading");
    void (async () => {
      try {
        const bytes = await loadBytesRef.current(controller.signal);
        if (cancelled) return;
        opened = await openPdf(bytes);
        if (cancelled) {
          void opened.destroy();
          return;
        }
        setPage(current => clampPage(current, opened!.pageCount));
        setPdf(opened);
        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        setLoadError(describeRef.current?.(error) ?? DEFAULT_ERROR);
        setLoadState("error");
      }
    })();
    return () => {
      // Late responses must never repopulate a reader after a switch,
      // revoke or sign-out; the document and its worker are torn down.
      cancelled = true;
      controller.abort();
      if (opened) void opened.destroy();
    };
  }, [documentKey, loadAttempt]);

  // Release canvas memory on unmount.
  useEffect(() => () => {
    const canvas = canvasRef.current;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }, []);

  // ------------------------------------------------------ container size
  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (box) setContainerSize(current =>
        current && Math.abs(current.width - box.width) < 1 && Math.abs(current.height - box.height) < 1
          ? current : { width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loadState]);

  // ------------------------------------------------------- page geometry
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    void pdf.document.getPage(page).then(pdfPage => {
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      setPageSize(current => current && current.width === base.width && current.height === base.height
        ? current : { width: base.width, height: base.height });
    }, () => { if (!cancelled) setRenderState("error"); });
    return () => { cancelled = true; };
  }, [pdf, page]);

  // -------------------------------------------------------------- render
  const applyHighlights = useCallback(() => {
    const layer = textLayerRef.current;
    if (!layer) return;
    const needle = normalizeSearch(query);
    const current = matches[matchIndex];
    let seen = 0;
    layer.querySelectorAll<HTMLElement>("span").forEach(span => {
      span.classList.remove("is-match", "is-current");
      if (!searchOpen || needle.length < 2) return;
      if (normalizeSearch(span.textContent ?? "").includes(needle)) {
        span.classList.add("is-match");
        if (current && current.page === page && seen === current.occurrence) {
          span.classList.add("is-current");
          span.scrollIntoView?.({ block: "center", inline: "nearest" });
        }
        seen += 1;
      }
    });
  }, [matchIndex, matches, page, query, searchOpen]);

  useEffect(() => {
    if (!pdf || !pageSize || !containerSize) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let textLayer: TextLayer | null = null;
    setRenderState("rendering");
    void (async () => {
      const pdfPage = await pdf.document.getPage(page);
      if (cancelled) return;
      const scale = cssScale(zoom);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      const box = pageBoxRef.current;
      const layer = textLayerRef.current;
      if (!canvas || !box || !layer) return;
      const output = boundedOutputScale(viewport.width, viewport.height, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(viewport.width * output));
      canvas.height = Math.max(1, Math.floor(viewport.height * output));
      box.style.width = `${Math.floor(viewport.width)}px`;
      box.style.height = `${Math.floor(viewport.height)}px`;
      box.style.setProperty("--total-scale-factor", String(scale));
      renderTask = pdfPage.render({
        canvas,
        viewport,
        transform: output === 1 ? undefined : [output, 0, 0, output, 0, 0],
      });
      await renderTask.promise;
      if (cancelled) return;
      setRenderState("ready");
      if (!renderedOnceRef.current) {
        renderedOnceRef.current = true;
        if (focusOnLoadRef.current) viewportRef.current?.focus({ preventScroll: true });
        onRenderedRef.current?.();
      }
      layer.replaceChildren();
      textLayer = new TextLayer({ textContentSource: pdfPage.streamTextContent(), container: layer, viewport });
      await textLayer.render();
      if (!cancelled) applyHighlights();
    })().catch(error => {
      const name = typeof error === "object" && error !== null ? (error as { name?: string }).name : "";
      if (!cancelled && name !== "RenderingCancelledException" && name !== "AbortException") setRenderState("error");
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
    // applyHighlights runs after each render; highlight-only changes use the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-rendering the canvas for a new search highlight would flash the page.
  }, [pdf, page, zoom, pageSize, containerSize === null, renderAttempt]);

  useEffect(() => { if (renderState === "ready") applyHighlights(); }, [applyHighlights, renderState]);

  // ------------------------------------------------------ view reporting
  const viewRef = useRef(onViewChange);
  viewRef.current = onViewChange;
  useEffect(() => {
    if (!pdf) return;
    viewRef.current?.({ page, zoom: fitMode === "custom" ? customZoom : zoom, fitMode });
  }, [customZoom, fitMode, page, pdf, zoom]);

  useEffect(() => { setPageInput(String(page)); }, [page]);

  // ------------------------------------------------------------ actions
  const goTo = useCallback((next: number) => {
    if (!pageCount) return;
    setPage(clampPage(next, pageCount));
  }, [pageCount]);

  useEffect(() => {
    if (jumpTo) goTo(jumpTo.page);
  }, [goTo, jumpTo]);

  // ---------------------------------------------------------- exhibit focus
  const [selecting, setSelecting] = useState(false);
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [focusRegion, setFocusRegion] = useState<FocusRegion | null>(null);
  const beforeFocusRef = useRef<{ fitMode: FitMode; zoom: number } | null>(null);
  const focusChangeRef = useRef(onFocusChange);
  focusChangeRef.current = onFocusChange;

  const applyFocus = useCallback((region: FocusRegion) => {
    if (!pageSize || !containerSize) return;
    if (!beforeFocusRef.current) beforeFocusRef.current = { fitMode, zoom: customZoom };
    setFitMode("custom");
    setCustomZoom(focusZoom(region, containerSize, pageSize));
    setFocusRegion(region);
    focusChangeRef.current?.(region);
  }, [containerSize, customZoom, fitMode, pageSize]);

  const clearFocus = useCallback(() => {
    const before = beforeFocusRef.current;
    beforeFocusRef.current = null;
    if (before) {
      setFitMode(before.fitMode);
      setCustomZoom(before.zoom);
    }
    setFocusRegion(null);
    focusChangeRef.current?.(null);
  }, []);

  // A focus belongs to one page; turning the page shows the whole page again.
  const focusPageRef = useRef(page);
  useEffect(() => {
    if (focusPageRef.current !== page && focusRegion) clearFocus();
    focusPageRef.current = page;
  }, [clearFocus, focusRegion, page]);

  // Requested focus (a lesson-path stop) once its page is showing.
  const appliedFocusRef = useRef<object | null>(null);
  useEffect(() => {
    if (!focusTo || appliedFocusRef.current === focusTo || page !== focusTo.page || !pageSize || !containerSize) return;
    appliedFocusRef.current = focusTo;
    applyFocus(focusTo.region);
  }, [applyFocus, containerSize, focusTo, page, pageSize]);

  // Centre the exhibit after the zoomed page has rendered.
  useEffect(() => {
    if (!focusRegion || renderState !== "ready") return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const box = pageBoxRef.current;
      if (!viewport || !box) return;
      const target = focusScroll(focusRegion, { left: box.offsetLeft, top: box.offsetTop, width: box.offsetWidth, height: box.offsetHeight },
        { width: viewport.clientWidth, height: viewport.clientHeight });
      viewport.scrollTo({ ...target, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRegion, renderState, zoom]);

  const pointAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / Math.max(1, rect.width), y: (event.clientY - rect.top) / Math.max(1, rect.height) };
  };

  const changeZoom = useCallback((direction: 1 | -1) => {
    setCustomZoom(nextZoomStep(zoom, direction));
    setFitMode("custom");
  }, [zoom]);

  const commitPageInput = () => {
    const value = Number(pageInput);
    if (Number.isFinite(value) && value >= 1) goTo(value);
    else setPageInput(String(page));
  };

  const ensurePageTexts = useCallback(async (): Promise<string[]> => {
    if (pageTextsRef.current) return pageTextsRef.current;
    if (!pdf) return [];
    const texts: string[] = [];
    for (let index = 1; index <= pdf.pageCount; index += 1) {
      const content = await (await pdf.document.getPage(index)).getTextContent();
      texts.push(content.items.map(item => ("str" in item ? item.str : "")).join(" "));
    }
    pageTextsRef.current = texts;
    return texts;
  }, [pdf]);

  const runSearch = useCallback(async (value: string) => {
    searchedRef.current = normalizeSearch(value);
    if (normalizeSearch(value).length < 2) {
      setMatches([]);
      setMatchIndex(-1);
      setSearchStatus(value ? "Type at least two characters." : "");
      return;
    }
    const found = findMatches(await ensurePageTexts(), value);
    setMatches(found);
    if (!found.length) {
      setMatchIndex(-1);
      setSearchStatus("No matches in this document.");
      return;
    }
    const first = Math.max(0, found.findIndex(match => match.page >= page));
    setMatchIndex(first);
    goTo(found[first]!.page);
    setSearchStatus(`Match ${first + 1} of ${found.length} · page ${found[first]!.page}`);
  }, [ensurePageTexts, goTo, page]);

  const stepMatch = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    goTo(matches[next]!.page);
    setSearchStatus(`Match ${next + 1} of ${matches.length} · page ${matches[next]!.page}`);
  };

  const openSearch = () => {
    setSearchOpen(true);
    setToolsCollapsed(false);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const closeSearch = () => {
    searchedRef.current = "";
    setSearchOpen(false);
    setMatches([]);
    setMatchIndex(-1);
    setSearchStatus("");
    viewportRef.current?.focus({ preventScroll: true });
  };

  // ---------------------------------------------------------- presenting
  const presentingRef = useRef(presenting);
  presentingRef.current = presenting;
  useEffect(() => {
    if (active) return;
    if (document.fullscreenElement === rootRef.current) void document.exitFullscreen().catch(() => undefined);
    setPresenting("off");
  }, [active]);
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement && presentingRef.current === "fullscreen") setPresenting("off");
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const presentationRef = useRef(onPresentationChange);
  presentationRef.current = onPresentationChange;
  useEffect(() => { presentationRef.current?.(presenting !== "off"); }, [presenting]);
  // Leaving the reader must not leave the browser in full screen.
  useEffect(() => () => {
    if (presentingRef.current === "fullscreen" && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const togglePresentation = async () => {
    if (presenting === "fullscreen") {
      await document.exitFullscreen().catch(() => undefined);
      setPresenting("off");
      return;
    }
    if (presenting === "expanded") {
      setPresenting("off");
      return;
    }
    const element = rootRef.current;
    try {
      if (!element?.requestFullscreen) throw new Error("unsupported");
      await element.requestFullscreen();
      setPresenting("fullscreen");
    } catch {
      // Browsers may refuse full screen (iframes, iOS, policies); a fixed
      // in-app layout gives the same clean presentation.
      setPresenting("expanded");
    }
    viewportRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!active) return;
    if (event.key === "Escape") {
      if (searchOpen && event.target === searchInputRef.current) { event.preventDefault(); closeSearch(); return; }
      if (selecting) { event.preventDefault(); setSelecting(false); setDrag(null); return; }
      if (focusRegion) { event.preventDefault(); clearFocus(); return; }
      if (presenting === "expanded") { event.preventDefault(); setPresenting("off"); return; }
      return;
    }
    const action = readerKeyAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.kind === "page") goTo(page + action.delta);
    else if (action.kind === "first") goTo(1);
    else if (action.kind === "last") goTo(pageCount);
    else if (action.kind === "zoom") changeZoom(action.direction);
    else if (action.kind === "search") openSearch();
  };

  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const status = useMemo(() => {
    if (loadState === "loading") return "Opening the PDF…";
    if (loadState === "error") return loadError.message;
    return `Page ${page} of ${pageCount}`;
  }, [loadError.message, loadState, page, pageCount]);

  return (
    // Page/zoom keys bubble from the focusable page and toolbar only, so the
    // reader never acts on keys meant for another surface or a text field.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- keyboard delegation from focusable descendants
    <section
      ref={rootRef}
      className={`tm-reader tm-reader--${variant}${presenting !== "off" ? " is-presenting" : ""}${presenting === "expanded" ? " is-expanded" : ""}${toolsCollapsed ? " is-collapsed" : ""}`}
      aria-label={`${title} reader`}
      onKeyDown={onKeyDown}
    >
      <header className="tm-toolbar">
        {toolbarStart && presenting === "off" && <div className="tm-toolbar__start">{toolbarStart}</div>}
        <div className="tm-toolbar__title">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="tm-toolbar__group" role="group" aria-label="Pages">
          <button type="button" className="tm-icon" aria-label="Previous page" disabled={page <= 1 || !pdf} onClick={() => goTo(page - 1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <label className="tm-page-input">
            <span className="visually-hidden">Page number</span>
            <input
              inputMode="numeric"
              value={pageInput}
              disabled={!pdf}
              onChange={event => setPageInput(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              onBlur={commitPageInput}
              onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitPageInput(); } }}
            />
            <span aria-hidden="true">/ {pageCount || "–"}</span>
          </label>
          <button type="button" className="tm-icon" aria-label="Next page" disabled={!pdf || page >= pageCount} onClick={() => goTo(page + 1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        {!toolsCollapsed && (
          <>
            <div className="tm-toolbar__group" role="group" aria-label="Zoom">
              <button type="button" className="tm-icon" aria-label="Zoom out" disabled={!pdf} onClick={() => changeZoom(-1)}>
                <ZoomOut size={18} aria-hidden="true" />
              </button>
              <span className="tm-zoom" aria-live="polite">{zoomLabel}</span>
              <button type="button" className="tm-icon" aria-label="Zoom in" disabled={!pdf} onClick={() => changeZoom(1)}>
                <ZoomIn size={18} aria-hidden="true" />
              </button>
              <button type="button" className="tm-chip" aria-pressed={fitMode === "width"} disabled={!pdf} onClick={() => setFitMode("width")}>Fit width</button>
              <button type="button" className="tm-chip" aria-pressed={fitMode === "page"} disabled={!pdf} onClick={() => setFitMode("page")}>Fit page</button>
            </div>
            <button type="button" className="tm-icon" aria-label="Search in document" aria-pressed={searchOpen} disabled={!pdf} onClick={() => (searchOpen ? closeSearch() : openSearch())}>
              <Search size={18} aria-hidden="true" />
            </button>
          </>
        )}
        <button type="button" className="tm-icon" aria-pressed={selecting || !!focusRegion} disabled={!pdf}
          aria-label={focusRegion ? "Show the whole page" : selecting ? "Cancel exhibit focus" : "Focus an exhibit: drag a box on the page"}
          title="Focus an exhibit (drag a box). Esc shows the whole page."
          onClick={() => { if (focusRegion) clearFocus(); else { setSelecting(value => !value); setDrag(null); } }}>
          <ScanSearch size={18} aria-hidden="true" />
        </button>
        {tools && <div className="tm-toolbar__tools">{tools}</div>}
        <button type="button" className="tm-icon" aria-label={presenting === "off" ? "Present full screen" : "Exit presentation"} disabled={!pdf} onClick={() => void togglePresentation()}>
          {presenting === "off" ? <Maximize size={18} aria-hidden="true" /> : <Minimize size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="tm-icon" aria-label={toolsCollapsed ? "Show reader tools" : "Hide reader tools"} aria-expanded={!toolsCollapsed} onClick={() => setToolsCollapsed(value => !value)}>
          {toolsCollapsed ? <PanelTopOpen size={18} aria-hidden="true" /> : <PanelTopClose size={18} aria-hidden="true" />}
        </button>
        {/* Private notes and administration stay off the presented screen. */}
        {toolbarEnd && presenting === "off" && <div className="tm-toolbar__end">{toolbarEnd}</div>}
      </header>

      {searchOpen && !toolsCollapsed && (
        <div className="tm-search" role="search">
          <label>
            <span className="visually-hidden">Find in document</span>
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Find in this PDF"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (matches.length && normalizeSearch(query) === searchedRef.current) stepMatch(event.shiftKey ? -1 : 1);
                  else void runSearch(query);
                }
              }}
            />
          </label>
          <button type="button" className="tm-chip" onClick={() => void runSearch(query)}>Find</button>
          <button type="button" className="tm-icon" aria-label="Previous match" disabled={!matches.length} onClick={() => stepMatch(-1)}>
            <ChevronUp size={18} aria-hidden="true" />
          </button>
          <button type="button" className="tm-icon" aria-label="Next match" disabled={!matches.length} onClick={() => stepMatch(1)}>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <span className="tm-search__status" role="status" aria-live="polite">{searchStatus}</span>
          <button type="button" className="tm-icon" aria-label="Close search" onClick={closeSearch}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      {belowToolbar && presenting === "off" && belowToolbar}
      <div className="tm-reader__body">
        <div
          ref={viewportRef}
          className="tm-viewport"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the scrollable page takes focus so arrow keys turn pages
          tabIndex={0}
          aria-label={status}
        >
          {loadState === "loading" && (
            <div className="tm-state" role="status"><RefreshCw className="tm-spin" size={20} aria-hidden="true" /> Opening the PDF…</div>
          )}
          {loadState === "error" && (
            <div className="tm-state tm-state--error" role="alert">
              <p>{loadError.message}</p>
              {loadError.retryable && (
                <button type="button" className="tm-button" onClick={() => setLoadAttempt(value => value + 1)}>
                  <RefreshCw size={16} aria-hidden="true" /> Try again
                </button>
              )}
            </div>
          )}
          {loadState === "ready" && (
            <div className="tm-page" ref={pageBoxRef} role="document" aria-label={`Page ${page} of ${pageCount}`} aria-busy={renderState === "rendering"}>
              <canvas ref={canvasRef} aria-hidden="true" />
              {focusRegion && (
                <div className="tm-focus-frame" aria-hidden="true" style={{
                  left: `${focusRegion.x * 100}%`, top: `${focusRegion.y * 100}%`, width: `${focusRegion.w * 100}%`, height: `${focusRegion.h * 100}%`,
                }} />
              )}
              {selecting && (
                <div className="tm-select-layer" aria-hidden="true"
                  onPointerDown={event => {
                    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
                    const point = pointAt(event);
                    setDrag({ start: point, end: point });
                  }}
                  onPointerMove={event => { if (drag) setDrag({ start: drag.start, end: pointAt(event) }); }}
                  onPointerUp={event => {
                    if (!drag) return;
                    const region = regionFromDrag(drag.start, pointAt(event));
                    setDrag(null);
                    if (!region) return;
                    setSelecting(false);
                    applyFocus(region);
                    viewportRef.current?.focus({ preventScroll: true });
                  }}>
                  {drag && (
                    <div className="tm-select-box" style={{
                      left: `${Math.min(drag.start.x, drag.end.x) * 100}%`, top: `${Math.min(drag.start.y, drag.end.y) * 100}%`,
                      width: `${Math.abs(drag.end.x - drag.start.x) * 100}%`, height: `${Math.abs(drag.end.y - drag.start.y) * 100}%`,
                    }} />
                  )}
                </div>
              )}
              <div ref={textLayerRef} className="textLayer" />
              {renderState === "error" && (
                <div className="tm-state tm-state--error tm-state--overlay" role="alert">
                  <p>This page could not be rendered.</p>
                  <button type="button" className="tm-button" onClick={() => setRenderAttempt(value => value + 1)}>
                    <RefreshCw size={16} aria-hidden="true" /> Retry page
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {aside && presenting === "off" && <div className="tm-reader__aside">{aside}</div>}
      </div>
      {focusRegion && (
        <button type="button" className="tm-button tm-focus-exit" onClick={clearFocus}>
          <X size={16} aria-hidden="true" /> Whole page
        </button>
      )}
      {selecting && <p className="tm-select-hint" role="status">Drag a box around the exhibit to focus on it. Esc cancels.</p>}
      {overlay}
      <p className="visually-hidden" aria-live="polite">{loadState === "ready" ? `Page ${page} of ${pageCount}` : ""}</p>
    </section>
  );
}

export default PdfReader;
