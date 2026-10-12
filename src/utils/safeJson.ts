/**
 * Safely parse HTTP response bodies, avoiding "Unexpected end of JSON input"
 * when responses are empty (e.g., HTTP 201 Created or 204 No Content with Content-Length: 0),
 * and providing helpful diagnosis when an HTML page (e.g., Netlify 404) is received.
 */
export async function safeParseJson<T = any>(response: Response): Promise<T> {
  const text = await response.text();

  // If the body is empty (e.g., 201 Created or 204 No Content with Content-Length: 0)
  if (!text || text.trim().length === 0) {
    return {
      status: response.status,
      statusText: response.statusText,
      message: 'Request completed with an empty response body',
    } as unknown as T;
  }

  const trimmed = text.trim();
  // Detect if an HTML error page (e.g. from Netlify, Vercel, or Web server 404) was returned
  if (
    trimmed.startsWith('<!DOCTYPE html') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('hosted on Netlify')
  ) {
    if (trimmed.includes('hosted on Netlify') || response.status === 404) {
      throw new Error(
        `Received a Netlify HTML 404 page instead of the Supabase API. Your 'Supabase URL' is currently set to a Netlify frontend domain. Please change it to your Supabase backend URL: https://llvsmockvufgbqpeepbm.supabase.co`
      );
    }
    throw new Error(
      `Expected JSON from Supabase API, but received an HTML response (HTTP ${response.status}). Please verify your Supabase URL endpoint.`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
}
