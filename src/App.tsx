import { Box, CalendarPlus, ChevronDown, ChevronRight, CircleAlert, CircleCheckBig, Command, Calculator, Clock3, Download, LogOut, Menu, Moon, MoreHorizontal, PlayCircle, RotateCcw, ShieldCheck, Sparkles, Sun, Upload, UserCog, X } from "lucide-react";
import { type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getPlanTasks, PLAN } from "./data/plan";
import { daysUntilExam, getProgramWeek, TOTAL_WEEKS, todayDateOnly } from "./lib/dates";
import { downloadBackup, readBackup } from "./lib/storage";
import { downloadProject202Calendar } from "./lib/calendarExport";
import { addPracticeMistake, bridgedQuestionIds } from "./lib/practiceMistakeBridge";
import { getTaskStatus } from "./lib/taskStatus";
import { useTrackerSync } from "./hooks/useTrackerSync";
import { useHashTab } from "./hooks/useHashTab";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Crest } from "./components/Crest";
import { readDepthPreference, setDepthPreference, type DepthPreference } from "./lib/depthMotion";
import CalendarExportDialog from "./components/CalendarExportDialog";
import { ThemeProvider, ThemeToggle, useTheme } from "./components/ThemeToggle";
import { CommandPalette } from "./components/CommandPalette";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { rovingTabIndex, useRovingNav } from "./hooks/useRovingNav";
import { useHashSegment } from "./hooks/useHashTab";
import { useWeekMirror } from "./hooks/useWeekMirror";
import { buildHash, readSegment, writeSegment } from "./lib/hashRoute";
import { setShellBusy, useShellBusy } from "./lib/shellBusy";
import { PRACTICE_INTENTS, practiceModuleSegment, type PracticeIntent } from "./lib/practiceIntents";
import { testsForWeek } from "./lib/weekTests";
import { TUTOR_SECTIONS, parseTutorSection, type TutorSection } from "./lib/tutorConsole";
import type { PaletteCommand } from "./lib/commandPalette";
import { AppDialogProvider, useAppDialog } from "./components/AppDialog";
import { SyncRecoveryNotice } from "./components/SyncRecoveryNotice";
import { useDialogFocus } from "./features/liveSession/useDialogFocus";
import { MockReminderHost, ModuleMockTests, PaymentsHub, PracticeCoach, ReceiptVerificationScreen, TutorSessionWorkspace, warmUpPracticeView, warmUpTutorViews } from "./lazyViews";
import { ViewSkeleton } from "./components/ViewSkeleton";
import type { CalendarExportPreferences } from "./lib/calendarExport";
import { NAV, TAB_COPY, TUTOR_TAB_IDS, navItem, navigationTarget, shortcutTabs, visibleNavItems } from "./lib/navigation";
import type { TabId } from "./lib/navigation";
import { EmptyState, PageHeading, cx, makeId, syncPresentation } from "./views/shared";
import type { Notify } from "./views/shared";
import { CloudAccessDeniedScreen, CloudConfigurationScreen, CloudLoadingScreen, SignInScreen } from "./auth/screens";
import { DashboardView } from "./views/DashboardView";
import { RoadmapView } from "./views/RoadmapView";
import { WeeklyView } from "./views/WeeklyView";
import { SessionLogView } from "./views/SessionLogView";
import { PracticeLogView } from "./views/PracticeLogView";
import { ProgressView, parseProgressSection } from "./views/ProgressView";
import { PracticeHubView, practiceSectionFor } from "./views/PracticeHubView";
import { PlanView, parsePlanSegment, planSegment } from "./views/PlanView";
import { isRetestDue } from "./lib/retests";
import { ErrorVaultView } from "./views/ErrorVaultView";
import { TutorAdminView } from "./views/TutorAdminView";
import { NotesView } from "./views/NotesView";

