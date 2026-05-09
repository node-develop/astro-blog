import { ok, err, transportError, policyError, contentError } from "../errors.js";
import type { Result } from "../errors.js";

const apiUrl = "https://api.linkedin.com/rest/posts";

const headers = (): Record<string, string> => ({
  Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN ?? ""}`,
  "LinkedIn-Version": "202601",
  "X-Restli-Protocol-Version": "2.0.0",
  "Content-Type": "application/json",
});

export const postShare = async (opts: {
  text: string;
}): Promise<Result<{ id: string; url: string }>> => {
  const body = {
    author: process.env.LINKEDIN_PERSON_URN ?? "",
    commentary: opts.text,
    visibility: "PUBLIC" as const,
    distribution: {
      feedDistribution: "MAIN_FEED" as const,
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED" as const,
    isReshareDisabledByAuthor: false,
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (response.ok) {
    const id = response.headers.get("x-restli-id");
    if (!id) return err(contentError("li_en", "missing x-restli-id header"));
    return ok({
      id,
      url: `https://www.linkedin.com/feed/update/${id}/`,
    });
  }

  const errBody = await response.text();
  if (response.status === 401 || response.status === 403) {
    return err(policyError("li_en", `${response.status} ${errBody.slice(0, 200)}`));
  }
  return err(transportError("li_en", response.status, errBody));
};
