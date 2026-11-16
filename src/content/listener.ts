const listeningFlag = (version: string) => `__reviewerGroupsListening:${version}`;

export const listenOncePerVersion = (tab: object, version: string, startListening: () => void): void => {
  const flag = listeningFlag(version);
  if (flag in tab) return;
  Object.defineProperty(tab, flag, { value: true });
  startListening();
};
