import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ getDocument: fake.getDocument, GlobalWorkerOptions: {} }));
import { openPdf } from "./pdfEngine";

beforeEach(() => { fake.getDocument.mockReset(); });

describe("PDF loading failures", () => {
  it("does not mislabel a malformed PDF as password-protected after cleanup", async () => {
    const task = { promise: Promise.reject({ name: "InvalidPDFException" }), destroyed: false,
      destroy: vi.fn(async () => { task.destroyed = true; }) };
    fake.getDocument.mockReturnValue(task);
    await expect(openPdf(new Uint8Array([37]))).rejects.toMatchObject({ kind: "invalid" });
    expect(task.destroy).toHaveBeenCalled();
  });

  it("rejects password-protected files rather than waiting for a prompt", async () => {
    let reject!: (error: unknown) => void;
    const task = { promise: new Promise((_, fail) => { reject = fail; }), destroyed: false,
      onPassword: undefined as undefined | (() => void),
      destroy: vi.fn(async () => { task.destroyed = true; reject(new Error("Loading aborted")); }) };
    fake.getDocument.mockReturnValue(task);
    const opening = openPdf(new Uint8Array([37]));
    const assertion = expect(opening).rejects.toMatchObject({ kind: "password" });
    task.onPassword!();
    await assertion;
  });
});
