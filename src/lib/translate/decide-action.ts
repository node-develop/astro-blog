export interface ExistingEnState {
  readonly sourceHash: string | null;
  readonly manuallyEdited: boolean;
}

export interface DecideActionInput {
  readonly ruHash: string;
  readonly existingEn: ExistingEnState | null;
  readonly force: boolean;
  /**
   * The RU source or its EN twin was written by the content API (frontmatter
   * `apiRevision`). The API owns each locale of such a post; regenerating the
   * twin here would replace an API-written article and drop its revision.
   */
  readonly apiManaged?: boolean;
}

export interface ActionDecision {
  readonly action: "translate" | "skip" | "warn";
  readonly reason?: "cache-hit" | "manual-fresh" | "manual-stale" | "force" | "api-managed";
}

export const decideAction = (input: DecideActionInput): ActionDecision => {
  if (input.apiManaged) return { action: "skip", reason: "api-managed" };
  if (input.force) return { action: "translate", reason: "force" };
  if (input.existingEn === null) return { action: "translate" };
  const hashMatch = input.existingEn.sourceHash === input.ruHash;
  if (input.existingEn.manuallyEdited) {
    return hashMatch
      ? { action: "skip", reason: "manual-fresh" }
      : { action: "warn", reason: "manual-stale" };
  }
  return hashMatch ? { action: "skip", reason: "cache-hit" } : { action: "translate" };
};
