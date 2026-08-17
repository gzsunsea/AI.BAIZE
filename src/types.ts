export type Item = {
  id: string;
  url: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceKind: string;
  sourceId?: string;
  author?: string | null;
  publishedAt: string;
  score: number;
  tags: string[];
  reason: string;
  media?: { url?: string; type?: string; thumbnail?: string; alt?: string }[];
  channel?: string;
  channelLabel?: string;
  category?: string;
  categoryLabel?: string;
  eventId?: string;
  scoreBreakdown?: { key: string; label: string; value: number }[];
  mpMetrics?: { reads: number; likes: number; shares: number; abnormal: number };
  mpTitle?: string;
  mpMeta?: {
    accountType: string;
    accountLabel: string;
    accountWeight: number;
    metricSource: string;
    metricLabel: string;
    titleEdited?: boolean;
    qualityTier?: string;
    qualityLabel?: string;
    qualityRank?: number;
    trendKey?: string;
    trendLabel?: string;
    editorNote?: string;
  };
  related?: { count: number; sources: string[]; topScore: number };
  editorialBrief?: { fact?: string; impact?: string; scenario?: string } | null;
  hidden?: boolean;
  pinned?: boolean;
};

export type Stats = {
  total: number;
  selected: number;
  sources: number;
  refreshedAt: string | null;
  tags: { tag: string; count: number }[];
  channels?: { channel: string; count: number }[];
  clusters?: { id: string; title: string; size: number; sources: string[]; topScore: number }[];
  healthySources?: number;
  failingSources?: number;
  runs: { at: string; fetched: number; total: number; errors: { source: string; message: string }[] }[];
};

export type MpArticle = {
  id: string;
  title: string;
  url: string;
  account: string;
  publishedAt: string;
  summary?: string;
  reads: number;
  likes: number;
  shares: number;
  accountBaseline: number;
  original?: boolean;
};

export type DailyDigest = {
  id?: string;
  generatedAt: string;
  issueKey?: string;
  issueLabel?: string;
  issueTime?: string;
  headline: string;
  summary: string;
  items: Item[];
  sections: { key: string; title: string; items: Item[] }[];
  excludedFromEarlierToday?: number;
  fromSnapshot?: boolean;
  virtual?: boolean;
};

export type ApiState = {
  items: Item[];
  sources: {
    id: string;
    name: string;
    kind: string;
    url: string;
    enabled: boolean;
    tier?: string;
    priorityTier?: string;
    preferred?: boolean;
    noisePenalty?: number;
    maxHandles?: number;
    perHandleMaxAttempts?: number;
    mirrorTimeoutMs?: number;
    health?: { ok: boolean; count: number; attempts: number; durationMs: number; checkedAt: string; message?: string } | null;
  }[];
  clusters?: Stats["clusters"];
  feedback?: { id: string; message: string; contact?: string; page?: string; status: string; createdAt: string }[];
  dailyDigests?: { id: string; headline: string; generatedAt: string; sections: { title: string; items: Item[] }[] }[];
  mpArticles?: MpArticle[];
  runs: Stats["runs"];
  settings: { refreshedAt: string | null; cron: string; rules?: { selectedThreshold: number; selectedCommunityLimit?: number; selectedXShare?: number; selectedCnSourceLimit?: number; maxItems: number; rssLimit: number } };
};

export type MpDigest = {
  items: Array<Item & Partial<MpArticle> & { account?: string }>;
  groups?: { key: string; label: string; count: number }[];
  trends?: { key: string; label: string; count: number }[];
  tiers?: { key: string; label: string; count: number }[];
  note: string;
  refreshedAt?: string | null;
};

export type AskResult = {
  command: string;
  answer: string;
  grounded: boolean;
  citations: { id: string; index: number; title: string; sourceName: string; sourceType: string; publishedAt: string; url: string }[];
};

export type SavedEntry = { item: Item; savedAt: string };

export type HotRules = {
  version: number;
  windowHours: number;
  trendAvailable: boolean;
};

export type HotTopic = {
  id: string;
  rank: number;
  title: string;
  heat: number;
  status: "new" | "active";
  ageHours?: number;
  sourceCount: number;
  sources: string[];
  topScore: number;
  publishedAt: string;
  representative: Item;
  relatedItems: Item[];
  rules: HotRules;
};

export type StoryDetail = {
  event: Omit<HotTopic, "relatedItems">;
  summary: string;
  latestUpdates: Item[];
  timeline: Item[];
  sources: string[];
  rules: HotRules;
};

export type SearchState = {
  query: string;
  mode: "direct" | "full";
  sort: "published_desc" | "relevance";
};

export type Report = {
  period: "daily" | "weekly" | "monthly";
  issueId: string;
  range: { start: string; end: string };
  coverage: { complete: boolean; days: number; requiredDays: number; start: string | null; end: string | null };
  headline: string;
  storyCount: number;
  estimatedReadingMinutes: number;
  themes: { key: string; label: string; count: number }[];
  sections: { key: string; title: string; items: Item[] }[];
  navigation: { previousDate: string; nextDate: string | null };
};

export type AppMode =
  | "selected"
  | "all"
  | "reports"
  | "reading"
  | "ask"
  | "topic-models"
  | "topic-agents"
  | "topic-opensource"
  | "topic-education"
  | "topic-culture"
  | "mp"
  | "agent"
  | "about"
  | "admin";
