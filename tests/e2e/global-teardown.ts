import type { FullConfig } from "@playwright/test";
import { removeScratchPosts } from "./global-setup";

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  await removeScratchPosts();
}
