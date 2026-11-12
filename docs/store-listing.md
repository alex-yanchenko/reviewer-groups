# Chrome Web Store listing

Text and answers for the Chrome Web Store developer dashboard, kept here so every release submits the same thing.

## Store listing

**Name:** Reviewer Groups

**Summary** (132 characters max): Request GitHub pull request reviews from several people at once, and save them as groups. No token, no setup.

**Category:** Developer Tools

**Language:** English

**Description:**

Request reviews on a GitHub pull request from several people at once.

Open Reviewer Groups on a pull request and it lists everyone GitHub lets you request there, with avatars, teams, and who is already requested. Tick the people you want and request them in one click. Search finds anyone who can review, not only GitHub's suggestions.

Save a set of people you ask often as a group. Next time it is two clicks: the toolbar icon, then the group.

- No token and no setup: it uses the GitHub session you are already signed in with.
- It works only in the tab you click it on, and only after you click it. It has no standing access to any site.
- No servers, no analytics, no tracking. Your groups sync through your Chrome profile.
- Open source: https://github.com/alex-yanchenko/reviewer-groups

**Screenshots** (1280×800): `docs/screenshots/pick.png`, `groups.png`, `search.png`, `save.png`

**Small promo tile** (440×280): `docs/screenshots/promo.png`

**Store icon** (128×128): `icons/icon-128.png`

## Privacy practices

**Single purpose:** Request reviews on the GitHub pull request in the current tab from people and saved groups of people.

**Permission justifications:**

- `storage`: Saves the user's reviewer groups (names and GitHub logins) with chrome.storage.sync, the people ticked but not yet requested with chrome.storage.session, and the reviewers GitHub has listed (login, name, avatar address) with chrome.storage.local, so groups can be built when no pull request is open.
- `activeTab`: Gives the extension access to the GitHub pull request in the current tab only after the user clicks its icon, so it needs no standing access to github.com.
- `scripting`: Runs the extension's own script in that tab to read GitHub's reviewer list and send the review request with the user's GitHub session.

**Remote code:** No. All code ships in the package.

**Data usage:**

- Personally identifiable information: yes. The extension stores the GitHub logins the user adds to groups, and the logins, display names and avatar addresses of reviewers GitHub has listed. They stay in the user's Chrome storage and are sent only to github.com, as part of the review requests the user makes.
- Website content: yes. It reads the list of reviewers GitHub offers on the open pull request to show it in the popup, and whether a profile page still exists to flag renamed or removed logins.
- No other category applies.

**Certifications:** the data is not sold to third parties, not used or transferred for purposes unrelated to the single purpose, and not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://github.com/alex-yanchenko/reviewer-groups/blob/main/PRIVACY.md
