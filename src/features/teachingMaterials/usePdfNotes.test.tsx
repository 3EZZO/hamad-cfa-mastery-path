import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialServiceError, type TeachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { EMPTY_PDF_NOTES, withPageNote, type PdfNotes } from "./pdfNotesModel";
import { usePdfNotes } from "./usePdfNotes";

const service = {
  loadPdfNotes: vi.fn(),
  savePdfNotes: vi.fn(),
};
let tree: ReactTestRenderer | undefined;
let hook: ReturnType<typeof usePdfNotes>;

function Harness({ versionId, rehearsal = false }: { versionId: string | null; rehearsal?: boolean }) {
  hook = usePdfNotes(service as unknown as TeachingMaterialService, "tutor-1", versionId, rehearsal);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  service.loadPdfNotes.mockResolvedValue({ notes: EMPTY_PDF_NOTES, revision: 0 });
  service.savePdfNotes.mockImplementation(async (_versionId: string, _notes: PdfNotes, expected: number) => expected + 1);
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("usePdfNotes", () => {
  it("loads, debounces a save and advances the revision", async () => {
    service.loadPdfNotes.mockResolvedValue({ notes: withPageNote(EMPTY_PDF_NOTES, 2, "old")!, revision: 3 });
    await act(async () => { tree = create(<Harness versionId="v1" />); });
    await settle();
    expect(hook.state).toBe("saved");
    await act(async () => hook.update(withPageNote(hook.notes, 2, "new")!));
    expect(hook.state).toBe("unsaved");
    await settle(1_000);
    expect(service.savePdfNotes).toHaveBeenCalledOnce();
    expect(service.savePdfNotes.mock.calls[0]!.slice(0, 3)).toEqual(["v1", { pages: [{ page: 2, text: "new" }], keyPages: [] }, 3]);
    expect(hook.state).toBe("saved");
    await act(async () => hook.update(withPageNote(hook.notes, 2, "newer")!));
    await settle(1_000);
    expect(service.savePdfNotes.mock.calls[1]![2]).toBe(4);
  });

  it("saves pending text to the PDF it was typed into when another PDF opens", async () => {
    await act(async () => { tree = create(<Harness versionId="v1" />); });
    await settle();
    await act(async () => hook.update(withPageNote(hook.notes, 1, "for v1")!));
    await act(async () => tree!.update(<Harness versionId="v2" />));
    await settle(2_000);
    expect(service.savePdfNotes).toHaveBeenCalledOnce();
    expect(service.savePdfNotes.mock.calls[0]![0]).toBe("v1");
    expect(hook.notes).toEqual(EMPTY_PDF_NOTES);
  });

  it("stops on a conflict and asks for a reload", async () => {
    service.savePdfNotes.mockRejectedValue(new MaterialServiceError("conflict"));
    await act(async () => { tree = create(<Harness versionId="v1" />); });
    await settle();
    await act(async () => hook.update(withPageNote(hook.notes, 1, "x")!));
    await settle(1_000);
    expect(hook.state).toBe("error");
    expect(hook.error).toMatch(/another device/);
  });

  it("keeps practice-mode notes in memory only", async () => {
    await act(async () => { tree = create(<Harness versionId="v1" rehearsal />); });
    await settle();
    expect(service.loadPdfNotes).not.toHaveBeenCalled();
    await act(async () => hook.update(withPageNote(hook.notes, 1, "practice")!));
    await settle(2_000);
    expect(service.savePdfNotes).not.toHaveBeenCalled();
    expect(hook.state).toBe("rehearsal");
  });
});
