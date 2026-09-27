import { describe, expect, it } from "vitest";
import { NAV_ITEMS, SHORTCUT_TAB_ORDER, shortcutTabs, TAB_IDS } from "./navigation";

describe("navigation shortcuts", () => {
  it("covers every tab exactly once", () => {
    expect([...SHORTCUT_TAB_ORDER].sort()).toEqual([...TAB_IDS].sort());
  });

  it("keeps today's Alt+digit targets for both roles", () => {
    const tutor = shortcutTabs(NAV_ITEMS.map((item) => item.id));
    expect(tutor).toEqual(["dashboard", "roadmap", "weekly", "sessions", "practice", "mastery", "moduleMocks", "mocks", "errors"]);
    const student = shortcutTabs(NAV_ITEMS.map((item) => item.id).filter((id) => !["live", "coach", "payments"].includes(id)));
    expect(student).toEqual(tutor);
  });
});
