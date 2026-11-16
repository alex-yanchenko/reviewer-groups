import { describe, expect, it, vi } from "vitest";
import { listenOncePerVersion } from "./listener";

describe("listenOncePerVersion", () => {
  it("starts listening in a tab still flagged by the 1.0.0 script, whose listener Chrome cut off on update", () => {
    const tab = {};
    Object.defineProperty(tab, "__reviewerGroupsListening", { value: true });
    const startListening = vi.fn();

    listenOncePerVersion(tab, "1.1.0", startListening);

    expect(startListening).toHaveBeenCalledTimes(1);
  });

  it("starts listening once when the same version is injected again", () => {
    const tab = {};
    const startListening = vi.fn();

    listenOncePerVersion(tab, "1.1.0", startListening);
    listenOncePerVersion(tab, "1.1.0", startListening);

    expect(startListening).toHaveBeenCalledTimes(1);
  });

  it("starts listening again for a newer version in the same tab", () => {
    const tab = {};
    const startListening = vi.fn();

    listenOncePerVersion(tab, "1.1.0", startListening);
    listenOncePerVersion(tab, "1.2.0", startListening);

    expect(startListening).toHaveBeenCalledTimes(2);
  });
});
