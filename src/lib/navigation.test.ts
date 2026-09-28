import { describe, expect, it } from "vitest";
import { resolveLegacyRoute } from "./hashRoute";
import { NAV, NAV_ITEMS, navigationTarget, shortcutTabs, TAB_IDS, TUTOR_TAB_IDS, visibleNavItems, type TabId } from "./navigation";

describe("navigation", () => {
  it("leads with Module Tests, then Today, Plan, Practice, Progress, Notes and the tutor group", () => {
    expect(visibleNavItems(NAV, false).map((item) => item.label)).toEqual(["Module Tests", "Today", "Plan", "Practice", "Progress", "Notes & Data"]);
    expect(visibleNavItems(NAV, true).map((item) => item.id)).toEqual([...NAV.tabs]);
    expect(NAV.mobilePrimary).toEqual(["moduleMocks", "dashboard", "plan", "practice"]);
  });

  it("opens on Tests", () => {
    expect(NAV.home).toBe("moduleMocks");
    expect(NAV.tabs).toContain(NAV.home);
  });

  it("sends every retired tab to a section of an offered destination", () => {
    for (const id of TAB_IDS) {
      if (NAV.tabs.includes(id)) continue;
      const moved = resolveLegacyRoute({ tab: id, segment: "" });
      expect(moved, id).not.toBeNull();
      expect(NAV.tabs).toContain(moved!.tab as TabId);
    }
  });

  it("lists each tab once and matches mobile and shortcuts to the sidebar", () => {
    const sidebar = NAV.groups.flatMap((group) => group.ids);
    expect(new Set(sidebar).size).toBe(sidebar.length);
    expect([...NAV.mobilePrimary, ...NAV.mobileMore].sort()).toEqual([...sidebar].sort());
    expect([...NAV.shortcutOrder].sort()).toEqual([...sidebar].sort());
    sidebar.forEach((id) => expect(NAV.tabs).toContain(id));
  });

  it("maps Alt+1… to the destinations", () => {
    expect(shortcutTabs(NAV, visibleNavItems(NAV, false).map((item) => item.id)))
      .toEqual(["moduleMocks", "dashboard", "plan", "practice", "progress", "notes"]);
    expect(shortcutTabs(NAV, visibleNavItems(NAV, true).map((item) => item.id)))
      .toEqual(["moduleMocks", "dashboard", "plan", "practice", "progress", "notes", "live", "coach", "payments"]);
  });

  it("finds retired screens from the palette by their old names", () => {
    const words = (id: TabId) => NAV_ITEMS.find((item) => item.id === id)!.keywords ?? [];
    expect(words("practice")).toEqual(expect.arrayContaining(["Mistake Review"]));
    expect(words("moduleMocks")).toEqual(expect.arrayContaining(["Tests", "Results"]));
    expect(words("progress")).toEqual(expect.arrayContaining(["Topic Progress", "Mock Results"]));
    expect(words("plan")).toEqual(expect.arrayContaining(["Study Plan", "This Week", "Session Notes"]));
  });

  it("sends in-app requests for retired screens to their section", () => {
    expect(navigationTarget(NAV, "weekly", 7)).toEqual({ tab: "plan", segment: "week-7" });
    expect(navigationTarget(NAV, "errors")).toEqual({ tab: "practice", segment: "mistakes" });
    expect(navigationTarget(NAV, "sessions")).toEqual({ tab: "plan", segment: "sessions" });
    expect(navigationTarget(NAV, "mocks")).toEqual({ tab: "progress", segment: "mocks" });
    expect(navigationTarget(NAV, "moduleMocks")).toEqual({ tab: "moduleMocks", segment: null });
    expect(navigationTarget(NAV, "practice")).toEqual({ tab: "practice", segment: null });
  });

  it("hides the tutor group from the student", () => {
    expect(visibleNavItems(NAV, false).some((item) => TUTOR_TAB_IDS.includes(item.id))).toBe(false);
  });
});
