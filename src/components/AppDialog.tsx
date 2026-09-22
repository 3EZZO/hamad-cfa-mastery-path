import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, X } from "lucide-react";
import { useDialogFocus } from "../features/liveSession/useDialogFocus";

type Owner = { active: boolean };
type Request = { owner: Owner; message: string; initial?: string; kind: "confirm" | "prompt"; resolve: (value: string | null) => void };
type DialogService = { open: (request: Omit<Request, "resolve">) => Promise<string | null>; cancel: (owner: Owner) => void };
const DialogContext = createContext<DialogService | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const pending = useRef<Request | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  const finish = useCallback((value: string | null) => {
    const current = pending.current;
    pending.current = null;
    setRequest(null);
    current?.resolve(value);
  }, []);
  const service = useMemo<DialogService>(() => ({
    open: input => {
      if (!input.owner.active) return Promise.resolve(null);
      pending.current?.resolve(null);
      return new Promise(resolve => {
        const next = { ...input, resolve };
        pending.current = next;
        setRequest(next);
      });
    },
    cancel: owner => { if (pending.current?.owner === owner) finish(null); },
  }), [finish]);
  useEffect(() => () => {
    pending.current?.resolve(null);
    pending.current = null;
  }, []);
  return <DialogContext.Provider value={service}>
    {children}
    {request && <DecisionDialog key={request.message} request={request} onFinish={finish} />}
  </DialogContext.Provider>;
}

/** Navigation/account changes cancel the owning view's pending decision. */
export function useAppDialog(scope: unknown = null) {
  const service = useContext(DialogContext);
  if (!service) throw new Error("AppDialogProvider is required");
  const owner = useMemo<Owner>(() => ({ active: false }), [scope]);
  useEffect(() => {
    owner.active = true;
    return () => { owner.active = false; service.cancel(owner); };
  }, [owner, service]);
  return useMemo(() => ({
    confirm: async (message: string) => (await service.open({ owner, message, kind: "confirm" })) !== null && owner.active,
    prompt: (message: string, initial = "") => service.open({ owner, message, initial, kind: "prompt" }),
    active: () => owner.active,
  }), [owner, service]);
}

function DecisionDialog({ request, onFinish }: { request: Request; onFinish: (value: string | null) => void }) {
  const [value, setValue] = useState(request.initial ?? "");
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prompt = request.kind === "prompt";
  useDialogFocus(true, dialogRef, prompt ? inputRef : cancelRef, () => onFinish(null));
  return <div className="calendar-dialog-backdrop app-decision-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onFinish(null); }}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="app-decision-title" aria-describedby="app-decision-message" className="calendar-dialog app-decision-dialog">
      <header className="calendar-dialog-header">
        <span className="calendar-dialog-mark"><CircleAlert size={22} /></span>
        <h2 id="app-decision-title">{prompt ? "Your confirmation" : "Confirm this action"}</h2>
        <button type="button" className="icon-button" aria-label="Close confirmation" onClick={() => onFinish(null)}><X size={18} /></button>
      </header>
      <p id="app-decision-message" className="calendar-dialog-intro">{request.message}</p>
      <form className="calendar-dialog-form" onSubmit={event => { event.preventDefault(); onFinish(prompt ? value : "confirmed"); }}>
        {prompt && <label><span>Your response</span><input ref={inputRef} value={value} onChange={event => setValue(event.target.value)} autoComplete="off" /></label>}
        <footer className="calendar-dialog-actions">
          <button ref={cancelRef} type="button" className="button button-secondary" onClick={() => onFinish(null)}>Cancel</button>
          <button type="submit" className="button button-primary">Continue</button>
        </footer>
      </form>
    </section>
  </div>;
}
