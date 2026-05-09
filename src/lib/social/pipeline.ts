import type { Article, CriticNote, Draft, SocialChannel } from "./types.js";
import type { Result } from "./errors.js";
import { writeXEn } from "./writers/x-en.js";
import { writeLiEn } from "./writers/linkedin-en.js";
import { writeTgRu } from "./writers/telegram-ru.js";
import { editXEn } from "./editors/x-en.js";
import { editLiEn } from "./editors/linkedin-en.js";
import { editTgRu } from "./editors/telegram-ru.js";
import { runCritic } from "./critic.js";

type WriterFn = (ctx: { article: Article }) => Promise<Result<Draft>>;
type EditorFn = (article: Article, draft: Draft) => Promise<Result<Draft>>;

const writers: Record<SocialChannel, WriterFn> = {
  x_en: writeXEn,
  li_en: writeLiEn,
  tg_ru: writeTgRu,
};

const editors: Record<SocialChannel, EditorFn> = {
  x_en: editXEn,
  li_en: editLiEn,
  tg_ru: editTgRu,
};

export type PipelineOutput = {
  drafts: Partial<Record<SocialChannel, Result<Draft>>>;
  annotations: Record<SocialChannel, CriticNote[]>;
};

const EMPTY_NOTES: Record<SocialChannel, CriticNote[]> = { x_en: [], li_en: [], tg_ru: [] };

export const runPipeline = async (args: {
  article: Article;
  channels: SocialChannel[];
}): Promise<PipelineOutput> => {
  // Stage 1: parallel writers
  const writerOut = await Promise.all(
    args.channels.map(async (ch) => [ch, await writers[ch]({ article: args.article })] as const),
  );

  // Stage 2: parallel editors (only for successful writers)
  const editorOut = await Promise.all(
    writerOut.map(async ([ch, r]) => {
      if (!r.ok) return [ch, r] as const;
      return [ch, await editors[ch](args.article, r.value)] as const;
    }),
  );

  // Stage 3: critic on successful drafts only
  const validDrafts: { channel: SocialChannel; draft: Draft }[] = [];
  for (const [ch, r] of editorOut) {
    if (r.ok) validDrafts.push({ channel: ch, draft: r.value });
  }

  const annotations =
    validDrafts.length > 0 ? await runCritic(args.article, validDrafts) : { ...EMPTY_NOTES };

  const drafts: PipelineOutput["drafts"] = {};
  for (const [ch, r] of editorOut) {
    drafts[ch] = r;
  }

  return { drafts, annotations };
};
