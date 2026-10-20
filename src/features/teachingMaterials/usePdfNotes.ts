import { useCallback } from "react";
import type { TeachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { EMPTY_PDF_NOTES, type PdfNotes } from "./pdfNotesModel";
import { useRevisionedRecord, type RecordSaveState } from "./useRevisionedRecord";

export type PdfNotesState = RecordSaveState;

const MESSAGES = {
  load: "Page notes could not be loaded. Teaching from the PDF still works.",
  save: "Notes could not be saved. Your changes are still here; retry when online.",
  conflict: "These notes changed on another device. Reload them before editing.",
};

/** Page notes and key pages for the open PDF version. */
export function usePdfNotes(service: TeachingMaterialService, tutorUid: string, versionId: string | null, rehearsal: boolean) {
  const load = useCallback(async (key: string) => {
    const result = await service.loadPdfNotes(key);
    return { value: result.notes, revision: result.revision };
  }, [service]);
  const save = useCallback((key: string, value: PdfNotes, expected: number) =>
    service.savePdfNotes(key, value, expected, tutorUid), [service, tutorUid]);
  const record = useRevisionedRecord<PdfNotes>({ recordKey: versionId, rehearsal, empty: EMPTY_PDF_NOTES, load, save, messages: MESSAGES });
  return { notes: record.value, state: record.state, error: record.error, update: record.update, flush: record.flush, retry: record.retry };
}
