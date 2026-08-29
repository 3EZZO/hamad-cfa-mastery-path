import { describe, expect, it } from "vitest";
import { isPreSessionRehearsal } from "./sessionLifecycle";

describe("isPreSessionRehearsal", () => {
  it("classifies a completion before the Riyadh session start as rehearsal", () => {
    expect(
      isPreSessionRehearsal(
        "2026-08-29T12:00:00.000Z",
        "2026-09-05",
        "09:00"
      )
    ).toBe(true);
    expect(
      isPreSessionRehearsal(
        "2026-09-05T05:59:59.999Z",
        "2026-09-05",
        "09:00"
      )
    ).toBe(true);
  });

  it("protects an official completion at or after the scheduled start", () => {
    expect(
      isPreSessionRehearsal(
        "2026-09-05T06:00:00.000Z",
        "2026-09-05",
        "09:00"
      )
    ).toBe(false);
    expect(
      isPreSessionRehearsal(
        "2026-09-05T08:30:00.000Z",
        "2026-09-05",
        "09:00"
      )
    ).toBe(false);
  });

  it("fails closed when a timestamp is invalid", () => {
    expect(
      isPreSessionRehearsal("invalid", "2026-09-05", "09:00")
    ).toBe(false);
  });
});
