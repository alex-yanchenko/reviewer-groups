import { onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { createPopupQueryClient } from "./queryClient";

describe("createPopupQueryClient", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("still asks the page when the popup believes it is offline, because the page does the fetching", async () => {
    onlineManager.setOnline(false);
    const client = createPopupQueryClient();

    const answer = await Promise.race([
      client.fetchQuery({ queryKey: ["lookup"], queryFn: () => Promise.resolve("asked the page") }),
      new Promise((resolve) => setTimeout(() => resolve("paused"), 50)),
    ]);

    expect(answer).toEqual("asked the page");
  });
});
