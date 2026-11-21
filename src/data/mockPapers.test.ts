import { describe, expect, it } from "vitest";
import { MOCK_PAPERS, RETIRED_MOCK_PAPER_IDS, isMockPaperId, withoutRetiredPapers } from "./mockPapers";

describe("mock paper registry", () => {
  it("never registers a retired paper id again", () => {
    expect(RETIRED_MOCK_PAPER_IDS).toContain("qm-paper-02");
    for (const id of RETIRED_MOCK_PAPER_IDS) expect(isMockPaperId(id)).toBe(false);
    expect(new Set(MOCK_PAPERS.map(paper => paper.id)).size).toBe(MOCK_PAPERS.length);
  });

  it("drops a retired paper's stored draft from tutor lists and counts, and keeps everything else", () => {
    const stored = [
      { moduleId: "qm-paper-01", status: "published" },
      { moduleId: "qm-paper-02", status: "draft" },
      { moduleId: "m04-probability-trees", status: "draft" },
    ];
    expect(withoutRetiredPapers(stored).map(meta => meta.moduleId)).toEqual(["qm-paper-01", "m04-probability-trees"]);
  });
});
