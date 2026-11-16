export class ConversationCache {
  private session: string | null = null;
  private doc: Document | null = null;

  enterSession(session: string): void {
    if (session === this.session) return;
    this.session = session;
    this.doc = null;
  }

  read(): Document | null {
    return this.doc;
  }

  keep(doc: Document): void {
    this.doc = doc;
  }

  forget(): void {
    this.doc = null;
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
