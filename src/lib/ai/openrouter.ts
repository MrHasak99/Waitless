// Minimal OpenRouter chat client.
// Falls back to a heuristic-only mode when no API key is configured so the
// app keeps working in local dev without an LLM.

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OpenRouterResult = {
  ok: boolean;
  text: string;
  source: "llm" | "fallback";
};

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-haiku-4.5";
  if (!apiKey) {
    return { ok: false, text: "", source: "fallback" };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "https://waitless.kw",
        "X-Title": "Waitless",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 400,
      }),
    });
    if (!res.ok) {
      console.error("OpenRouter error", res.status, await res.text());
      return { ok: false, text: "", source: "fallback" };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { ok: text.length > 0, text, source: "llm" };
  } catch (err) {
    console.error("OpenRouter exception", err);
    return { ok: false, text: "", source: "fallback" };
  }
}
