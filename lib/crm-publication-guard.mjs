export function isCrmPath(pathname) {
  let normalized = pathname;

  // Vinext decodes route segments. Mirror that behavior before deciding so an
  // encoded spelling cannot reach the app router in production.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }

  return normalized === "/crm" || normalized.startsWith("/crm/");
}

export function crmPublicationResponse(pathname, development) {
  if (development || !isCrmPath(pathname)) return null;

  return new Response("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=UTF-8",
    },
  });
}
