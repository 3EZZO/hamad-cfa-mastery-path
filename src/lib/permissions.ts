export type ProjectRole = "tutor" | "student";

export interface ProjectCapabilities {
  canViewTracker: boolean;
  canExportData: boolean;
  canGenerateReports: boolean;
  canToggleTasks: boolean;
  canLogPractice: boolean;
  canManageErrors: boolean;
  canManageNotes: boolean;
  canManageTutorSessions: boolean;
  canEditMastery: boolean;
  canManageMocks: boolean;
  canRescheduleSessions: boolean;
  canManageDiagnostics: boolean;
  canImportData: boolean;
  canResetTracker: boolean;
  canUseLiveSession: boolean;
  canManageTutorPlaybooks: boolean;
}

const NO_CAPABILITIES: ProjectCapabilities = {
  canViewTracker: false,
  canExportData: false,
  canGenerateReports: false,
  canToggleTasks: false,
  canLogPractice: false,
  canManageErrors: false,
  canManageNotes: false,
  canManageTutorSessions: false,
  canEditMastery: false,
  canManageMocks: false,
  canRescheduleSessions: false,
  canManageDiagnostics: false,
  canImportData: false,
  canResetTracker: false,
  canUseLiveSession: false,
  canManageTutorPlaybooks: false,
};

const STUDENT_CAPABILITIES: ProjectCapabilities = {
  ...NO_CAPABILITIES,
  canViewTracker: true,
  canExportData: true,
  canGenerateReports: true,
  canToggleTasks: true,
  canLogPractice: true,
  canManageErrors: true,
  canManageNotes: true,
};

const TUTOR_CAPABILITIES: ProjectCapabilities = {
  canViewTracker: true,
  canExportData: true,
  canGenerateReports: true,
  canToggleTasks: true,
  canLogPractice: true,
  canManageErrors: true,
  canManageNotes: true,
  canManageTutorSessions: true,
  canEditMastery: true,
  canManageMocks: true,
  canRescheduleSessions: true,
  canManageDiagnostics: true,
  canImportData: true,
  canResetTracker: true,
  canUseLiveSession: true,
  canManageTutorPlaybooks: true,
};

export function capabilitiesForRole(
  role: ProjectRole | null | undefined,
): ProjectCapabilities {
  if (role === "tutor") return TUTOR_CAPABILITIES;
  if (role === "student") return STUDENT_CAPABILITIES;
  return NO_CAPABILITIES;
}
