/**
 * Safely parse HTTP response bodies, avoiding "Unexpected end of JSON input"
 * when responses are empty (e.g., HTTP 201 Created or 204 No Content with Content-Length: 0).
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

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
}
