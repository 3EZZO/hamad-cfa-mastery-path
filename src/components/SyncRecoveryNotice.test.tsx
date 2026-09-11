import { act, create } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SyncRecoveryNotice } from "./SyncRecoveryNotice";

describe("P4 inline recovery", () => {
  it("renders the exact failure message inline with a prominent retry", () => {
    const html = renderToStaticMarkup(<SyncRecoveryNotice state="error" message="Active tutor: deployed write contract rejected." onRetry={() => {}} />);
    expect(html).toContain("Active tutor: deployed write contract rejected.");
    expect(html).toContain("button button-primary");
    expect(html).toContain('aria-atomic="true"');
    expect(html).not.toContain("title=");
  });
  it("omits healthy/loading states and provides offline recovery without hover", () => {
    for (const state of ["synced", "saving", "loading"]) {
      expect(renderToStaticMarkup(<SyncRecoveryNotice state={state} />)).toBe("");
    }
    expect(renderToStaticMarkup(<SyncRecoveryNotice state="offline" />)).toContain("Reconnect to the internet");
  });
  it("calls only the supplied retry handler when explicitly pressed", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const retry = vi.fn(); let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<SyncRecoveryNotice state="error" onRetry={retry} />); });
    expect(retry).not.toHaveBeenCalled();
    await act(async () => tree.root.findByType("button").props.onClick());
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount()); vi.unstubAllGlobals();
  });
});
