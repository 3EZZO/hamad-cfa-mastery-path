import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PdfReader } from "./PdfReader";

const pdf = vi.hoisted(() => ({ text: vi.fn() }));
vi.mock("./pdfEngine", () => ({ openPdf: async () => ({
  pageCount: 2, destroy: async () => {},
  document: { getPage: async () => ({ getViewport: () => ({ width: 612, height: 792 }), getTextContent: pdf.text }) },
}) }));
vi.mock("pdfjs-dist", () => ({ TextLayer: class {} }));
let tree: ReactTestRenderer;
const input = { documentKey: "synthetic", title: "Synthetic PDF", variant: "tutor" as const, loadBytes: async () => new Uint8Array(), initialView: { page: 1, zoom: 1, fitMode: "custom" as const } };
const button = (label: string) => tree.root.findByProps({ "aria-label": label });
const page = () => tree.root.findByProps({ inputMode: "numeric" }).props.value;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), setTimeout, requestAnimationFrame: vi.fn(), cancelAnimationFrame: vi.fn() });
  vi.stubGlobal("document", { fullscreenElement: null, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  pdf.text.mockResolvedValue({ items: [{ str: "Synthetic portfolio" }] });
});
afterEach(() => { if (tree) act(() => tree.unmount()); vi.unstubAllGlobals(); });
async function mount() {
  await act(async () => { tree = create(<PdfReader {...input} />); await Promise.resolve(); await Promise.resolve(); });
}

it("cancels search and unfinished exhibit selection, then restores reader controls after a check", async () => {
  await mount();
  act(() => button("Search in document").props.onClick());
  act(() => button("Focus an exhibit: drag a box on the page").props.onClick());
  expect(tree.root.findAllByProps({ role: "search" })).toHaveLength(1);
  expect(tree.root.findAllByProps({ className: "tm-select-hint" })).toHaveLength(1);
  act(() => tree.update(<PdfReader {...input} sidePanel={<div>Check</div>} />));
  expect(tree.root.findAllByProps({ role: "search" })).toHaveLength(0);
  expect(tree.root.findAllByProps({ className: "tm-select-hint" })).toHaveLength(0);
  for (const label of ["Next page", "Zoom in", "Search in document", "Focus an exhibit: drag a box on the page"]) expect(button(label).props.disabled).toBe(true);
  const root = tree.root.findByType("section");
  for (const key of ["ArrowRight", "+", "Escape", "/"]) act(() => root.props.onKeyDown({ key }));
  expect(page()).toBe("1");
  expect(tree.root.findByProps({ className: "tm-zoom" }).children.join("")).toBe("100%");
  act(() => tree.update(<PdfReader {...input} />));
  expect(button("Next page").props.disabled).toBe(false);
  expect(tree.root.findAllByProps({ role: "search" })).toHaveLength(0);
  expect(tree.root.findAllByProps({ className: "tm-select-hint" })).toHaveLength(0);
  act(() => button("Next page").props.onClick());
  expect(page()).toBe("2");
});

it("ignores a late search response instead of turning pages behind the check", async () => {
  let resolveText!: (text: { items: { str: string }[] }) => void;
  pdf.text.mockReturnValueOnce(new Promise(resolve => { resolveText = resolve; })).mockResolvedValue({ items: [{ str: "portfolio" }] });
  await mount();
  act(() => button("Search in document").props.onClick());
  act(() => tree.root.findByProps({ type: "search" }).props.onChange({ target: { value: "portfolio" } }));
  await act(async () => { tree.root.findAllByType("button").find(node => node.children.includes("Find"))!.props.onClick(); await Promise.resolve(); });
  act(() => tree.update(<PdfReader {...input} sidePanel={<div>Check</div>} panelModal />));
  await act(async () => { resolveText({ items: [{ str: "no match on first page" }] }); await Promise.resolve(); await Promise.resolve(); });
  expect(page()).toBe("1");
  expect(tree.root.findAllByProps({ role: "search" })).toHaveLength(0);
  expect(tree.root.findByProps({ className: "tm-viewport" }).props.inert).toBe(true);
  expect(tree.root.findByProps({ className: "tm-toolbar" }).props.inert).toBe(true);
});
