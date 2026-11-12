# Reviewer Groups

A Chrome extension that saves named groups of GitHub reviewers and requests review from a whole group in two clicks: the toolbar icon, then the group.

## How it works

- Groups live in `chrome.storage.sync`: a name and a list of GitHub logins or `org/team` slugs per group. Nothing else is stored, and no token is ever asked for.
- When you pick a group on a pull request, the popup injects `picker.js` into that tab. The script opens GitHub's own Reviewers menu on the Conversation tab, ticks each group member who is not already requested, and closes the menu, which is how GitHub saves a reviewer selection. The request is made by your logged-in GitHub session, exactly as if you had clicked the names yourself.
- Permissions are `storage`, `activeTab` and `scripting`. With `activeTab` the extension can reach a tab only after you click its icon, and only that tab, so it has no standing access to github.com or any other site.
- The popup reports who was requested, who already was, and which members GitHub does not offer as reviewers on that pull request (the author, or someone without access to the repository).

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

- It drives GitHub's sidebar markup (`form[action$="/review-requests"]` and its `label[role="menuitemcheckbox"]` options). If GitHub redesigns the Reviewers menu, `src/content/reviewerPicker.ts` is the one file to update, and `src/content/testing/reviewerSidebarFixture.ts` is the markup the tests assume.
- It works on a pull request's Conversation tab, where the Reviewers menu lives. On the Files tab it says so.
