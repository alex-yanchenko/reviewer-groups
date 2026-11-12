# Reviewer Groups

A Chrome extension for requesting GitHub pull request reviews from several people at once. Open it on a pull request, tick people, and request them. Save a set you use often as a group, and next time it is two clicks: the toolbar icon, then the group.

No token, no setup: it works with the GitHub session you are already signed in with.

![Ticking reviewers in the popup](docs/screenshots/pick.png)

## How it works

The extension talks to the same two github.com endpoints GitHub's own Reviewers box uses, from inside the pull request tab, with your signed-in session.

- **Listing people.** `GET <pull request>/review-requests?typeAhead=true&q=<search>` with `X-Requested-With: XMLHttpRequest` answers JSON: each person or team's id, login, name, avatar, whether they are already requested (`selected`) and whether they can review (`disabled`). An empty search returns GitHub's suggestions plus everyone currently requested; a search reaches anyone GitHub would let you request. This works on every tab of a pull request.
- **Requesting.** The Reviewers box is a form that sets the whole reviewer list at once: `POST <pull request>/review-requests` with the form's `authenticity_token` and hidden fields plus one `reviewer_user_ids[]` or `reviewer_team_ids[]` per reviewer. For each member the extension first looks up their exact login, which sorts out who is already requested, unavailable or not offered, without sending anything. It then sends the form with everyone GitHub currently lists as requested plus the new people. The current reviewers always come from the JSON answer, never from the page's form, because the page's copy goes stale after any change made outside it.
- **After requesting.** GitHub answers with fresh HTML for the Reviewers box, which the extension swaps into the page, and the extension asks the JSON endpoint again to confirm who is now requested. Anyone not confirmed is reported as such.
- **Storage.** Each group lives under its own key in `chrome.storage.sync` (a name and a list of logins or `org/team` slugs), with a separate key for their order, so no single item approaches Chrome's per-item limit. Ticks in progress live in `chrome.storage.session`, so closing the popup by clicking the page loses nothing; they clear when Chrome quits.
- **Permissions.** `storage`, `activeTab` and `scripting`. With `activeTab` the extension reaches a tab only after you click its icon, and only that tab, so it has no standing access to github.com or any other site.

## Develop

```bash
pnpm install
pnpm build          # writes the loadable extension to dist/
pnpm dev            # rebuilds on change
pnpm check          # prettier, eslint, tsc, vitest
pnpm package        # dist/ zipped for the Chrome Web Store
pnpm screenshots    # regenerates docs/screenshots with invented people (needs Google Chrome)
```

Load it: open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and pick the `dist/` folder.

## Limits

- Both endpoints are GitHub internals, not a public API, and can change without notice. Everything that touches them is in `src/content/githubReviewers.ts`; `src/content/testing/fakeGitHub.ts` is the behaviour the tests assume.
- Requesting needs the pull request's Conversation tab, where the Reviewers form and its token live. Listing and building groups work on any tab of a pull request.

## Screenshots

|                                                          |                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| ![Requesting a saved group](docs/screenshots/groups.png) | ![Searching everyone who can review](docs/screenshots/search.png) |
