import { describe, expect, it } from "vitest";
import type { ReviewerCandidate } from "../messages";
import { rankSearchResults } from "./searchResults";

const person = (login: string, overrides: Partial<ReviewerCandidate> = {}): ReviewerCandidate => ({
  login,
  description: "",
  avatarUrl: null,
  team: false,
  requested: false,
  available: true,
  ...overrides,
});

const logins = (people: ReviewerCandidate[]) => people.map((candidate) => candidate.login);

describe("rankSearchResults", () => {
  it("drops people GitHub adds only because they are already requested", () => {
    const answer = [
      person("river-chen", { description: "River Chen", requested: true }),
      person("sam-okafor", { description: "Sam Okafor", requested: true }),
      person("noorh", { description: "Noor Haddad" }),
    ];

    expect(logins(rankSearchResults("Noor", answer))).toEqual(["noorh"]);
  });

  it("keeps a requested person who matches the search", () => {
    const answer = [person("noorh", { requested: true }), person("noor-two")];

    expect(logins(rankSearchResults("noor", answer))).toEqual(["noorh", "noor-two"]);
  });

  it("puts logins that start with the search first, then names with a word that starts with it, then the rest", () => {
    const answer = [
      person("joan-smith"),
      person("mike", { description: "Anna Mikhailova" }),
      person("anna-k"),
      person("bran", { description: "Bran Stark" }),
    ];

    expect(logins(rankSearchResults("an", answer))).toEqual(["anna-k", "mike", "joan-smith", "bran"]);
  });

  it("keeps an unrequested person GitHub matched on something it does not show, after the visible matches", () => {
    const answer = [person("x-user", { description: "Someone" }), person("noorh")];

    expect(logins(rankSearchResults("noo", answer))).toEqual(["noorh", "x-user"]);
  });

  it("returns GitHub's order unchanged for an empty search", () => {
    const answer = [person("b", { requested: true }), person("a")];

    expect(rankSearchResults("  ", answer)).toEqual(answer);
  });
});
