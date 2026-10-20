import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";
import type { MaterialTopic } from "./materialDetails";

/** A collapsible topic section; the heading button toggles its PDF list. */
export function TopicGroup({ topic, count, open, onToggle, children }: {
  topic: MaterialTopic;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <section className={`tm-topic-group${open ? " is-open" : ""}`} aria-label={topic}>
      <h3 className="tm-topic-group__title">
        <button type="button" className="tm-topic-group__toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <ChevronDown className="tm-topic-group__chevron" size={18} aria-hidden="true" />
          {topic} <span>{count} {count === 1 ? "PDF" : "PDFs"}</span>
        </button>
      </h3>
      <div id={bodyId} className="tm-topic-group__body" hidden={!open}>{children}</div>
    </section>
  );
}
