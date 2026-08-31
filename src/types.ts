export type EvidenceMeta = {
  evidenceLevel: "first_party" | "multi_source" | "expert_analysis" | "single_source" | "unverified";
  evidenceLabel: string;
  evidenceGaps: string[];
  creatorValue: string;
  generatedBy: "rules" | "local_llm" | "editor";
};

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
  content?: string;
  raw?: { content?: string; description?: string } | null;
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
  evidenceMeta?: EvidenceMeta;
  hidden?: boolean;
  pinned?: boolean;
};

export type TodaySignal = Item & {
  latestAt: string;
  sourceCount: number;
  sources: string[];
  status: "new" | "active";
  creatorValue: string;
  evidenceMeta: EvidenceMeta;
  representative: Item;
  relatedItems: Item[];
};

export type TodaySignalsResponse = {
  generatedAt: string;
  limit: number;
  issueLabel: string;
  summary: string;
  selectionNote: string;
  items: TodaySignal[];
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

export type FeedbackKind = "useful" | "duplicate" | "verify";

export type SavedEntry = { item: Item; savedAt: string };

export type HotRules = {
  version: number;
  windowHours: number;
  trendAvailable: boolean;
  components: {
    sourceQualityScore: { description: string; cap: number };
    sourceCountBonus: { description: string; perAdditionalSource: number; cap: number };
    freshnessBonus: { description: string; initial: number; decayHours: number; floor: number };
    selectedScoreBonus: { description: string; divisor: number; cap: number };
  };
  tierWeights: Record<string, number>;
};

export type EventLifecycle = {
  state: "emerging" | "confirmed" | "developing" | "stale";
  label: string;
  firstSeenAt: string;
  lastUpdatedAt: string;
  nextCheck: string;
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
  latestAt: string;
  summary: string;
  representative: Item;
  relatedItems: Item[];
  rules: HotRules;
  lifecycle?: EventLifecycle | null;
};

export type StoryDetail = {
  event: Omit<HotTopic, "relatedItems">;
  summary: string;
  latestUpdates: Item[];
  timeline: Item[];
  sources: string[];
  lifecycle?: {
    state: "emerging" | "confirmed" | "developing" | "stale";
    label: string;
    firstSeenAt: string;
    lastUpdatedAt: string;
    nextCheck: string;
  } | null;
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
  editorialSummary: string;
  storyCount: number;
  estimatedReadingMinutes: number;
  themes: { key: string; label: string; count: number }[];
  trendLines: {
    key: string;
    label: string;
    count: number;
    eventCount: number;
    sourceCount: number;
    latestAt: string | null;
    evidenceLevel: EvidenceMeta["evidenceLevel"];
    sampleItems: Item[];
  }[];
  watchItems: Item[];
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
