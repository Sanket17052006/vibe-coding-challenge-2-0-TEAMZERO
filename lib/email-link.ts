export function emailActionLink(kind: "verify" | "reset", base: string, token: string) {
  return `${base.replace(/\/$/, "")}/${kind === "verify" ? "verify-email" : "reset-password"}#token=${encodeURIComponent(token)}`;
}

export function extractAndClearEmailToken(hash: string, search: string, pathname: string, replaceAddress: (url: string) => void) {
  const fragmentToken = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("token");
  const legacyQueryToken = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("token");
  replaceAddress(pathname);
  return fragmentToken || legacyQueryToken;
}
