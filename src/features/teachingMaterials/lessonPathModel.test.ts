import { describe, expect, it } from "vitest";
import {
  MAX_LESSON_STOPS, MAX_STOP_PROMPT_CHARS, movedStop, newStopId, sanitizeLessonPath, stopIndexAt, withCopiedStops,
  withoutStop, withPrompt, withStop, type LessonStop,
} from "./lessonPathModel";

const stop = (id: string, versionId: string, page: number, prompt = ""): LessonStop => ({ id, versionId, page, prompt });

describe("lesson paths", () => {
  it("adds stops at the end or after the current stop", () => {
    const one = withStop([], { versionId: "a", page: 4, prompt: "" }, undefined, 1)!;
    const two = withStop(one, { versionId: "b", page: 9, prompt: "Ask why" }, undefined, 2)!;
    const three = withStop(two, { versionId: "a", page: 6, prompt: "" }, 0, 3)!;
    expect(three.map(item => `${item.versionId}:${item.page}`)).toEqual(["a:4", "a:6", "b:9"]);
    expect(new Set(three.map(item => item.id)).size).toBe(3);
    const full = Array.from({ length: MAX_LESSON_STOPS }, (_, index) => stop(`s${index}`, "a", index + 1));
    expect(withStop(full, { versionId: "a", page: 99, prompt: "" })).toBeNull();
  });

  it("moves, removes and edits prompts", () => {
    const path = [stop("s1", "a", 1), stop("s2", "a", 2), stop("s3", "b", 3)];
    expect(movedStop(path, "s3", -1).map(item => item.id)).toEqual(["s1", "s3", "s2"]);
    expect(movedStop(path, "s1", -1).map(item => item.id)).toEqual(["s1", "s2", "s3"]);
    expect(withoutStop(path, "s2").map(item => item.id)).toEqual(["s1", "s3"]);
    expect(withPrompt(path, "s2", "x".repeat(MAX_STOP_PROMPT_CHARS + 5))[1]!.prompt).toHaveLength(MAX_STOP_PROMPT_CHARS);
  });

  it("copies another session's stops with fresh ids, within the limit", () => {
    const path = [stop("s1", "a", 1)];
    const copied = withCopiedStops(path, [stop("s1", "b", 2, "p"), stop("s2", "b", 3)], 10);
    expect(copied.map(item => `${item.versionId}:${item.page}:${item.prompt}`)).toEqual(["a:1:", "b:2:p", "b:3:"]);
    expect(new Set(copied.map(item => item.id)).size).toBe(3);
    expect(newStopId([stop("s1", "a", 1)], 1)).toBe("s1-1");
  });

  it("finds the stop on the current page, preferring the current stop", () => {
    const path = [stop("s1", "a", 4), stop("s2", "b", 9), stop("s3", "a", 4)];
    expect(stopIndexAt(path, "a", 4, 2)).toBe(2);
    expect(stopIndexAt(path, "a", 4, 1)).toBe(0);
    expect(stopIndexAt(path, "b", 1, 0)).toBe(-1);
  });

  it("sanitizes stored stops", () => {
    expect(sanitizeLessonPath("x")).toEqual([]);
    expect(sanitizeLessonPath([
      stop("s1", "a", 2, "keep"), stop("s1", "a", 3), { id: "bad id!", versionId: "a", page: 1 }, { id: "s2", versionId: "", page: 1 },
      { id: "s3", versionId: "a", page: 0 }, { id: "s4", versionId: "a", page: 5, prompt: 7 },
    ])).toEqual([stop("s1", "a", 2, "keep"), stop("s4", "a", 5)]);
  });
});
