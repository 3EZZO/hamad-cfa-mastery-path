import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TeachingLibrary } from "./TeachingLibrary";
import { StageCard } from "./StageCard";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";

vi.mock("react-dom", async importOriginal => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  createPortal: (children: ReactNode) => children,
}));
vi.mock("./useDialogFocus", () => ({ useDialogFocus: vi.fn() }));
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", { body: {} });
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

describe("full teaching library", () => {
  it("searches all 120 decks, shows all three teaching panels, and closes without changing its source", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(2));
    const original = JSON.stringify(book);
    await act(async () => {
      tree = create(<TeachingLibrary stages={book.libraryStages!} />);
    });
    await act(async () => tree!.root.findByType("button").props.onClick());
    const select = tree!.root
      .findAllByType("select")
      .find(item => item.props["aria-label"] === "Choose a library deck")!;
    expect(select.findAllByType("option")).toHaveLength(120);
    await act(async () =>
      tree!.root
        .findByType("input")
        .props.onChange({ target: { value: "120" } })
    );
    const card = tree!.root.findByType(StageCard);
    expect(card.props.question.id).toBe("s2-card-120");
    expect(card.props.question).toMatchObject({
      explanation: "Synthetic concept 120.",
      prompt: "Fixture question?",
      answer: "Fixture answer.",
    });
    expect(
      tree!.root.findAll(node => node.props.className === "ls-command-grid")
    ).toHaveLength(1);
    const close = tree!.root
      .findAllByType("button")
      .find(button => button.children.includes(" Return to session"))!;
    await act(async () => close.props.onClick());
    expect(tree!.root.findAllByType(StageCard)).toHaveLength(0);
    expect(JSON.stringify(book)).toBe(original);
  });
});
