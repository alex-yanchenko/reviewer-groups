export class ConversationCache {
  private session: string | null = null;
  private kept: { path: string; doc: Document } | null = null;

  enterSession(session: string): void {
    if (session === this.session) return;
    this.session = session;
    this.kept = null;
  }

  read(path: string): Document | null {
    return this.kept?.path.toLowerCase() === path.toLowerCase() ? this.kept.doc : null;
  }

  keep(path: string, doc: Document): void {
    this.kept = { path, doc };
  }

  forget(): void {
    this.kept = null;
  }
}

export interface GitHubPage {
  doc: Document;
  fetch: typeof fetch;
  conversation: ConversationCache;
}

export class GitHubAnswerError extends Error {
  override readonly name = "GitHubAnswerError";
  constructor(status: number) {
    super(`GitHub answered ${status}.`);
  }
}
