export const MIN_INDEXABLE_TAG_POSTS = 2;

export const isTagArchiveIndexable = (posts: readonly unknown[]): boolean =>
  posts.length >= MIN_INDEXABLE_TAG_POSTS;
