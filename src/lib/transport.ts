import { boundedText } from "./response";

/** One wall-clock deadline includes headers, streamed body and cancellation. */
export async function fetchEmaText(url: string, init: RequestInit, limit: number, timeout: number, fetcher: typeof fetch) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("EMA retrieval deadline exceeded")); }, timeout);
  });
  const operation = async () => {
    const response = await fetcher(url, { ...init, redirect: "manual", signal: controller.signal });
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("EMA retrieval deadline exceeded");
    }
    return { response, text: await boundedText(response, limit, controller.signal) };
  };
  try { return await Promise.race([operation(), deadline]); }
  catch (error) { controller.abort(); throw error; }
  finally { clearTimeout(timer); }
}
