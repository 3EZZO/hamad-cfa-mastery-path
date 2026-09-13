import { useEffect, useRef, useState } from "react";
import { LiveSessionRunner } from "./LiveSessionRunner";
import { SessionCloseout } from "./SessionCloseout";
import { useSessionTimer } from "./useSessionTimer";
import { libraryDeckCount } from "./sessionGlossary";
import type { LiveSessionDescriptor, LiveSessionPlaybook, LiveSessionRoute, LiveSessionEvidence } from "./types";

/** Intentionally has no live snapshot, persistence service or write callback. */
export function RehearsalWorkspace({ session, playbook, route, onExit }: {
  session: LiveSessionDescriptor;
  playbook: LiveSessionPlaybook;
  route: LiveSessionRoute;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<"running" | "closeout" | "complete">("running");
  const [evidence, setEvidence] = useState<LiveSessionEvidence[]>([]);
  const [covered, setCovered] = useState<string[]>([]);
  const [position, setPosition] = useState({ stage: 0, question: 0 });
  const wasRunning = useRef(false);
  const timer = useSessionTimer({ durationMinutes: route.minutes });
  useEffect(() => { timer.start(route.minutes); }, [route.minutes, timer.start]);
  const stages = playbook.stagesByRoute[route.id] ?? [];

  return <section className={`live-session ls-rehearsal${phase === "running" ? " live-session--running" : ""}`} aria-label="Rehearsal workspace">
    <header className="ls-rehearsal-banner">
      <div><strong>REHEARSAL — nothing is saved</strong><span>Session {String(session.number).padStart(2, "0")} · Practice only. Exiting discards these practice actions; your live session stays unchanged and paused.</span></div>
      <button type="button" className="ls-button ls-button--primary" onClick={onExit}>Exit rehearsal</button>
    </header>
    {phase === "running" && <LiveSessionRunner
      mode="rehearsal" persistPreferences={false}
      session={session} route={route} stages={stages} references={playbook.references}
      libraryDecks={libraryDeckCount(playbook)} timer={timer} evidence={evidence} completedDeskIds={covered}
      initialStageIndex={position.stage} initialQuestionIndex={position.question}
      onEvidence={entry => setEvidence(current => [...current, entry])}
      onDeskCompletionChange={(key, complete) => setCovered(current => complete ? [...new Set([...current, key])] : current.filter(item => item !== key))}
      onPositionChange={(stage, question) => setPosition(current => current.stage === stage && current.question === question ? current : { stage, question })}
      onRequestCloseout={() => { wasRunning.current = timer.status === "running"; timer.pause(); setPhase("closeout"); }}
    />}
    {phase === "closeout" && <SessionCloseout
      mode="rehearsal" session={session} route={route} stages={stages} evidence={evidence}
      completedDeskIds={covered}
      actualMinutes={Math.max(1, Math.round(timer.elapsedMs / 60_000))}
      onBack={() => { setPhase("running"); if (wasRunning.current) timer.resume(); }}
      onSubmit={() => { timer.finish(); setPhase("complete"); }}
    />}
    {phase === "complete" && <section className="ls-state">
      <h1>Rehearsal complete</h1><p>You practiced the full workflow. No evidence, progress, session record or note was saved.</p>
      <button type="button" className="ls-button ls-button--primary" onClick={onExit}>Return to live workspace</button>
    </section>}
  </section>;
}
