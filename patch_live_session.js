const fs = require('fs');
let code = fs.readFileSync('src/features/liveSession/LiveSessionRunner.tsx', 'utf8');

const startIndex = code.indexOf('<header className="ls-livebar">');
const endIndex = code.indexOf('<StageCard');

if (startIndex > -1 && endIndex > -1) {
  const unifiedHeader = \
      <header className="ls-unified-header">
        <p className="ls-sr-only" role="status" aria-live="polite" aria-atomic="true">
          Session timer {timer.status}{timer.expired ? "; planned time has elapsed" : ""}. Response timer {deskTimerRunning ? "running" : "paused"}.
        </p>
        <p className="ls-sr-only" role="status" aria-live="polite" aria-atomic="true">{evidenceAnnouncement}</p>
        
        <div className="ls-unified-header__left">
          <button
            className="ls-icon-button"
            type="button"
            disabled={!hasPreviousQueueDeck}
            onClick={goPrevious}
            aria-label="Return to the previous teaching deck"
          >
            <ArrowLeft size={16} />
          </button>
          
          <div className="ls-unified-header__identity">
            <h2 title={stage.title}>{stage.title}</h2>
            <div className="ls-unified-header__meta">
              <span className="ls-meta-pill">Step {linearStepNumber} of {linearStepTotal}</span>
              <SessionPacingStatus
                pacing={pacing}
                completedDecks={completedLiveTargetDecks}
                targetDecks={liveTargetDecks}
                paused={pacingPaused}
                calibrating={pacingCalibrating}
                className="ls-pacing-status--compact"
              />
              <span className="ls-meta-pill">Target {evidenceTargetIds.size}/120</span>
              <span className="ls-meta-pill">{deskComplete ? "Covered" : "Open"}</span>
              
              <details className="ls-deck-tools-compact" ref={toolsRef}>
                <summary aria-label="Session tools">
                  <SlidersHorizontal size={14} /> Tools
                </summary>
                <div className="ls-deck-tools__popover">
                  <nav className="ls-stage-strip" aria-label="Session stages">
                    <div className="ls-stage-strip__progress">
                      <span>Stage {stageIndex + 1} of {stages.length}</span>
                      <strong>{stage.title}</strong>
                    </div>
                    <div className="ls-stage-strip__items">
                      {stageProgress.map((item, index) => {
                        const complete = item.deckCount > 0 && item.coveredCount >= item.deckCount;
                        return (
                          <button
                            type="button"
                            className={\\\\\\\\}
                            aria-current={index === stageIndex ? "step" : undefined}
                            aria-label={\\\Stage \: \\\\\}
                            title={\\\\: \\\\}
                            key={item.id}
                            onClick={() => {
                              const destination = allDecks.find(deck => deck.stageIndex === index);
                              if (destination && navigateManuallyToDeck(destination) && toolsRef.current) {
                                toolsRef.current.open = false;
                              }
                            }}
                          >
                            {complete ? <CheckCircle2 size={15} /> : <span>{index + 1}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </nav>
                  
                  <div className="ls-reading-settings">
                    <div>
                      <strong>Make yourself comfortable</strong>
                      <span>Adjust the teaching text on this device.</span>
                    </div>
                    <div role="group" aria-label="Teaching text size">
                      <button type="button" disabled={readerSize <= 1} onClick={() => changeReaderSize(-1)}><Minus size={16} /></button>
                      <output aria-live="polite">{Math.round(readerSize * 100)}%</output>
                      <button type="button" disabled={readerSize >= 1.2} onClick={() => changeReaderSize(1)}><Plus size={16} /></button>
                    </div>
                  </div>
                  
                  <section className="ls-comfort-settings">
                    <header>
                      <strong>Workspace comfort</strong>
                    </header>
                    <div>
                      <button type="button" aria-pressed={density === "compact"} onClick={() => setDensity(value => value === "compact" ? "comfortable" : "compact")}>Compact density</button>
                      <button type="button" aria-pressed={highContrast} onClick={() => setHighContrast(value => !value)}>High contrast</button>
                      <button type="button" aria-pressed={hideCoaching} onClick={() => setHideCoaching(value => !value)}>Hide coaching cues</button>
                      <button type="button" aria-pressed={equalColumns} onClick={() => setEqualColumns(value => !value)}>Equal panel widths</button>
                      <button type="button" onClick={resetWorkspaceLayout}><RotateCcw size={15} /> Reset layout</button>
                    </div>
                  </section>
                  
                  <button className="ls-button ls-button--quiet" type="button" onClick={requestCloseoutSafely}>
                    <Flag size={16} /> {mode === "rehearsal" ? "Finish rehearsal" : "Finish session"}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>

        <div className="ls-unified-header__right">
          {mode === "live" && <SyncRecoveryNotice state={syncState} message={syncMessage} onRetry={onSyncRetry} />}
          
          <div className="ls-clock-cluster" aria-label="Session timers">
            <div className={\ls-clock\\}>
              <svg className="ls-clock-ring" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="20" stroke="var(--border)" strokeWidth="4" fill="none" />
                <circle 
                  cx="24" cy="24" r="20" 
                  stroke={timer.expired ? "var(--alert-red)" : (timer.remainingMs !== undefined && timer.remainingMs < 5 * 60_000) ? "var(--gold-bright)" : "var(--theme-blue)"} 
                  strokeWidth="4" fill="none"
                  strokeDasharray={2 * Math.PI * 20}
                  strokeDashoffset={timer.progress !== undefined ? (Math.min(timer.progress, 1)) * (2 * Math.PI * 20) : 0}
                  strokeLinecap="round"
                  transform="rotate(-90 24 24)"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
                />
              </svg>
              <div className="ls-clock-text">
                <span>{timer.status === "paused" ? "Paused" : timer.expired ? "Overtime" : "Remaining"}</span>
                <time>{timer.display}</time>
              </div>
            </div>
            
            <div className={\ls-clock ls-clock--desk\\}>
              <span>{deskOvertime ? "Response overtime" : "Response time"}</span>
              <time>{deskDisplay}</time>
              <div>
                <button className="ls-clock-control" type="button" onClick={() => setDeskTimerRunning(value => !value)}>
                  {deskTimerRunning ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button className="ls-clock-control" type="button" onClick={() => setDeskElapsedSeconds(0)}>
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>
            
            <button className="ls-timer-toggle" type="button" disabled={timer.status === "complete"} onClick={timer.toggle}>
              {timer.status === "running" ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
          </div>

          <button
            className="ls-focus-toggle"
            type="button"
            onClick={() => setFocusMode(value => !value)}
            aria-pressed={focusMode}
          >
            {focusMode ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            <span>{focusMode ? "Exit focus" : "Teaching focus"}</span>
            <kbd>Z</kbd>
          </button>
          
          <button
            className="ls-button ls-linear-control__next"
            type="button"
            onClick={advanceLinearSequence}
          >
            <span>{primaryActionLabel}</span>
            <kbd>Space</kbd>
            <ArrowRight size={20} />
          </button>
        </div>
      </header>

      {resumeNoticeOpen && (
        <aside className="ls-resume-notice" role="status">
          <div>
            <strong>Workspace restored</strong>
            <span>
              Deck {currentDeck?.globalNumber ?? 1} of {allDecks.length} {linearStepLabel} timer {timer.status}
            </span>
          </div>
          <button type="button" onClick={() => setResumeNoticeOpen(false)}>
            Continue here <ArrowRight size={15} />
          </button>
        </aside>
      )}

      <div
        className={\ls-runner__grid\\\}
      >
        <main className="ls-runner__main">
          \;

  let newCode = code.substring(0, startIndex) + unifiedHeader + code.substring(endIndex);
  
  fs.writeFileSync('src/features/liveSession/LiveSessionRunner.tsx', newCode, 'utf8');
  console.log("Replaced header in LiveSessionRunner.");
} else {
  console.log("Could not find start or end index.");
}
