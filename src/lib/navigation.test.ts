import { describe, expect, it } from "vitest";
import { resolveLegacyRoute } from "./hashRoute";
import { NAV_ITEMS, navConfig, navigationTarget, shortcutTabs, TAB_IDS, TUTOR_TAB_IDS, visibleNavItems, type TabId } from "./navigation";

const destinations = navConfig("destinations");
const classic = navConfig("classic");

describe("navigation layouts", () => {
  it("offers the four destinations, Notes and the tutor group", () => {
    expect(visibleNavItems(destinations, false).map((item) => item.label)).toEqual(["Today", "Plan", "Practice", "Progress", "Notes & Data"]);
    expect(visibleNavItems(destinations, true).map((item) => item.id)).toEqual([...destinations.tabs]);
    expect(destinations.mobilePrimary).toEqual(["dashboard", "plan", "practice", "progress"]);
  });

  it("keeps every classic tab reachable, and every retired tab lands somewhere in the new layout", () => {
    expect([...classic.tabs].sort()).toEqual([...TAB_IDS].sort());
    for (const id of TAB_IDS) {
      if (destinations.tabs.includes(id)) continue;
      const moved = resolveLegacyRoute({ tab: id, segment: "" });
      expect(moved, id).not.toBeNull();
      expect(destinations.tabs).toContain(moved!.tab as TabId);
    }
  });

  it("lists each tab once per layout and matches mobile to the sidebar", () => {
    for (const config of [destinations, classic]) {
      const sidebar = config.groups.flatMap((group) => group.ids);
      expect(new Set(sidebar).size).toBe(sidebar.length);
      expect([...config.mobilePrimary, ...config.mobileMore].sort()).toEqual([...sidebar].sort());
      expect([...config.shortcutOrder].sort()).toEqual([...sidebar].sort());
      sidebar.forEach((id) => expect(config.tabs).toContain(id));
    }
  });

  it("maps Alt+1… to the new destinations", () => {
    const student = shortcutTabs(destinations, visibleNavItems(destinations, false).map((item) => item.id));
    expect(student).toEqual(["dashboard", "plan", "practice", "progress", "notes"]);
    const tutor = shortcutTabs(destinations, visibleNavItems(destinations, true).map((item) => item.id));
    expect(tutor).toEqual(["dashboard", "plan", "practice", "progress", "notes", "live", "coach", "payments"]);
  });

  it("keeps the classic Alt+digit targets exactly as they were", () => {
    const tutor = shortcutTabs(classic, visibleNavItems(classic, true).map((item) => item.id));
    expect(tutor).toEqual(["dashboard", "roadmap", "weekly", "sessions", "practice", "mastery", "moduleMocks", "mocks", "errors"]);
    const student = shortcutTabs(classic, visibleNavItems(classic, false).map((item) => item.id));
    expect(student).toEqual(tutor);
  });

  it("finds retired screens from the palette by their old names", () => {
    const words = (id: TabId) => NAV_ITEMS.find((item) => item.id === id)!.keywords ?? [];
    expect(words("practice")).toEqual(expect.arrayContaining(["Mistake Review", "Module Tests"]));
    expect(words("progress")).toEqual(expect.arrayContaining(["Topic Progress", "Mock Results"]));
    expect(words("plan")).toEqual(expect.arrayContaining(["Study Plan", "This Week", "Session Notes"]));
  });

  it("sends in-app requests for retired screens to their section", () => {
    expect(navigationTarget(destinations, "weekly", 7)).toEqual({ tab: "plan", segment: "week-7" });
    expect(navigationTarget(destinations, "errors")).toEqual({ tab: "practice", segment: "mistakes" });
    expect(navigationTarget(destinations, "moduleMocks")).toEqual({ tab: "practice", segment: "tests" });
    expect(navigationTarget(destinations, "sessions")).toEqual({ tab: "plan", segment: "sessions" });
    expect(navigationTarget(destinations, "practice")).toEqual({ tab: "practice", segment: null });
    // Classic still opens the old tabs themselves.
    expect(navigationTarget(classic, "weekly", 7)).toEqual({ tab: "weekly", segment: null });
    expect(navigationTarget(classic, "errors")).toEqual({ tab: "errors", segment: null });
  });

  it("hides the tutor group from the student in both layouts", () => {
    for (const config of [destinations, classic]) {
      expect(visibleNavItems(config, false).some((item) => TUTOR_TAB_IDS.includes(item.id))).toBe(false);
    }
  });
});
