const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const isTicked = (selection: readonly string[], login: string): boolean =>
  selection.some((ticked) => sameLogin(ticked, login));

export const toggleLogin = (selection: string[], login: string): string[] =>
  isTicked(selection, login)
    ? selection.filter((ticked) => !sameLogin(ticked, login))
    : [...selection, login];

export const tickLogins = (selection: string[], logins: readonly string[]): string[] => [
  ...selection,
  ...logins.filter((login) => !isTicked(selection, login)),
];
