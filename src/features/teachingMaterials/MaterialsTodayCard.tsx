import { ChevronRight, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { teachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { formatSharedDate, sortShares, type MaterialGrant } from "./materialTypes";
import "./teachingMaterials.css";

const RECENT_DAYS = 14;

/**
 * Today › "Materials from your tutor": recent active shares only. A resource
 * entry point, never an item in the Today task queue. Renders nothing until
 * something is shared.
 */
export default function MaterialsTodayCard({
  uid, onOpen, onOpenAll,
}: {
  uid: string;
  onOpen: (versionId: string) => void;
  onOpenAll: () => void;
}) {
  const service = useMemo(() => teachingMaterialService(), []);
  const [grants, setGrants] = useState<MaterialGrant[]>([]);
  useEffect(() => service.subscribeMyActiveGrants(next => setGrants(sortShares(next)), () => setGrants([])), [service, uid]);
  if (!grants.length) return null;
  const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const recent = grants.filter(item => item.sharedAtMs === null || item.sharedAtMs >= cutoff).slice(0, 3);
  const shown = recent.length ? recent : grants.slice(0, 1);
  return (
    <article className="panel tm-today-card" aria-labelledby="tm-today-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Resources</p><h3 id="tm-today-title">Materials from your tutor</h3></div>
        <FileText size={21} aria-hidden="true" />
      </div>
      <ul>
        {shown.map(item => (
          <li key={item.versionId}>
            <button type="button" onClick={() => onOpen(item.versionId)}>
              <span>
                <strong>{item.title}</strong>
                <br />
                <small>{formatSharedDate(item.sharedAtMs)}</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button className="text-button" type="button" onClick={onOpenAll}>
        All session materials ({grants.length}) <ChevronRight size={15} />
      </button>
    </article>
  );
}
