import { RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { useDialogFocus } from "../liveSession/useDialogFocus";
import { MATERIAL_TOPICS, type MaterialLabels, type MaterialTopic } from "./materialDetails";
import { normalizeMaterialTitle } from "./materialTypes";

export function EditMaterialDialog({ initial, active, onSave, onClose }: {
  initial: MaterialLabels;
  active: boolean;
  onSave: (labels: MaterialLabels) => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [reading, setReading] = useState(initial.readingNumber === null ? "" : String(initial.readingNumber));
  const [topic, setTopic] = useState<MaterialTopic>(initial.topic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDialogFocus(active, dialogRef, titleRef, () => { if (!busy) onClose(); });
  const readingNumber = reading.trim() ? Number(reading) : null;
  const valid = !!normalizeMaterialTitle(title) && (readingNumber === null
    || (Number.isInteger(readingNumber) && readingNumber >= 1 && readingNumber <= 99));

  return (
    <div className="tm-dialog-backdrop" hidden={!active}>
      <div ref={dialogRef} className="tm-dialog" role="dialog" aria-modal="true" aria-labelledby="tm-edit-title" tabIndex={-1}>
        <div className="tm-edit__head">
          <h2 id="tm-edit-title">Edit PDF details</h2>
          <button type="button" className="tm-icon" disabled={busy} onClick={onClose} aria-label="Close PDF details"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="tm-dialog__hint">Correct the labels shown to you and anyone this PDF is shared with. The PDF, access and teaching history stay the same.</p>
        <form onSubmit={event => {
          event.preventDefault();
          if (!valid || busy || !active) return;
          setBusy(true); setError("");
          void onSave({ title: normalizeMaterialTitle(title), readingNumber, topic })
            .catch(caught => setError(caught instanceof Error ? caught.message : "Details could not be saved. Try again."))
            .finally(() => setBusy(false));
        }}>
          <label>Title<input ref={titleRef} type="text" value={title} maxLength={160} required disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
          <label>Topic<select value={topic} disabled={busy} onChange={event => setTopic(event.target.value as MaterialTopic)}>
            {MATERIAL_TOPICS.map(item => <option key={item} value={item}>{item}</option>)}
          </select></label>
          <label>Reading number (optional)<input type="number" min={1} max={99} step={1} value={reading} disabled={busy} onChange={event => setReading(event.target.value)} aria-describedby="tm-edit-reading-help" /></label>
          <p id="tm-edit-reading-help" className="tm-dialog__hint">Leave blank if no curriculum reading number applies. Put module numbers in the title.</p>
          {error && <p role="alert" className="tm-dialog__error">{error}</p>}
          <div className="tm-dialog__actions">
            <button type="button" className="tm-button" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" className="tm-button tm-button--primary" disabled={busy || !valid}>
              {busy && <RefreshCw className="tm-spin" size={16} aria-hidden="true" />}{busy ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
