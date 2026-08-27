import { describe, expect, it } from "vitest";
import { capabilitiesForRole } from "./permissions";

describe("Hamad CFA Mastery role capabilities", () => {
  it("grants the tutor every tracker capability", () => {
    expect(Object.values(capabilitiesForRole("tutor")).every(Boolean)).toBe(true);
  });

  it("lets the student record their own study evidence without administering the plan", () => {
    expect(capabilitiesForRole("student")).toMatchObject({
      canViewTracker: true,
      canExportData: true,
      canGenerateReports: true,
      canToggleTasks: true,
      canLogPractice: true,
      canManageErrors: true,
      canManageNotes: true,
      canManageTutorSessions: false,
      canEditMastery: false,
      canManageMocks: false,
      canRescheduleSessions: false,
      canManageDiagnostics: false,
      canImportData: false,
      canResetTracker: false,
      canUseLiveSession: false,
      canManageTutorPlaybooks: false,
    });
  });

  it("grants no capabilities before an active member role is known", () => {
    expect(Object.values(capabilitiesForRole(null)).some(Boolean)).toBe(false);
  });
});
