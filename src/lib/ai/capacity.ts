import { chat } from "./openrouter";

export type CapacitySignal = {
  occupancyRatio: number;       // 0..1 across the upcoming slot window
  partySize: number;
  noShowCount: number;          // user's historical no-shows
  totalBookings: number;        // user's lifetime bookings
  isPeakSlot: boolean;          // true for slots starting 19:00-21:00
};

export type CapacityVerdict = {
  riskScore: number;            // 0..1
  estimatedWaitMin: number;     // minutes to next likely available slot
  depositRecommended: boolean;
  reason: string;               // short, human-readable
  source: "llm" | "heuristic";
};

// Heuristic baseline — always cheap, always available.
export function heuristicVerdict(s: CapacitySignal): CapacityVerdict {
  let risk = 0;
  risk += s.occupancyRatio * 0.5;                           // busy slot
  risk += Math.min(s.partySize / 12, 1) * 0.25;             // large party
  if (s.totalBookings > 0) {
    risk += Math.min(s.noShowCount / s.totalBookings, 1) * 0.2;
  }
  if (s.isPeakSlot) risk += 0.1;
  risk = Math.min(1, Math.max(0, risk));

  const wait = Math.round(s.occupancyRatio * 60 + (s.isPeakSlot ? 10 : 0));
  const depositRecommended = s.partySize >= 6 && risk >= 0.5;

  let reason = "Capacity looks comfortable.";
  if (risk >= 0.75) reason = "High demand and elevated no-show risk.";
  else if (risk >= 0.5) reason = "Peak hour — deposit advised for the floor team.";
  else if (s.partySize >= 8) reason = "Large party — deposit helps secure the table.";

  return {
    riskScore: Number(risk.toFixed(2)),
    estimatedWaitMin: wait,
    depositRecommended,
    reason,
    source: "heuristic",
  };
}

// AI-assisted verdict — wraps the heuristic and asks the LLM to tighten the
// reason + adjust the score within a small band.
export async function aiVerdict(
  s: CapacitySignal,
): Promise<CapacityVerdict> {
  const base = heuristicVerdict(s);
  const r = await chat(
    [
      {
        role: "system",
        content:
          "You are the Waitless Predictive Capacity Engine for restaurants in Kuwait. Given live signals, output a JSON object: {\"riskScore\": 0..1, \"estimatedWaitMin\": int, \"depositRecommended\": bool, \"reason\": string}. Never explain. JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify({
          signals: s,
          baseline: base,
        }),
      },
    ],
    { temperature: 0.1, maxTokens: 200 },
  );

  if (!r.ok) return base;
  try {
    const parsed = JSON.parse(r.text);
    return {
      riskScore: Math.max(
        0,
        Math.min(1, Number(parsed.riskScore ?? base.riskScore)),
      ),
      estimatedWaitMin: Math.max(
        0,
        Math.round(parsed.estimatedWaitMin ?? base.estimatedWaitMin),
      ),
      depositRecommended: Boolean(
        parsed.depositRecommended ?? base.depositRecommended,
      ),
      reason: String(parsed.reason ?? base.reason).slice(0, 160),
      source: "llm",
    };
  } catch {
    return base;
  }
}
