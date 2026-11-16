import { describe, expect, it } from "vitest";
import { linksToRepository, parseRepoPatterns, repositoryOf } from "./repoPatterns";

describe("parseRepoPatterns", () => {
  it("takes owner/repo and owner/* patterns separated by commas, spaces or new lines", () => {
    expect(parseRepoPatterns("acme/widgets, acme-labs/*\nnorth.wind/site_2")).toEqual({
      patterns: ["acme/widgets", "acme-labs/*", "north.wind/site_2"],
      invalid: [],
    });
  });

  it("keeps the first spelling of a pattern that repeats in another case", () => {
    expect(parseRepoPatterns("acme/widgets ACME/Widgets")).toEqual({
      patterns: ["acme/widgets"],
      invalid: [],
    });
  });

  it("reports patterns with a wildcard anywhere but the whole repository part, or not of the form owner/repo", () => {
    expect(parseRepoPatterns("*/widgets acme/wid* acme acme/widgets/extra acme/wid?gets")).toEqual({
      patterns: [],
      invalid: ["*/widgets", "acme/wid*", "acme", "acme/widgets/extra", "acme/wid?gets"],
    });
  });

  it("returns nothing for blank input", () => {
    expect(parseRepoPatterns(" ,\n ")).toEqual({ patterns: [], invalid: [] });
  });
});

describe("linksToRepository", () => {
  it("matches an exact repository regardless of letter case", () => {
    expect(linksToRepository(["ACME/Widgets"], "acme/widgets")).toBe(true);
  });

  it("matches every repository of an owner through owner/*", () => {
    expect(linksToRepository(["acme/*"], "Acme/anything")).toBe(true);
  });

  it("does not match another owner's repository of the same name", () => {
    expect(linksToRepository(["acme/widgets", "acme-labs/*"], "other/widgets")).toBe(false);
  });

  it("matches nothing without patterns", () => {
    expect(linksToRepository(undefined, "acme/widgets")).toBe(false);
  });
});

describe("repositoryOf", () => {
  it("takes the repository from a pull request name", () => {
    expect(repositoryOf("acme/widgets#7")).toBe("acme/widgets");
  });

  it("has no repository away from a pull request", () => {
    expect(repositoryOf(null)).toBeNull();
  });
});
