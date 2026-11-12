# Privacy policy

Reviewer Groups is a Chrome extension that helps you request reviews on GitHub pull requests. This policy describes every piece of data it touches.

## What it stores

- **Your groups**: each group's name and the GitHub logins or `org/team` slugs you put in it. Stored with `chrome.storage.sync`, so Chrome syncs it across browsers signed in to the same Chrome profile. Nothing else is stored there.
- **People you have ticked but not yet requested**: stored with `chrome.storage.session`, so the list survives the popup closing. Chrome deletes it when the browser quits.

## What it reads

When you click the extension's icon on a GitHub pull request, it reads the list of people GitHub offers as reviewers for that pull request (logins, display names, avatars, and whether each is already requested). It reads this from github.com, inside the tab you have open, using the GitHub session you are already signed in with. It reads nothing on any other page, and nothing at all until you click its icon.

## What it sends

- To GitHub: the review requests you ask for, made through GitHub's own Reviewers menu in your tab, exactly as if you had ticked the names yourself.
- To anyone else: nothing. The extension has no server, no analytics, no tracking and no third-party code. It never asks for or stores a GitHub token or password.

The popup shows reviewers' avatars, which your browser loads from GitHub's avatar host (`avatars.githubusercontent.com`).

## Permissions

- `storage`: to keep your groups and your unsent ticks.
- `activeTab` and `scripting`: to run its script in the current tab, and only after you click the extension's icon. It has no standing access to github.com or any other site.

## Contact

Questions or problems: open an issue at https://github.com/alex-yanchenko/reviewer-groups/issues.
