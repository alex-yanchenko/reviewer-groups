# Reviewer Groups

A Chrome extension for requesting GitHub pull request reviews from several people at once. Open it on a pull request, tick people, and request them; save a set you use often as a group, and next time it is two clicks: the toolbar icon, then the group.

## How it works

- **Who you can pick.** On a pull request, the popup asks GitHub's own reviewer search, `GET <pull request>/review-requests?typeAhead=true&q=<search>` with `X-Requested-With: XMLHttpRequest`, the same JSON endpoint the Reviewers menu uses. With an empty search it returns GitHub's suggestions; typing in the popup's search box queries everyone GitHub would let you request, teams included. The request runs inside the tab with your logged-in session, so no token is needed.
- **Requesting.** The popup injects `picker.js` into the tab. It opens GitHub's Reviewers menu on the Conversation tab, ticks each person not already requested, and closes the menu, which is how GitHub saves a reviewer selection. Someone outside the menu's default list is found by typing their login into the menu's filter first. The page's Reviewers box updates the normal way.
- **The menu needs a focus event to load.** GitHub fetches the menu's list when its filter field receives focus. While the extension popup is open, Chrome withholds focus events from the page, so `picker.js` dispatches that `focus` event itself after opening the menu.
- **Storage.** Groups live in `chrome.storage.sync` (a name and a list of logins or `org/team` slugs). Ticks in progress live in `chrome.storage.session`, so closing the popup by clicking the page loses nothing; they clear when Chrome quits.
- **Permissions.** `storage`, `activeTab` and `scripting`. With `activeTab` the extension reaches a tab only after you click its icon, and only that tab, so it has no standing access to github.com or any other site.
- The popup reports who was requested, who already was, and who GitHub does not offer as a reviewer on that pull request (the author, or someone without access to the repository).

## Develop

```bash
pnpm install
pnpm build          # writes the loadable extension to dist/
pnpm dev            # rebuilds on change
pnpm check          # prettier, eslint, tsc, vitest
pnpm package        # dist/ zipped for the Chrome Web Store
```

Load it: open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and pick the `dist/` folder.

## Limits

- It depends on two GitHub internals: the reviewer search endpoint above, and the sidebar markup (`form[action$="/review-requests"]`, its `input.js-filterable-field`, and `label[role="menuitemcheckbox"]` options). Both live in `src/content/reviewerPicker.ts`; `src/content/testing/reviewerSidebarFixture.ts` is the markup and behaviour the tests assume.
- It works on a pull request's Conversation tab, where the Reviewers menu lives. On the Files tab it says so.
