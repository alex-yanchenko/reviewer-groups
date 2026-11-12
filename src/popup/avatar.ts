const AVATAR_HOST = "avatars.githubusercontent.com";

export const trustedAvatarUrl = (url: string | null): string | null => {
  const parsed = url === null ? null : URL.parse(url);
  return parsed !== null && parsed.protocol === "https:" && parsed.hostname === AVATAR_HOST ? url : null;
};