function WorkspaceActions({
  email,
  role,
  children,
}: {
  email: string | null;
  role: "tutor" | "student" | null;
  children: ReactNode;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!disclosure.current?.contains(event.target as Node)) {
        disclosure.current?.removeAttribute("open");
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !disclosure.current?.open) return;
      disclosure.current.open = false;
      disclosure.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <details className="workspace-actions" ref={disclosure}>
      <summary aria-label="Workspace tools and account">
        <MoreHorizontal size={19} />
        <span>Tools</span>
        <ChevronDown size={13} />
      </summary>
      <div
        className="workspace-actions-panel"
        role="presentation"
        onClick={event => {
          if ((event.target as HTMLElement).closest("button")) {
            disclosure.current?.removeAttribute("open");
          }
        }}
      >
        <div className="workspace-account">
          <span>
            <ShieldCheck size={15} />{" "}
            {role === "tutor" ? "Tutor workspace" : "Student workspace"}
          </span>
          <strong>{email ?? "Approved account"}</strong>
        </div>
        {children}
      </div>
    </details>
  );
}

function App() {
  const rawProgramWeek = getProgramWeek();
  const initialWeek = rawProgramWeek < 1 ? 1 : Math.min(rawProgramWeek, TOTAL_WEEKS);
  // The module tests that belong to this study-plan week (none outside the plan).
  const thisWeekTests = { week: rawProgramWeek, moduleIds: testsForWeek(rawProgramWeek).map((module) => module.id) };
  const nav = NAV;
  const [activeTab, setActiveTab] = useHashTab<TabId>(nav.tabs, nav.home, {
    title: (tab) => `${TAB_COPY[tab].title} · Hamad CFA Mastery`,
  });
  // Plan › This week mirrors its week to `#plan/week-N` (see PlanView) so
  // reload, back/forward and pasted links land on the same week; a deep link
  // wins over the programme week. Old `#weekly/week-N` links are rewritten
  // to it before this reads the hash.
  const [planSegmentValue, setPlanSegment] = useHashSegment("plan", activeTab);
  const planRoute = parsePlanSegment(planSegmentValue);
  const [selectedWeek, setSelectedWeek] = useState(
    () => (parsePlanSegment(readSegment("plan")).section === "week" ? parsePlanSegment(readSegment("plan")).week : null)
      ?? initialWeek,
  );
  useEffect(() => {
    if (planRoute.section === "week" && planRoute.week) setSelectedWeek(planRoute.week);
  }, [planRoute.section, planRoute.week]);
  useWeekMirror({
    active: activeTab === "plan",
    readLinkedWeek: () => {
      const route = parsePlanSegment(readSegment("plan"));
      return route.section === "week" ? route.week : undefined;
    },
    writeWeek: (week) => setPlanSegment(planSegment("week", week)),
    selectedWeek,
    setSelectedWeek,
  });
  // Practice intents travel as `#practice/<intent>`; the coach clears the
  // segment once it has acted, so the URL never replays an action.
  const [practiceSegment, setPracticeSegment] = useHashSegment("practice", activeTab);
  // `#moduleMocks/<moduleId>` opens that module's start screen (tutor reminders
  // link there); the view clears the segment once it has acted.
  const [moduleMocksSegment, setModuleMocksSegment] = useHashSegment("moduleMocks", activeTab);
  const clearModuleMocksSegment = useCallback(() => setModuleMocksSegment(""), [setModuleMocksSegment]);
  const openModuleMock = useCallback((moduleId: string) => {
    window.location.hash = buildHash("moduleMocks", moduleId);
  }, []);
  // `#progress/<section>`: Topics (heatmap), Module tests or Mocks.
  const [progressSegment, setProgressSegment] = useHashSegment("progress", activeTab);
  const [coachSegment, setCoachSegment] = useHashSegment("coach", activeTab);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [depthPreference, setDepthPreferenceState] = useState<DepthPreference>(readDepthPreference);
  const toggleDepth = () => {
    const next = depthPreference === "on" ? "off" : "on";
    setDepthPreference(next);
    setDepthPreferenceState(next);
  };
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const mobileDialogRef = useRef<HTMLElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(mobileMoreOpen, mobileDialogRef, mobileCloseRef, () => setMobileMoreOpen(false));
  // Roving tabindex: Tab lands on the active section, arrow keys browse the rest.
  const sidebarKeyDown = useRovingNav("vertical");
  const mobileNavKeyDown = useRovingNav("horizontal");
  // Back/forward can change the tab without going through navigate().
  useEffect(() => setMobileMoreOpen(false), [activeTab]);
  const {
    tracker,
    updateTracker,
    cloudConfigured,
    missingConfiguration,
    authReady,
    authBusy,
    authError,
    user,
    memberReady,
    role,
    capabilities,
    accessDenied,
    trackerReady,
    syncStatus,
    syncError,
    signInWithGoogle,
    signInWithPassword,
    signOut,
    replaceTrackerAuthoritatively,
    authoritativeReplaceBusy,
    retrySync,
    privateTutorNotes,
    privateNotesReady,
    privateNotesBusy,
    privateNotesError,
    updatePrivateTutorNotes,
  } = useTrackerSync();
  const dialog = useAppDialog(`${user?.uid ?? "signed-out"}:${role}:${activeTab}`);
  const { theme, toggle: toggleTheme } = useTheme();
  const isLiveShell = activeTab === "live" && capabilities.canUseLiveSession;
  // A module mock test covers the whole app; its shortcuts must not reach the shell.
  const mockTestRunning = useShellBusy() === "mock";
  // Session Mode is the classroom: an app update must never reload it.
  useEffect(() => {
    if (!isLiveShell) return;
    setShellBusy("session");
    return () => setShellBusy(null);
  }, [isLiveShell]);
  const visibleNav = visibleNavItems(nav, capabilities.canUseLiveSession);
  const shortcutIds = shortcutTabs(nav, visibleNav.map((item) => item.id));
  useGlobalShortcuts({
    onTogglePalette: () => setPaletteOpen((open) => !open),
    tabs: isLiveShell ? [] : shortcutIds.map((id) => () => setActiveTab(id)),
    paletteOpen,
    helpKey: !isLiveShell,
    enabled: Boolean(user && trackerReady) && !mockTestRunning,
  });
  const shellReady = Boolean(user && trackerReady);
  useEffect(() => {
    // Warm the chunks this account opens most after the shell paints, so
    // nobody waits on them; the rest load on first open.
    if (!shellReady) return;
    if (capabilities.canUseLiveSession) warmUpTutorViews();
    else warmUpPracticeView();
  }, [shellReady, capabilities.canUseLiveSession]);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "warning";
  } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!cloudConfigured) {
    return <CloudConfigurationScreen missingKeys={missingConfiguration} />;
  }

  if (!authReady) {
    return <CloudLoadingScreen />;
  }

  if (!user) {
    return (
      <SignInScreen
        busy={authBusy}
        error={authError}
        onGoogle={signInWithGoogle}
        onPassword={signInWithPassword}
      />
    );
  }

  if (!memberReady) {
    return <CloudLoadingScreen />;
  }

  if (accessDenied) {
    return (
      <CloudAccessDeniedScreen
        email={user.email}
        error={syncError}
        onSignOut={signOut}
      />
    );
  }

  if (!trackerReady) {
    return <CloudLoadingScreen />;
  }

  const syncCopy = syncPresentation(syncStatus);
  const SyncIcon = syncCopy.icon;

  const notify: Notify = (message, tone = "success") => {
    setToast({ message, tone });
  };

  const navigate = (tab: TabId, week?: number) => {
    if (week) setSelectedWeek(week);
    setMobileMoreOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const target = navigationTarget(nav, tab, week);
    if (!target) return;
    setActiveTab(target.tab);
    if (target.segment === null) return;
    // A screen that now lives inside a destination (views still ask for
    // "weekly", "errors", …): open it at that section. The tab switch writes
    // the hash synchronously, so the segment is written after it.
    writeSegment(target.tab, target.segment);
    if (target.tab === "plan") setPlanSegment(target.segment);
    else if (target.tab === "practice") setPracticeSegment(target.segment);
    else if (target.tab === "progress") setProgressSegment(target.segment);
  };

  const handleExport = () => {
    downloadBackup(tracker);
    notify("JSON backup downloaded.");
  };

  const openPractice = (intent: PracticeIntent) => {
    navigate("practice");
    // The hook only writes while Practice is active; write the hash directly
    // so the segment is already there when the coach mounts or re-reads it.
    writeSegment("practice", intent);
    setPracticeSegment(intent);
  };
  const openPracticeModule = (moduleId: string) => {
    const segment = practiceModuleSegment(moduleId);
    navigate("practice");
    writeSegment("practice", segment);
    setPracticeSegment(segment);
  };
  const openCoach = (section: TutorSection) => {
    navigate("coach");
    writeSegment("coach", section);
    setCoachSegment(section);
  };
  // Tutor Admin sections, reachable straight from the palette (Ctrl+K).
  const coachCommands: PaletteCommand[] = role === "tutor" && !isLiveShell
    ? TUTOR_SECTIONS.map((section) => ({
        id: `coach-${section.id}`,
        label: `Tutor Admin: ${section.label}`,
        group: "Go to",
        hint: `Open the ${section.label} section of Tutor Admin`,
        keywords: ["tutor", "admin", "coach", section.id],
        icon: UserCog,
        run: () => openCoach(section.id),
      }))
    : [];
  const practiceCommands: PaletteCommand[] = !isLiveShell
    ? (Object.keys(PRACTICE_INTENTS) as PracticeIntent[])
        .filter((intent) => PRACTICE_INTENTS[intent].mode === null || role === "student")
        .map((intent) => ({
          id: `practice-${intent}`,
          label: PRACTICE_INTENTS[intent].label,
          group: "Actions",
          hint: PRACTICE_INTENTS[intent].hint,
          keywords: ["practice", intent, PRACTICE_INTENTS[intent].mode ?? "calculator"],
          icon: intent === "calculator" ? Calculator : intent === "repair" ? RotateCcw : intent === "exam" ? Clock3 : Sparkles,
          run: () => openPractice(intent),
        }))
    : [];

  const commands: PaletteCommand[] = [
    ...visibleNav.map<PaletteCommand>((item) => ({
      id: `go-${item.id}`,
      label: item.label,
      group: "Go to",
      hint: item.hint ?? TAB_COPY[item.id].description,
      keywords: [item.mobileLabel, ...(item.keywords ?? [])],
      shortcut: shortcutIds.includes(item.id) ? `Alt+${shortcutIds.indexOf(item.id) + 1}` : undefined,
      icon: item.icon,
      run: () => navigate(item.id),
    })),
    {
      id: "theme",
      label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      group: "Actions",
      keywords: ["theme", "dark", "light", "appearance"],
      icon: theme === "dark" ? Sun : Moon,
      run: toggleTheme,
    },
    {
      id: "export",
      label: "Download backup",
      group: "Actions",
      hint: "Keep a copy of shared progress",
      keywords: ["json", "export"],
      icon: Download,
      run: handleExport,
    },
    {
      id: "calendar",
      label: "Export calendar",
      group: "Actions",
      hint: "Riyadh times and reminders",
      keywords: ["ics", "reminders"],
      icon: CalendarPlus,
      run: () => setCalendarDialogOpen(true),
    },
    ...practiceCommands,
    ...coachCommands,
    ...(capabilities.canUseLiveSession && !isLiveShell
      ? [{ id: "live", label: "Open Session Mode", group: "Actions", hint: "Private tutor workspace", keywords: ["teach", "classroom"], icon: PlayCircle, run: () => navigate("live") } satisfies PaletteCommand]
      : []),
    ...(capabilities.canImportData && !isLiveShell
      ? [{ id: "import", label: "Import backup", group: "Actions", hint: "Restore shared tracker data", keywords: ["restore", "json"], icon: Upload, run: () => importRef.current?.click() } satisfies PaletteCommand]
      : []),
    {
      id: "signout",
      label: "Sign out",
      group: "Actions",
      keywords: ["logout", "log out"],
      icon: LogOut,
      run: () => {
        void dialog.confirm("Sign out of the tracker on this device?").then((confirmed) => {
          if (confirmed) void signOut();
        });
      },
    },
  ];
  const palette = (
    <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
  );

  const handleCalendarExport = (preferences: CalendarExportPreferences) => {
    downloadProject202Calendar({
      sessionOverrides: tracker.sessionOverrides,
      preferences,
    });
    notify("Calendar import downloaded with Riyadh times and reminders.");
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    if (!capabilities.canImportData) {
      notify("Only the tutor can replace shared tracker data.", "warning");
      return;
    }
    try {
      const imported = await readBackup(file);
      const approved = await dialog.confirm(
        "Importing this backup will replace the current shared progress and sync it to every device. Continue?",
      );
      if (!approved) return;
      await replaceTrackerAuthoritatively(imported);
      notify("Backup imported and synchronized authoritatively.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to import this backup.",
        "warning",
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const toggleTask = (id: string) => {
    if (!capabilities.canToggleTasks) return;
    const task = PLAN.flatMap((week) =>
      getPlanTasks(week, tracker.sessionOverrides),
    ).find((item) => item.id === id);
    if (!task) return;
    if (task.kind === "session") {
      if (role === "tutor") {
        navigate("live");
        notify("Session Mode is ready for the tutor-led checkpoint.");
        return;
      }
      const status = getTaskStatus(task, tracker);
      if (status === "approved") {
        notify("This session completion is already tutor-approved.");
        return;
      }
      updateTracker((current) => {
        const requests = { ...current.sessionCompletionRequests };
        if (status === "requested") delete requests[id];
        else requests[id] = { taskId: id, requestedAt: new Date().toISOString() };
        const taskCompletions = { ...current.taskCompletions };
        delete taskCompletions[id];
        return { ...current, taskCompletions, sessionCompletionRequests: requests };
      });
      notify(status === "requested" ? "Approval request withdrawn." : "Sent to Mohamed for approval.");
      return;
    }
    updateTracker((current) => ({
      ...current,
      taskCompletions: {
        ...current.taskCompletions,
        [id]: !current.taskCompletions[id],
      },
    }));
  };

  // Each tab renders inside its own error boundary so a failing view leaves
  // the shell, navigation and the other tabs usable; switching tab resets it.
  const renderView = () => (
    <ErrorBoundary scope={`view:${activeTab}`} variant="view" resetKey={activeTab}>
      {renderActiveView()}
    </ErrorBoundary>
  );

  const renderActiveView = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <DashboardView
            tracker={tracker}
            currentWeek={initialWeek}
            rawProgramWeek={rawProgramWeek}
            onToggleTask={toggleTask}
            onNavigate={navigate}
            onOpenPractice={openPractice}
            onOpenModuleTest={openModuleMock}
            studentUid={role === "student" ? user.uid : null}
            role={role!}
            loading={syncStatus === "loading"}
          />
        );
      case "plan":
        return (
          <PlanView
            section={planRoute.section}
            onSection={(section) => setPlanSegment(planSegment(section, section === "week" ? selectedWeek : null))}
            week={(
              <WeeklyView
                tracker={tracker}
                selectedWeek={selectedWeek}
                setSelectedWeek={setSelectedWeek}
                onToggleTask={toggleTask}
                notify={notify}
                role={role!}
              />
            )}
            roadmap={(
              <RoadmapView
                tracker={tracker}
                currentWeek={initialWeek}
                focusWeek={planRoute.section === "roadmap" ? planRoute.week : null}
                onFocusWeek={(week) => setPlanSegment(planSegment("roadmap", week))}
                onOpenWeek={(week) => {
                  setSelectedWeek(week);
                  setPlanSegment(planSegment("week", week));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
            sessions={(
              <SessionLogView
                tracker={tracker}
                currentWeek={initialWeek}
                updateTracker={updateTracker}
                notify={notify}
                canManage={capabilities.canManageTutorSessions}
              />
            )}
          />
        );
      case "practice":
        return (
          <PracticeHubView
            segment={practiceSegment}
            onSegment={setPracticeSegment}
            dueRetests={tracker.errorEntries.filter((entry) => isRetestDue(entry, todayDateOnly())).length}
            practise={(
              <PracticeCoach
                uid={user.uid}
                role={role!}
                notify={notify}
                onComplete={(summary) => updateTracker((current) => ({
                  ...current,
                  practiceLogs: [
                    { id: makeId("practice"), ...summary },
                    ...current.practiceLogs,
                  ],
                }))}
                onAddMistake={(entry) => updateTracker((current) => addPracticeMistake(current, entry).tracker)}
                bridgedQuestionIds={bridgedQuestionIds(tracker.errorEntries)}
                intent={practiceSegment}
                onIntentHandled={() => setPracticeSegment("")}
                manualLog={(
                  <PracticeLogView
                    tracker={tracker}
                    updateTracker={updateTracker}
                    notify={notify}
                  />
                )}
              />
            )}
            mistakes={(
              <ErrorVaultView
                tracker={tracker}
                updateTracker={updateTracker}
                notify={notify}
              />
            )}
          />
        );
      case "progress":
        return (
          <ProgressView
            section={parseProgressSection(progressSegment)}
            onSection={setProgressSegment}
            tracker={tracker}
            updateTracker={updateTracker}
            notify={notify}
            role={role!}
            uid={user.uid}
            canEditMastery={capabilities.canEditMastery}
            canManageMocks={capabilities.canManageMocks}
            onPracticeModule={openPracticeModule}
          />
        );
      case "moduleMocks":
        return (
          <ModuleMockTests
            uid={user.uid}
            role={role!}
            notify={notify}
            openModuleId={moduleMocksSegment}
            onOpenHandled={clearModuleMocksSegment}
            onOpenMistakes={() => navigate("errors")}
            onOpenRepair={() => openPractice("repair")}
            onOpenReminders={() => openCoach("tests")}
            onOpenTutorAdmin={() => openCoach("tests")}
            onPracticeModule={openPracticeModule}
            thisWeek={thisWeekTests}
          />
        );
      case "notes":
        return (
          <NotesView
            tracker={tracker}
            updateTracker={updateTracker}
            notify={notify}
            onExport={handleExport}
            onImport={() => importRef.current?.click()}
            onCalendarExport={() => setCalendarDialogOpen(true)}
            canImport={capabilities.canImportData}
            syncStatus={syncStatus}
            syncError={syncError}
            userEmail={user.email ?? "Approved mastery-path account"}
            onRetrySync={retrySync}
            role={role!}
            privateTutorNotes={privateTutorNotes}
            privateNotesReady={privateNotesReady}
            privateNotesBusy={privateNotesBusy}
            privateNotesError={privateNotesError}
            updatePrivateTutorNotes={updatePrivateTutorNotes}
          />
        );
      case "live":
        return (
          <EmptyState icon={ShieldCheck} title="Tutor access only">
            Session Mode and its private teaching material are available only to
            Mohamed&apos;s tutor account.
          </EmptyState>
        );
      case "coach":
        return capabilities.canResetTracker ? (
          <TutorAdminView
            tracker={tracker}
            updateTracker={updateTracker}
            replaceTrackerAuthoritatively={replaceTrackerAuthoritatively}
            authoritativeReplaceBusy={authoritativeReplaceBusy}
            syncStatus={syncStatus}
            notify={notify}
            section={parseTutorSection(coachSegment)}
            onSection={setCoachSegment}
            onOpenPayments={() => navigate("payments")}
            onOpenSessionMode={() => navigate("live")}
          />
        ) : (
          <EmptyState icon={ShieldCheck} title="Tutor access only">
            Tutor Admin is protected for approvals, schedule changes, launch checks, and recovery controls.
          </EmptyState>
        );
      case "payments":
        return capabilities.canUseLiveSession ? (
          <PaymentsHub />
        ) : (
          <EmptyState icon={ShieldCheck} title="Tutor access only">
            Payment records and receipt issuance are available only to the tutor.
          </EmptyState>
        );
    }
  };

  if (activeTab === "live" && capabilities.canUseLiveSession) {
    return (
      <>
        <Suspense
          fallback={
            <main className="session-mode-loader" aria-live="polite" aria-busy="true">
              <section>
                <span className="session-mode-loader-mark" aria-hidden="true" />
                <p>Private tutor workspace</p>
                <h1>Opening Session Mode</h1>
                <small>Loading the protected classroom interface.</small>
              </section>
            </main>
          }
        >
          <ErrorBoundary scope="session-mode" variant="session">
            <TutorSessionWorkspace
              userUid={user.uid}
              tracker={tracker}
              updateTracker={updateTracker}
              updatePrivateTutorNotes={updatePrivateTutorNotes}
              notify={notify}
              onExit={() => navigate("dashboard")}
            />
          </ErrorBoundary>
        </Suspense>
        {palette}
        {toast && (
          <div
            className={cx("toast", toast.tone === "warning" && "toast-warning")}
            role="status"
          >
            {toast.tone === "success" ? (
              <CircleCheckBig size={18} />
            ) : (
              <CircleAlert size={18} />
            )}
            {toast.message}
          </div>
        )}
      </>
    );
  }

  const sidebarGroups = nav.groups.filter(
    (group) => group.label !== "Tutor" || capabilities.canUseLiveSession,
  );
  const sidebarIds = sidebarGroups.flatMap((group) => group.ids);
  // The "More" button stands in for sections that live behind the sheet.
  const mobileTabbable: TabId | "more" = nav.mobilePrimary.includes(activeTab) ? activeTab : "more";

  return (
    <div className={cx("app-shell", activeTab === "practice" && practiceSectionFor(practiceSegment) === "practise" && "sidebar-collapsed")}>
      <a className="skip-link" href="#tracker-content">Skip to content</a>
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark"><Crest size={38} /></span>
          <div>
            <strong>MASTERY PATH</strong>
            <span>Hamad · CFA Level I</span>
            <small className="creator-credit">Created by Mohamed Ali, CFA</small>
          </div>
        </div>

        <div className="sidebar-exam">
          <span>Exam appointment</span>
          <strong>27 FEB 2027</strong>
          <small>{daysUntilExam()} days to prepare</small>
        </div>

        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow-key delegation for the buttons inside */}
        <nav className="sidebar-nav" aria-label="Project sections" onKeyDown={sidebarKeyDown}>
          {sidebarGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.ids.map((id) => {
                const item = navItem(id);
                const Icon = item.icon;
                return (
                  <button
                    className={cx("nav-button", activeTab === item.id && "is-active")}
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    aria-current={activeTab === item.id ? "page" : undefined}
                    tabIndex={rovingTabIndex(sidebarIds, activeTab, item.id)}
                    title={item.hint}
                    type="button"
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark"><Crest size={32} /></span>
            <div>
              <strong>MASTERY PATH</strong>
              <span>Hamad · CFA Level I</span>
              <small className="creator-credit">Created by Mohamed Ali, CFA</small>
            </div>
          </div>
          <div className="topbar-exam"><span>{daysUntilExam()} days</span><small>to exam</small></div>
          <div className="data-actions">
            <button
              type="button"
              className="theme-toggle command-palette-launch"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              title="Command palette (Ctrl+K)"
            >
              <Command size={17} />
              <span>Ctrl+K</span>
            </button>
            <ThemeToggle />
            <span className={cx("sync-chip", syncCopy.tone)} title={syncCopy.detail} role={syncStatus === "error" || syncStatus === "offline" ? undefined : "status"} aria-atomic="true" aria-label={`${syncCopy.label}. ${syncCopy.detail}`}>
              <SyncIcon size={15} />
              <span>{syncCopy.label}</span>
            </span>
            {syncStatus === "error" && (
              <button type="button" className="sync-retry" onClick={retrySync} title={syncError ?? syncCopy.detail}>Try again</button>
            )}
            {capabilities.canUseLiveSession && (
              <button className="button button-primary header-session-action" type="button" onClick={() => navigate("live")} title="Open Session Mode" aria-label="Open Session Mode">
                <PlayCircle size={17} /><span>Session Mode</span>
              </button>
            )}
            <WorkspaceActions email={user.email} role={role}>
            <button type="button" onClick={handleExport}>
              <Download size={16} />
              <span>Download backup<small>Keep a copy of shared progress</small></span>
            </button>
            <button type="button" onClick={() => setCalendarDialogOpen(true)}>
              <CalendarPlus size={16} />
              <span>Add to calendar<small>Session dates and reminders</small></span>
            </button>
            {capabilities.canImportData && <button
              type="button"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={16} />
              <span>Import backup<small>Restore shared tracker data</small></span>
            </button>}
            <button type="button" onClick={toggleDepth} aria-pressed={depthPreference === "on"}>
              <Box size={16} />
              <span>3D effects: {depthPreference === "on" ? "On" : "Off"}<small>{depthPreference === "on" ? "Depth, tilt and reveals" : "Calm 2D motion only"}</small></span>
            </button>
            <button
              className="workspace-signout"
              type="button"
              onClick={() => void signOut()}
              title={`Sign out ${user.email ?? ""}`.trim()}
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
            </WorkspaceActions>
            <input
              className="visually-hidden"
              ref={importRef}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleImport(event.target.files?.[0])}
            />
          </div>
        </header>

        <SyncRecoveryNotice state={syncStatus} message={syncError} onRetry={retrySync} />
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow-key delegation for the buttons inside */}
        <nav className="mobile-nav" aria-label="Primary project sections" onKeyDown={mobileNavKeyDown}>
          {nav.mobilePrimary.map((id) => {
            const item = navItem(id);
            const Icon = item.icon;
            return (
              <button
                className={cx("mobile-nav-button", activeTab === item.id && "is-active")}
                key={item.id}
                onClick={() => navigate(item.id)}
                aria-current={activeTab === item.id ? "page" : undefined}
                tabIndex={mobileTabbable === item.id ? 0 : -1}
                type="button"
              >
                <Icon size={17} />
                <span>{item.mobileLabel}</span>
              </button>
            );
          })}
          <button
            className={cx(
              "mobile-nav-button",
              (mobileMoreOpen || nav.mobileMore.includes(activeTab)) && "is-active",
            )}
            type="button"
            tabIndex={mobileTabbable === "more" ? 0 : -1}
            aria-expanded={mobileMoreOpen}
            aria-controls="mobile-more-menu"
            onClick={() => setMobileMoreOpen((open) => !open)}
          >
            <Menu size={17} />
            <span>More</span>
          </button>
        </nav>

        <div className="page-shell" id="tracker-content" tabIndex={-1}>
          {/* Home, This Week and Module Tests open with their own hero heading. */}
          {activeTab !== "dashboard" && activeTab !== "weekly" && activeTab !== "moduleMocks" && <PageHeading tab={activeTab} />}
          <Suspense fallback={<ViewSkeleton label={`Loading ${TAB_COPY[activeTab].title}`} />}>{renderView()}</Suspense>
        </div>
      </main>

      {mobileMoreOpen && (
        <div className="mobile-more-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setMobileMoreOpen(false); }}>
          <section
            className="mobile-more-sheet"
            ref={mobileDialogRef}
            tabIndex={-1}
            id="mobile-more-menu"
            role="dialog"
            aria-modal="true"
            aria-label="More tracker sections"
          >
            <header>
              <div><span>HAMAD CFA MASTERY</span><strong>More tools</strong></div>
              <button ref={mobileCloseRef} className="icon-button" type="button" onClick={() => setMobileMoreOpen(false)} aria-label="Close menu"><X size={19} /></button>
            </header>
            <div className="mobile-more-grid">
              {nav.mobileMore.filter(
                (id) => !TUTOR_TAB_IDS.includes(id) || capabilities.canUseLiveSession,
              ).map((id) => {
                const item = navItem(id);
                const Icon = item.icon;
                return (
                  <button
                    className={cx("mobile-more-button", activeTab === item.id && "is-active")}
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                  >
                    <span><Icon size={19} /></span>
                    <div><strong>{item.label}</strong><small>{TAB_COPY[item.id].description}</small></div>
                    <ChevronRight size={17} />
                  </button>
                );
              })}
            </div>
            <p className="mobile-more-credit">Created by Mohamed Ali, CFA</p>
          </section>
        </div>
      )}

      <CalendarExportDialog
        open={calendarDialogOpen}
        onClose={() => setCalendarDialogOpen(false)}
        onExport={handleCalendarExport}
      />
      {palette}

      {user && role === "student" && trackerReady && (
        <Suspense fallback={null}>
          <MockReminderHost uid={user.uid} onOpenModule={openModuleMock} />
        </Suspense>
      )}

      {toast && (
        <div className={cx("toast", toast.tone === "warning" && "toast-warning")} role="status">
          {toast.tone === "success" ? <CircleCheckBig size={18} /> : <CircleAlert size={18} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function AppWithDialogs() {
  const params = new URLSearchParams(window.location.search);
  const receiptRef = params.get("verify_receipt");

  if (receiptRef) {
    return (
      <ThemeProvider>
        <Suspense fallback={<ViewSkeleton label="Checking receipt" />}>
          <ReceiptVerificationScreen token={receiptRef} />
        </Suspense>
      </ThemeProvider>
    );
  }

  return <ThemeProvider><AppDialogProvider><App /></AppDialogProvider></ThemeProvider>;
}
