export const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export async function boundedText(response: Response, limit: number, signal?: AbortSignal): Promise<string> {
  const reader = response.body?.getReader();
  const cancel = () => { void reader?.cancel().catch(() => undefined); };
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  const prefix: number[] = [];
  let bytes = 0;
  let text = "";
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const header = response.headers.get("content-length");
    const expected = header === null ? undefined : Number(header);
    if (header !== null && (!/^\d+$/.test(header) || !Number.isSafeInteger(expected) || expected! > limit)) throw new Error("EMA response has an invalid or oversized Content-Length");
    if (signal?.aborted) throw new Error("EMA response deadline exceeded");
    if (!reader) {
      if (expected) throw new Error("EMA response body is missing");
      return "";
    }
    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new Error("EMA response deadline exceeded");
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error(`EMA response exceeds ${limit} bytes; use a narrower PMS search or external feed download`);
      for (let index = 0; prefix.length < 3 && index < value.length; index++) prefix.push(value[index]);
      text += decoder.decode(value, { stream: true });
    }
    if (expected !== undefined && !response.headers.has("content-encoding") && bytes !== expected) throw new Error("EMA response length differs from Content-Length");
    const bom = prefix[0] === 0xef && prefix[1] === 0xbb && prefix[2] === 0xbf ? "\uFEFF" : "";
    return bom + text + decoder.decode();
  } finally { signal?.removeEventListener("abort", cancel); cancel(); }
}

export function apiError(message: string, status: number, data?: unknown): never {
  throw Object.assign(new Error(message), { status, data });
}

export async function responseMetadata(response: Response, text: string, url: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return {
    source_url: url, retrieved_at: new Date().toISOString(),
    response_sha256: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join(""),
    response_bytes: bytes.byteLength, hash_scope: "decoded_response_bytes",
    etag: response.headers.get("etag"), last_modified: response.headers.get("last-modified"),
  };
}
