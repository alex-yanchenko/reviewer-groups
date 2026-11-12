# Privacy policy

Reviewer Groups is a Chrome extension that helps you request reviews on GitHub pull requests. This policy describes every piece of data it touches.

## What it stores

- **Your groups**: each group's name and the GitHub logins or `org/team` slugs you put in it. Stored with `chrome.storage.sync`, so Chrome syncs it across browsers signed in to the same Chrome profile. Nothing else is stored there.
- **People you have ticked but not yet requested**: stored with `chrome.storage.session`, so the list survives the popup closing. Chrome deletes it when the browser quits.
- **People the extension has shown you**: the login, display name, avatar address and person-or-team flag of everyone GitHub listed as a reviewer while you used the extension, plus the logins it found no longer exist on GitHub. Stored with `chrome.storage.local`, on this computer only and not synced, so you can build groups when no pull request is open. Removing the extension deletes it.

## What it reads

When you click the extension's icon on a GitHub pull request, it reads the list of people GitHub offers as reviewers for that pull request (logins, display names, avatars, and whether each is already requested). When a request includes someone GitHub does not offer as a reviewer, it also asks github.com whether that person's or team's profile page still exists, to tell you when a login has been renamed or removed. It reads all of this from github.com, inside the tab you have open, using the GitHub session you are already signed in with. It reads nothing on any other page, and nothing at all until you click its icon.

## What it sends

- To GitHub: the review requests you ask for, sent from your tab to github.com the same way GitHub's own Reviewers box sends them, with the session you are signed in with.
- To anyone else: nothing. The extension has no server, no analytics, no tracking and no third-party code. It never asks for or stores a GitHub token or password.

The popup shows reviewers' avatars, which your browser loads from GitHub's avatar host (`avatars.githubusercontent.com`).

## Permissions

- `storage`: to keep your groups and your unsent ticks.
- `activeTab` and `scripting`: to run its script in the current tab, and only after you click the extension's icon. It has no standing access to github.com or any other site.

## Contact

Questions or problems: open an issue at https://github.com/alex-yanchenko/reviewer-groups/issues.
