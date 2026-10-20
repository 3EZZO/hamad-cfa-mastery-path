import { useCallback } from "react";
import type { TeachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { EMPTY_LESSON_PATH, type LessonStop } from "./lessonPathModel";
import { useRevisionedRecord } from "./useRevisionedRecord";

const MESSAGES = {
  load: "The lesson path could not be loaded. Teaching from the PDF still works.",
  save: "The lesson path could not be saved. Your changes are still here; retry when online.",
  conflict: "This lesson path changed on another device. Reload it before editing.",
};

/** The lesson path prepared for this session (one record per session). */
export function useLessonPath(service: TeachingMaterialService, tutorUid: string, runId: string, rehearsal: boolean) {
  const load = useCallback(async (key: string) => {
    const result = await service.loadLessonPath(key);
    return { value: result.stops, revision: result.revision };
  }, [service]);
  const save = useCallback((key: string, value: LessonStop[], expected: number) =>
    service.saveLessonPath(key, value, expected, tutorUid), [service, tutorUid]);
  return useRevisionedRecord<LessonStop[]>({ recordKey: runId, rehearsal, empty: EMPTY_LESSON_PATH, load, save, messages: MESSAGES });
}
