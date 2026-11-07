/** True only for MongoDB URIs that point directly to a loopback host. */
export function isLocalMongoUri(uri: string | undefined) {
  if (!uri?.trim() || !uri.startsWith("mongodb://")) return false;
  const authority = uri.slice("mongodb://".length).split(/[/?#]/, 1)[0];
  if (authority.includes(",")) return false;
  try {
    const hostname = new URL(uri).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
