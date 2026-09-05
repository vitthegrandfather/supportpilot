import type { DraftState } from "./types";

const ORDER: DraftState[] = ["generated", "edited", "approved", "simulated_sent"];

export function canEdit(state: DraftState): boolean {
  return state === "generated" || state === "edited" || state === "approved";
}

export function canApprove(state: DraftState, insufficientEvidence: boolean): boolean {
  if (insufficientEvidence || state === "blocked" || state === "simulated_sent") return false;
  return state === "generated" || state === "edited" || state === "approved";
}

export function canSimulatedSend(state: DraftState): boolean {
  return state === "approved";
}

export function nextStateOnEdit(state: DraftState): DraftState {
  if (!canEdit(state)) return state;
  return "edited";
}

export function parseCitationMarkers(body: string): number[] {
  const out: number[] = [];
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push(Number(m[1]));
  return [...new Set(out)];
}

export function draftStateLabel(state: DraftState): string {
  switch (state) {
    case "generated":
      return "AI-generated draft";
    case "edited":
      return "Human-edited draft";
    case "approved":
      return "Approved reply";
    case "simulated_sent":
      return "Simulated sent reply";
    case "blocked":
      return "Blocked — insufficient evidence";
    default:
      return state;
  }
}

export function isLowConfidenceEscalation(confidence: number, escalate: boolean, insufficient: boolean): boolean {
  return escalate && (insufficient || confidence < 0.55);
}

export { ORDER as DRAFT_STATE_ORDER };
