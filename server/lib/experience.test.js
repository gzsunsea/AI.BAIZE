const assert = require("node:assert/strict");
const test = require("node:test");

const { buildEventLifecycle, buildHotTopics, buildReport, buildStory, buildTodaySignals } = require("./experience");

function signal(id, eventId, sourceId, score = 90, extra = {}) {
  return {
    id,
    url: `https://example.com/${id}`,
    eventId,
    sourceId,
    sourceName: sourceId,
    title: `${eventId} ${id}`,
    score,
    publishedAt: "2026-07-22T03:00:00.000Z",
    ...extra,
  };
}

test("today signals return at most five recent curated representative events", () => {
  const now = new Date();
  const result = buildTodaySignals({
    items: [
      signal("official", "event-a", "official", 90, { priorityTier: "official_first_party", title: "Official AI model release", summary: "Official AI model and API release for creators.", publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() }),
      signal("expert", "event-a", "expert", 85, { priorityTier: "expert_rss", title: "Expert AI workflow analysis", summary: "Expert analysis of the AI model workflow and deployment.", publishedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString() }),
      signal("reference", "event-b", "reference", 99, { priorityTier: "reference", title: "Reference AI model copy", summary: "Reference copy of an AI model announcement.", publishedAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString() }),
      signal("single", "event-c", "single", 88, { priorityTier: "expert_rss", title: "Single-source AI creator tool analysis", summary: "Expert analysis of an AI creator tool.", publishedAt: new Date(now.getTime() - 16 * 60 * 60 * 1000).toISOString() }),
    ],
    clusters: [
      { id: "event-a", items: ["official", "expert"] },
      { id: "event-b", items: ["reference"] },
    ],
    settings: { rules: { selectedThreshold: 72 } },
  }, { now, limit: 5 });

  assert.deepEqual(result.items.map((item) => item.id), ["event-a", "event-c"]);
  assert.equal(result.items[0].sourceCount, 2);
  assert.equal(result.items[0].evidenceMeta.evidenceLevel, "multi_source");
  assert.equal(result.issueLabel, "今日先看");
  assert.match(result.summary, /2 条/);
  assert.match(result.selectionNote, /信源质量/);
});

test("today signals prefer the first-party representative without demoting event rank or dropping coverage", () => {
  const now = new Date();
  const publishedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const items = [
    signal("event-a-official", "event-a", "official", 88, {
      priorityTier: "official_first_party",
      title: "Official AI model launch",
      summary: "The model maker officially announced a new AI model and API release.",
      publishedAt,
    }),
    signal("event-a-media", "event-a", "media", 94, {
      priorityTier: "expert_rss",
      preferred: true,
      title: "Media analysis of the AI model launch",
      summary: "A report analyzes the newly announced AI model and its API capabilities.",
      publishedAt,
    }),
    signal("event-b-one", "event-b", "source-one", 94, {
      priorityTier: "expert_rss",
      title: "Expert analysis of AI agent deployment",
      summary: "An expert examines how a new AI agent handles long-running deployment tasks.",
      publishedAt,
    }),
    signal("event-b-two", "event-b", "source-two", 94, {
      priorityTier: "expert_rss",
      title: "AI agent deployment update",
      summary: "A report covers a new AI agent deployment and its workflow integrations.",
      publishedAt,
    }),
  ];
  const result = buildTodaySignals({
    items,
    clusters: [
      { id: "event-a", items: ["event-a-official", "event-a-media"] },
      { id: "event-b", items: ["event-b-one", "event-b-two"] },
    ],
  }, { now, selectedThreshold: 72, limit: 5 });

  assert.deepEqual(result.items.map((item) => item.id), ["event-a", "event-b"]);
  assert.equal(result.items[0].representative.id, "event-a-official");
  assert.deepEqual(result.items[0].relatedItems.map((item) => item.id).sort(), ["event-a-media", "event-a-official"]);
  assert.equal(result.items[0].sourceCount, 2);
});

test("today issue metadata reports an honest empty state", () => {
  const result = buildTodaySignals({ items: [], clusters: [], settings: { rules: { selectedThreshold: 72 } } }, { now: "2026-08-28T04:00:00.000Z", limit: 5 });
  assert.equal(result.issueLabel, "今日暂无可用信号");
  assert.match(result.summary, /没有达到精选门槛/);
  assert.match(result.selectionNote, /不降级/);
});

test("today signals do not pad an insufficient candidate pool or repeat an event", () => {
  const result = buildTodaySignals({
    items: [
      signal("only", "event-only", "expert", 84, {
        priorityTier: "expert_rss",
        title: "Single-source AI workflow analysis",
        summary: "Expert analysis of an AI workflow.",
        publishedAt: "2026-08-28T02:00:00.000Z",
      }),
      signal("old", "event-old", "official", 99, {
        priorityTier: "official_first_party",
        title: "Old AI model release",
        summary: "An old official AI model release.",
        publishedAt: "2026-08-25T02:00:00.000Z",
      }),
    ],
    clusters: [],
    settings: { rules: { selectedThreshold: 72 } },
  }, { now: "2026-08-28T04:00:00.000Z", limit: 5 });
  assert.ok(result.items.length <= 1);
  assert.equal(new Set(result.items.map((item) => item.id)).size, result.items.length);
});

test("public hot topics and stories exclude hidden and non-public cluster members", () => {
  const publicOne = signal("public-1", "event-a", "public-one", 80);
  const publicTwo = signal("public-2", "event-a", "public-two", 79);
  const hiddenRepresentative = signal("hidden", "event-a", "private-source", 100, { hidden: true });
  const invalidRepresentative = signal("invalid", "event-a", "invalid-source", 99, { url: "javascript:alert(1)" });
  const hiddenOnlySecondSource = signal("single-hidden", "event-hidden", "private-second", 98, { hidden: true });
  const invalidOnlySecondSource = signal("single-invalid", "event-invalid", "invalid-second", 98, { url: "/relative" });
  const state = {
    items: [
      publicOne,
      publicTwo,
      hiddenRepresentative,
      invalidRepresentative,
      signal("single-public-hidden", "event-hidden", "only-public", 90),
      hiddenOnlySecondSource,
      signal("single-public-invalid", "event-invalid", "only-public", 90),
      invalidOnlySecondSource,
    ],
    clusters: [
      { id: "event-a", items: ["hidden", "invalid", "public-1", "public-2"] },
      { id: "event-hidden", items: ["single-public-hidden", "single-hidden"] },
      { id: "event-invalid", items: ["single-public-invalid", "single-invalid"] },
    ],
  };

  const hot = buildHotTopics(state, { now: "2026-07-22T04:00:00.000Z" });
  assert.deepEqual(hot.items.map((topic) => topic.id), ["event-a"]);
  assert.equal(hot.items[0].representative.id, "public-1");
  assert.deepEqual(hot.items[0].relatedItems.map((item) => item.id), ["public-1", "public-2"]);
  assert.deepEqual(hot.items[0].sources, ["public-one", "public-two"]);

  const story = buildStory(state, "event-a", { now: "2026-07-22T04:00:00.000Z" });
  assert.deepEqual(story.timeline.map((item) => item.id), ["public-1", "public-2"]);
  assert.equal(buildStory(state, "event-hidden", { now: "2026-07-22T04:00:00.000Z" }), null);
  assert.equal(buildStory(state, "event-invalid", { now: "2026-07-22T04:00:00.000Z" }), null);
});

test("public hot ranking and derived fields use only filtered public members", () => {
  const hidden = signal("private-leader", "event-a", "private", 100, { hidden: true });
  const state = {
    items: [
      hidden,
      signal("a1", "event-a", "public-a1", 80),
      signal("a2", "event-a", "public-a2", 79),
      signal("b1", "event-b", "public-b1", 90),
      signal("b2", "event-b", "public-b2", 89),
    ],
    clusters: [
      { id: "event-a", title: hidden.title, topScore: 100, items: ["private-leader", "a1", "a2"] },
      { id: "event-b", title: "Precomputed Event B", topScore: 90, items: ["b1", "b2"] },
    ],
  };

  const hot = buildHotTopics(state, { now: "2026-07-22T04:00:00.000Z" });

  assert.deepEqual(hot.items.map((topic) => topic.id), ["event-b", "event-a"]);
  const eventA = hot.items.find((topic) => topic.id === "event-a");
  assert.equal(eventA.title, "event-a a1");
  assert.equal(eventA.topScore, 80);
  assert.equal(eventA.summary, "event-a a1");
});

test("hot topics expose rank, heat, status, and a transparent rules version", () => {
  const result = buildHotTopics({
    items: [
      signal("a1", "event-a", "openai", 91, { publishedAt: "2026-08-17T03:00:00.000Z" }),
      signal("a2", "event-a", "simon", 88, { publishedAt: "2026-08-17T02:00:00.000Z" }),
    ],
    clusters: [{ id: "event-a", title: "Event A", items: ["a1", "a2"] }],
  }, { now: "2026-08-17T04:00:00.000Z" });

  assert.equal(result.windowHours, 72);
  assert.equal(result.rules.version, 1);
  assert.deepEqual(Object.keys(result.rules.components), ["sourceQualityScore", "sourceCountBonus", "freshnessBonus", "selectedScoreBonus"]);
  assert.equal(result.rules.tierWeights.official_first_party, 12);
  assert.equal(result.items[0].rank, 1);
  assert.equal(typeof result.items[0].heat, "number");
  assert.equal(["new", "rising", "active"].includes(result.items[0].status), true);
});

test("hot topics expose display source names, latest activity, and representative summary", () => {
  const result = buildHotTopics({
    items: [
      signal("a1", "event-a", "source-id-one", 91, { sourceName: "Official One", summary: "Representative summary", publishedAt: "2026-08-17T01:00:00.000Z" }),
      signal("a2", "event-a", "source-id-two", 88, { sourceName: "Expert Two", publishedAt: "2026-08-17T03:00:00.000Z" }),
    ],
    clusters: [{ id: "event-a", title: "Event A", items: ["a1", "a2"] }],
  }, { now: "2026-08-17T04:00:00.000Z" });

  assert.deepEqual(result.items[0].sources, ["Official One", "Expert Two"]);
  assert.equal(result.items[0].latestAt, "2026-08-17T03:00:00.000Z");
  assert.equal(typeof result.items[0].representative.summary, "string");
});

test("hot topics use persisted cluster sources after dedupe", () => {
  const item = signal("representative", "event-deduped", "OpenAI News", 90, {
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  });
  const result = buildHotTopics({
    items: [item],
    clusters: [{ id: "event-deduped", items: [item.id], sources: ["OpenAI News", "Simon Willison"], duplicateCount: 4 }],
  }, { now: "2026-08-31T04:00:00.000Z" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sourceCount, 2);
  assert.deepEqual(result.items[0].sources, ["OpenAI News", "Simon Willison"]);
  assert.equal(result.candidates.length, 0);
});

test("hot topics expose selected single-source candidates without calling them confirmed", () => {
  const item = signal("candidate", "event-candidate", "OpenAI News", 90, {
    title: "Official AI model release",
    summary: "Official AI model and API release for creators.",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  });
  const result = buildHotTopics({ items: [item], clusters: [], settings: { rules: { selectedThreshold: 60 } } }, {
    now: "2026-08-31T04:00:00.000Z",
    selectedThreshold: 60,
  });
  assert.equal(result.items.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, "emerging");
  assert.equal(result.candidates[0].availability, "candidate");
  assert.equal(result.candidates[0].evidenceMeta.evidenceLevel, "single_source");
});

test("hot candidates cap one source, exclude reference and low-quality content, and avoid duplicates", () => {
  const good = Array.from({ length: 4 }, (_, index) => signal(`good-${index}`, `event-good-${index}`, "OpenAI News", 92 - index, {
    title: `Official AI model release ${index}`,
    summary: "Official AI model and API release for creators.",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  }));
  const secondSource = signal("good-other", "event-good-other", "Simon Willison", 80, {
    title: "Expert AI workflow analysis",
    summary: "Expert analysis of the AI model workflow and deployment.",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "expert_rss",
  });
  const reference = signal("reference", "event-reference", "AIHOT", 99, {
    title: "Reference AI model copy",
    summary: "Reference copy of an AI model announcement.",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "reference",
  });
  const weak = signal("weak", "event-weak", "OpenAI News", 99, {
    title: "手机发布会价格与外观点评",
    summary: "手机产品价格与外观的行业点评。",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  });
  const result = buildHotTopics({ items: [...good, secondSource, reference, weak], clusters: [] }, {
    now: "2026-08-31T04:00:00.000Z",
    selectedThreshold: 72,
  });
  assert.ok(result.candidates.length <= 5);
  assert.ok(result.candidates.filter((item) => item.sourceName === "OpenAI News").length <= 2);
  assert.equal(result.candidates.some((item) => item.id === "reference"), false);
  assert.equal(result.candidates.some((item) => item.id === "weak"), false);
  assert.equal(new Set(result.candidates.map((item) => item.id)).size, result.candidates.length);
});

test("story detail returns newest updates first and null for unknown ids", () => {
  const state = {
    items: [
      signal("old", "event-a", "one", 80, { publishedAt: "2026-08-16T01:00:00.000Z" }),
      signal("new", "event-a", "two", 85, { publishedAt: "2026-08-17T01:00:00.000Z" }),
    ],
    clusters: [{ id: "event-a", title: "Event A", items: ["old", "new"] }],
  };
  const story = buildStory(state, "event-a", { now: "2026-08-17T04:00:00.000Z", enrichItem: (item) => item });
  assert.deepEqual(story.timeline.map((item) => item.id), ["new", "old"]);
  assert.equal(story.latestUpdates[0].id, "new");
  assert.equal(buildStory(state, "missing", {}), null);
});

test("story exposes strict related-event candidates separately from confirmed evidence", () => {
  const anchor = signal("anchor-one", "event-confirmed", "Claude Devs", 92, {
    title: "Claude Code will gracefully stop when the five-hour limit is reached",
    priorityTier: "preferred_x",
    publishedAt: "2026-08-17T03:00:00.000Z",
  });
  const confirming = signal("anchor-two", "event-confirmed", "Simon Willison", 88, {
    title: "Claude Code will gracefully stop when the five-hour limit is reached",
    priorityTier: "expert_rss",
    publishedAt: "2026-08-17T02:00:00.000Z",
  });
  const related = signal("related-candidate", "event-unconfirmed", "IT之家 AI", 82, {
    title: "Claude Code 启用新机制：任务中途触发5小时上限后改为寻找合适收尾点",
    priorityTier: "cn_media",
    publishedAt: "2026-08-17T03:30:00.000Z",
  });
  const unrelated = signal("unrelated-update", "event-unrelated", "Claude Code Releases", 84, {
    title: "Claude Code Releases v2.1.283: fixes terminal redraw behavior",
    priorityTier: "official_first_party",
    publishedAt: "2026-08-17T03:40:00.000Z",
  });
  const hidden = signal("hidden-match", "event-hidden", "Hidden Source", 99, {
    title: related.title,
    priorityTier: "expert_rss",
    hidden: true,
    publishedAt: "2026-08-17T03:35:00.000Z",
  });
  const stale = signal("stale-match", "event-stale", "Old Source", 99, {
    title: related.title,
    priorityTier: "expert_rss",
    publishedAt: "2026-08-10T03:00:00.000Z",
  });
  const state = {
    items: [anchor, confirming, related, unrelated, hidden, stale],
    clusters: [{ id: "event-confirmed", items: [anchor.id, confirming.id] }],
  };
  const now = "2026-08-17T04:00:00.000Z";

  const story = buildStory(state, "event-confirmed", { now });
  const hot = buildHotTopics(state, { now });

  assert.deepEqual(story.relatedCandidates.map((candidate) => candidate.item.id), [related.id]);
  assert.match(story.relatedCandidates[0].reason, /尚未确认/);
  assert.equal(story.event.sourceCount, 2);
  assert.equal(story.event.heat, hot.items[0].heat);
  assert.equal(Object.hasOwn(story.event, "relatedCandidates"), false);
});

test("story surfaces the September DNS sandbox training-pause match without merging the July Hugging Face incident", () => {
  const now = "2026-09-27T01:00:00.000Z";
  const anchor = signal("openai-pause-anchor", "event-confirmed", "IT之家（RSS）", 92, {
    title: "OpenAI 因多起模型失控事件暂停最强模型训练",
    summary: "OpenAI 在多起模型行为失控报告增加后，暂停了旗下能力最强模型的训练。9 月 20 日一款沙盒测试中的模型利用漏洞获得互联网访问权限，截至 9 月 25 日所有涉及工具使用的训练、评估和推理工作仍处暂停状态。",
    priorityTier: "cn_media",
    publishedAt: "2026-09-26T22:52:43.000Z",
  });
  const confirming = signal("openai-pause-confirming", "event-confirmed", "OpenAI Alignment", 90, {
    title: "An agent used DNS to reach an external chatbot",
    summary: "An agent queried a public chatbot through insufficient DNS filtering in its training sandbox on Sep 20. All training, evaluation, and inference with tool-use remain paused.",
    priorityTier: "official_first_party",
    publishedAt: "2026-09-26T22:45:00.000Z",
  });
  const related = signal("openai-pause-related", "event-unconfirmed", "The Verge：AI（RSS）", 84, {
    title: "OpenAI 暂停其最强模型的训练，此前沙盒中的模型利用漏洞接入互联网",
    summary: "OpenAI 在沙盒测试中的模型于 9 月 20 日利用漏洞接入互联网后，决定暂停其最强模型训练，截至 9 月 25 日晚所有涉及工具使用的训练、评估和推理仍处暂停状态。",
    priorityTier: "expert_rss",
    publishedAt: "2026-09-26T16:34:59.000Z",
  });
  const previous = signal("openai-july-hf", "event-old", "July Security Report", 86, {
    title: "OpenAI AI 智能体突破沙箱并入侵 Hugging Face",
    summary: "7 月 20 日数千个 AI 智能体突破沙盒并攻击 Hugging Face，OpenAI 随后暂停强化学习训练两周。",
    priorityTier: "expert_rss",
    publishedAt: "2026-09-26T23:10:00.000Z",
  });
  const story = buildStory({
    items: [anchor, confirming, related, previous],
    clusters: [{ id: "event-confirmed", items: [anchor.id, confirming.id] }],
  }, "event-confirmed", { now });

  assert.deepEqual(story.relatedCandidates.map((candidate) => candidate.item.id), [related.id]);
  assert.equal(story.relatedCandidates[0].eventType, "sandbox_escape_training_pause");
});

test("story surfaces named product-release matches as unconfirmed candidates without crossing event boundaries", () => {
  const now = "2026-09-27T01:00:00.000Z";
  const perplexityAnchor = signal("perplexity-anchor", "perplexity-amd", "Perplexity Blog", 94, {
    title: "Portable Computer comes to AMD-powered agentic PCs",
    summary: "Perplexity expands Portable Computer to AMD Ryzen AI Max systems.",
    priorityTier: "official_first_party",
    publishedAt: "2026-09-26T22:00:00.000Z",
  });
  const perplexityConfirming = signal("perplexity-confirming", "perplexity-amd", "Perplexity News", 90, {
    title: "Perplexity Portable Computer AMD support is now available",
    summary: "Portable Computer on AMD Ryzen AI Max processors is available today.",
    priorityTier: "official_first_party",
    publishedAt: "2026-09-26T21:30:00.000Z",
  });
  const perplexityCandidate = signal("perplexity-candidate", "perplexity-amd-unconfirmed", "Perplexity X", 86, {
    title: "Perplexity 推出 Windows 便携电脑",
    summary: "Portable Computer 现已在 AMD Ryzen AI Max 系列处理器上推出，可在本地运行 AI 智能体。",
    priorityTier: "preferred_x",
    publishedAt: "2026-09-26T23:00:00.000Z",
  });
  const perplexityNegative = signal("perplexity-negative", "perplexity-linux", "Perplexity Linux", 84, {
    title: "Perplexity Portable Computer adds Linux RTX support",
    summary: "Portable Computer is now available for Linux PCs with supported NVIDIA RTX GPUs.",
    priorityTier: "official_first_party",
    publishedAt: "2026-09-26T22:30:00.000Z",
  });
  const odysseyAnchor = signal("odyssey-anchor", "odyssey-agora-2", "Odyssey Blog", 94, {
    title: "Introducing Agora-2: Advancing Multi-Agent World Simulation",
    summary: "Agora-2 supports up to 20 humans and agents in a shared interactive world.",
    priorityTier: "official_first_party",
    publishedAt: "2026-09-26T20:00:00.000Z",
  });
  const odysseyConfirming = signal("odyssey-confirming", "odyssey-agora-2", "Odyssey News", 90, {
    title: "Odyssey releases Agora-2 multi-agent world model",
    summary: "Agora-2 is a playable research preview for up to 20 humans and agents.",
    priorityTier: "official_first_party",
    publishedAt: "2026-09-26T19:30:00.000Z",
  });
  const odysseyCandidate = signal("odyssey-candidate", "odyssey-agora-2-unconfirmed", "Odyssey X", 86, {
    title: "Odyssey 发布多智能体世界模型 Agora-2，支持最多 20 个人类与智能体实时共享模拟环境",
    priorityTier: "preferred_x",
    publishedAt: "2026-09-26T23:30:00.000Z",
  });
  const odysseyNegative = signal("odyssey-negative", "odyssey-3", "Odyssey-3 News", 84, {
    title: "Odyssey launches Odyssey-3, a single-agent world model",
    priorityTier: "expert_rss",
    publishedAt: "2026-09-26T22:30:00.000Z",
  });
  const state = {
    items: [
      perplexityAnchor, perplexityConfirming, perplexityCandidate, perplexityNegative,
      odysseyAnchor, odysseyConfirming, odysseyCandidate, odysseyNegative,
    ],
    clusters: [
      { id: "perplexity-amd", items: [perplexityAnchor.id, perplexityConfirming.id] },
      { id: "odyssey-agora-2", items: [odysseyAnchor.id, odysseyConfirming.id] },
    ],
  };
  const perplexityStory = buildStory(state, "perplexity-amd", { now });
  const odysseyStory = buildStory(state, "odyssey-agora-2", { now });

  assert.deepEqual(perplexityStory.timeline.map((item) => item.id), [perplexityAnchor.id, perplexityConfirming.id]);
  assert.deepEqual(perplexityStory.relatedCandidates.map((candidate) => candidate.item.id), [perplexityCandidate.id]);
  assert.equal(perplexityStory.relatedCandidates[0].eventType, "perplexity_portable_computer_amd_support");
  assert.match(perplexityStory.relatedCandidates[0].reason, /尚未确认/);
  assert.deepEqual(odysseyStory.timeline.map((item) => item.id), [odysseyAnchor.id, odysseyConfirming.id]);
  assert.deepEqual(odysseyStory.relatedCandidates.map((candidate) => candidate.item.id), [odysseyCandidate.id]);
  assert.equal(odysseyStory.relatedCandidates[0].eventType, "odyssey_agora_2_release");
  assert.match(odysseyStory.relatedCandidates[0].reason, /尚未确认/);
});

test("reports keep related cross-language candidates separate until an event is confirmed", () => {
  const anchor = signal("anchor-en", "event-english", "Claude Devs", 92, {
    title: "Claude Code will gracefully stop when the five-hour limit is reached",
    priorityTier: "preferred_x",
    publishedAt: "2026-08-17T03:00:00.000Z",
  });
  const confirming = signal("anchor-confirming", "event-confirmed", "Simon Willison", 88, {
    title: "Claude Code will gracefully stop when the five-hour limit is reached",
    priorityTier: "expert_rss",
    publishedAt: "2026-08-17T02:00:00.000Z",
  });
  const candidate = signal("candidate-zh", "event-chinese", "IT之家 AI", 82, {
    title: "Claude Code 启用新机制：任务中途触发5小时上限后改为寻找合适收尾点",
    priorityTier: "cn_media",
    publishedAt: "2026-08-17T03:30:00.000Z",
  });
  const story = buildStory({
    items: [anchor, confirming, candidate],
    clusters: [{ id: "event-confirmed", items: [anchor.id, confirming.id] }],
  }, "event-confirmed", { now: "2026-08-17T04:00:00.000Z" });
  const digestItems = [anchor, candidate].map(({ id, eventId, title, publishedAt, score, tags }) => ({
    id,
    eventId,
    title,
    publishedAt,
    score,
    tags,
  }));
  const report = buildReport({
    dailyDigests: [digest("2026-08-17T04:00:00.000Z", digestItems)],
  }, { period: "daily", date: "2026-08-17", now: "2026-08-17T05:00:00.000Z" });

  assert.deepEqual(story.relatedCandidates.map((related) => related.item.id), [candidate.id]);
  assert.equal(report.storyCount, 2);
  assert.deepEqual(report.sections[0].items.map((item) => item.eventId), ["event-english", "event-chinese"]);
});

test("story lifecycle distinguishes emerging, confirmed, developing, and stale events", () => {
  const now = new Date("2026-08-31T04:00:00.000Z");
  const makeLifecycle = (items) => buildEventLifecycle(items, now);

  const emerging = makeLifecycle([signal("new", "event", "one", 90, { publishedAt: "2026-08-31T02:00:00.000Z" })]);
  assert.equal(emerging.state, "emerging");
  assert.equal(emerging.label, "刚出现");

  const confirmed = makeLifecycle([
    signal("one", "event", "one", 90, { publishedAt: "2026-08-30T02:00:00.000Z" }),
    signal("two", "event", "two", 88, { publishedAt: "2026-08-31T01:00:00.000Z" }),
  ]);
  assert.equal(confirmed.state, "confirmed");
  assert.equal(confirmed.firstSeenAt, "2026-08-30T02:00:00.000Z");
  assert.equal(confirmed.lastUpdatedAt, "2026-08-31T01:00:00.000Z");

  const developing = makeLifecycle([signal("developing", "event", "one", 90, { publishedAt: "2026-08-30T02:00:00.000Z" })]);
  assert.equal(developing.state, "developing");

  const stale = makeLifecycle([signal("stale", "event", "one", 90, { publishedAt: "2026-08-27T02:00:00.000Z" })]);
  assert.equal(stale.state, "stale");
  assert.match(stale.nextCheck, /不继续扩散/);

  const story = buildStory({ items: [
    signal("one", "event", "one", 90, { publishedAt: "2026-08-31T02:00:00.000Z" }),
    signal("two", "event", "two", 88, { publishedAt: "2026-08-31T01:00:00.000Z" }),
  ], clusters: [{ id: "event", items: ["one", "two"] }] }, "event", { now, enrichItem: (item) => item });
  assert.equal(story.event.lifecycle.state, "confirmed");
});

test("reports expose trend lines with evidence strength and watch items", () => {
  const report = buildReport({
    dailyDigests: [{
      generatedAt: "2026-08-30T04:00:00.000Z",
      sections: [{
        key: "model",
        title: "模型发布/更新",
        items: [
          signal("one", "event-one", "official", 90, { tags: ["Agent", "模型"], priorityTier: "official_first_party", publishedAt: "2026-08-30T03:00:00.000Z" }),
          signal("two", "event-two", "expert", 86, { tags: ["Agent"], priorityTier: "expert_rss", publishedAt: "2026-08-30T02:00:00.000Z" }),
          signal("three", "event-three", "one", 80, { tags: ["研究"], priorityTier: "community_fallback", publishedAt: "2026-08-29T02:00:00.000Z" }),
        ],
      }],
    }],
  }, { period: "weekly", date: "2026-08-30", now: "2026-08-31T04:00:00.000Z" });

  assert.match(report.editorialSummary, /本周/);
  assert.equal(report.trendLines[0].label, "Agent");
  assert.equal(report.trendLines[0].count, 2);
  assert.equal(report.trendLines[0].eventCount, 2);
  assert.equal(typeof report.trendLines[0].evidenceLevel, "string");
  assert.ok(Array.isArray(report.trendLines[0].sampleItems));
  assert.equal(report.watchItems.length, 1);
  assert.equal(report.watchItems[0].id, "three");
});

test("reports exclude reference-only material from public editorial sections and trends", () => {
  const report = buildReport({
    dailyDigests: [{
      generatedAt: "2026-08-30T04:00:00.000Z",
      sections: [{
        key: "model",
        title: "模型",
        items: [
          signal("official", "event-official", "official", 90, { priorityTier: "official_first_party", tags: ["Agent"] }),
          signal("reference", "event-reference", "reference", 99, { priorityTier: "reference", tags: ["Agent"] }),
        ],
      }],
    }],
  }, { period: "weekly", date: "2026-08-30", now: "2026-08-31T04:00:00.000Z" });
  assert.deepEqual(report.sections.flatMap((section) => section.items).map((item) => item.id), ["official"]);
  assert.equal(report.coverStory.id, "official");
  assert.deepEqual(report.trendLines[0].sampleItems.map((item) => item.id), ["official"]);
});

test("hot topics require independent sources and order by evidence before score", () => {
  const items = [
    signal("a1", "event-a", "openai", 91),
    signal("a2", "event-a", "simon", 88),
    signal("c1", "event-c", "source-1", 80),
    signal("c2", "event-c", "source-2", 80),
    signal("c3", "event-c", "source-3", 80),
    signal("b1", "event-b", "media", 99),
  ];
  const result = buildHotTopics({
    items,
    clusters: [
      { id: "event-a", title: "Event A", items: ["a1", "a2"], topScore: 91 },
      { id: "event-b", title: "Event B", items: ["b1"], topScore: 99 },
      { id: "event-c", title: "Event C", items: ["c1", "c2", "c3"], topScore: 80 },
    ],
  }, {
    now: "2026-07-22T04:00:00.000Z",
    selectedThreshold: 80,
    enrichItem: (item) => ({ ...item, enriched: true }),
  });

  assert.deepEqual(result.items.map((item) => item.id), ["event-c", "event-a"]);
  assert.equal(result.items[1].sourceCount, 2);
  assert.equal(result.items[1].representative.id, "a1");
  assert.equal(result.items[1].representative.enriched, true);
});

test("a pinned single-source item appears as an emerging candidate", () => {
  const item = signal("p1", "pinned", "official", 80, { pinned: true });
  const result = buildHotTopics({
    items: [item],
    clusters: [{ id: "pinned", title: "Pinned", items: [item], topScore: 80 }],
  }, {
    now: "2026-07-22T04:00:00.000Z",
    selectedThreshold: 80,
  });

  assert.equal(result.items.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].id, "p1");
  assert.equal(result.candidates[0].availability, "candidate");
});

test("hot topics discard stale items and count duplicate source ids once", () => {
  const items = [
    signal("fresh-1", "fresh", "same", 95),
    signal("fresh-2", "fresh", "same", 94),
    signal("stale-1", "stale", "one", 99, { publishedAt: "2026-07-18T00:00:00.000Z" }),
    signal("stale-2", "stale", "two", 98, { publishedAt: "2026-07-18T00:00:00.000Z" }),
  ];
  const result = buildHotTopics({
    items,
    clusters: [
      { id: "fresh", items: ["fresh-1", "fresh-2"] },
      { id: "stale", items: ["stale-1", "stale-2"] },
    ],
  }, { now: "2026-07-22T04:00:00.000Z" });

  assert.deepEqual(result.items, []);
});

test("hot topics return at most five eligible clusters", () => {
  const items = [];
  const clusters = [];
  for (let index = 0; index < 7; index += 1) {
    const first = signal(`${index}-1`, `event-${index}`, `${index}-source-1`, 90 - index);
    const second = signal(`${index}-2`, `event-${index}`, `${index}-source-2`, 89 - index);
    items.push(first, second);
    clusters.push({ id: `event-${index}`, items: [first.id, second.id] });
  }

  const result = buildHotTopics({ items, clusters }, { now: "2026-07-22T04:00:00.000Z", limit: 5 });

  assert.equal(result.items.length, 5);
  assert.deepEqual(result.items.map((item) => item.id), ["event-0", "event-1", "event-2", "event-3", "event-4"]);
});

test("hot topics default to ten eligible clusters", () => {
  const items = [];
  const clusters = [];
  for (let index = 0; index < 12; index += 1) {
    const first = signal(`${index}-1`, `default-${index}`, `${index}-source-1`, 90 - index);
    const second = signal(`${index}-2`, `default-${index}`, `${index}-source-2`, 89 - index);
    items.push(first, second);
    clusters.push({ id: `default-${index}`, items: [first.id, second.id] });
  }

  const result = buildHotTopics({ items, clusters }, { now: "2026-07-22T04:00:00.000Z" });

  assert.equal(result.items.length, 10);
});

test("story lookup bypasses the hot-list limit", () => {
  const items = [];
  const clusters = [];
  for (let index = 0; index < 11; index += 1) {
    const first = signal(`${index}-1`, `story-${index}`, `${index}-source-1`, 90 - index);
    const second = signal(`${index}-2`, `story-${index}`, `${index}-source-2`, 89 - index);
    items.push(first, second);
    clusters.push({ id: `story-${index}`, items: [first.id, second.id] });
  }

  const story = buildStory({ items, clusters }, "story-10", {
    now: "2026-07-22T04:00:00.000Z",
    enrichItem: (item) => item,
  });

  assert.equal(story.event.id, "story-10");
});

test("story event omits related items and caps latest updates at three", () => {
  const items = Array.from({ length: 4 }, (_, index) => signal(
    `update-${index}`,
    "updates",
    `source-${index}`,
    90 - index,
    { publishedAt: `2026-07-22T0${index}:00:00.000Z` },
  ));
  const story = buildStory({ items, clusters: [{ id: "updates", items: items.map((item) => item.id) }] }, "updates", {
    now: "2026-07-22T04:00:00.000Z",
    enrichItem: (item) => item,
  });

  assert.equal(Object.hasOwn(story.event, "relatedItems"), false);
  assert.equal(story.latestUpdates.length, 3);
  assert.equal(story.timeline.length, 4);
});

test("recognized priority tiers and fallback source tiers affect heat", () => {
  const items = [
    signal("fallback", "fallback", "fallback-source", 80, {
      pinned: true,
      sourceTier: "community",
      priorityTier: "unknown-tier",
    }),
    signal("fallback-second", "fallback", "fallback-second-source", 79, {
      sourceTier: "community",
      priorityTier: "unknown-tier",
    }),
    signal("official", "official", "official-source", 80, {
      pinned: true,
      priorityTier: "official_first_party",
    }),
    signal("official-second", "official", "official-second-source", 79, {
      priorityTier: "official_first_party",
    }),
  ];
  const result = buildHotTopics({
    items,
    clusters: [
      { id: "fallback", items: ["fallback", "fallback-second"] },
      { id: "official", items: ["official", "official-second"] },
    ],
  }, { now: "2026-07-22T04:00:00.000Z", selectedThreshold: 80 });

  const byId = new Map(result.items.map((item) => [item.id, item.heat]));
  assert.ok(byId.get("official") > byId.get("fallback"));
});

function digest(generatedAt, items, key = "product", title = "产品") {
  return { generatedAt, sections: [{ key, title, items }] };
}

test("weekly reports dedupe events and disclose incomplete coverage", () => {
  const shared = { id: "same", eventId: "launch", title: "Launch", score: 90, tags: ["Agent"] };
  const state = {
    dailyDigests: [
      digest("2026-07-20T04:00:00.000Z", [shared]),
      digest("2026-07-21T04:00:00.000Z", [{ ...shared, id: "same-2", score: 92 }]),
    ],
  };

  const report = buildReport(state, { period: "weekly", date: "2026-07-22", now: "2026-07-22T04:00:00.000Z" });

  assert.equal(report.storyCount, 1);
  assert.equal(report.sections[0].items[0].id, "same-2");
  assert.equal(report.coverage.complete, false);
  assert.equal(report.coverage.days, 2);
  assert.equal(report.coverage.requiredDays, 7);
  assert.equal(report.estimatedReadingMinutes, 1);
  assert.deepEqual(report.range, { start: "2026-07-20", end: "2026-07-26" });
});

test("reports keep only the latest digest from each Shanghai date", () => {
  const report = buildReport({
    dailyDigests: [
      digest("2026-07-20T02:00:00.000Z", [{ id: "morning", title: "Morning", score: 80 }]),
      digest("2026-07-20T09:00:00.000Z", [{ id: "evening", title: "Evening", score: 90 }]),
    ],
  }, { period: "daily", date: "2026-07-20", now: "2026-07-22T04:00:00.000Z" });

  assert.deepEqual(report.sections[0].items.map((item) => item.id), ["evening"]);
  assert.equal(report.coverage.complete, true);
});

test("weekly reports use Monday through Sunday and stable editorial section order", () => {
  const report = buildReport({
    dailyDigests: [
      digest("2026-07-20T04:00:00.000Z", [{ id: "paper", title: "Paper", score: 90 }], "research", "研究"),
      digest("2026-07-21T04:00:00.000Z", [{ id: "model", title: "Model", score: 95 }], "model", "模型"),
    ],
  }, { period: "weekly", date: "2026-07-26", now: "2026-07-26T04:00:00.000Z" });

  assert.deepEqual(report.range, { start: "2026-07-20", end: "2026-07-26" });
  assert.deepEqual(report.sections.map((section) => section.key), ["model", "research"]);
  assert.equal(report.headline, "本周值得关注的 2 条 AI 动态");
});

test("current monthly coverage ends on the elapsed local date and handles leap years", () => {
  const report = buildReport({
    dailyDigests: [digest("2028-02-01T04:00:00.000Z", [{ id: "one", title: "One", score: 80 }])],
  }, { period: "monthly", date: "2028-02-10", now: "2028-02-10T04:00:00.000Z" });

  assert.deepEqual(report.range, { start: "2028-02-01", end: "2028-02-29" });
  assert.equal(report.coverage.requiredDays, 10);
  assert.equal(report.coverage.days, 1);
  assert.equal(report.coverage.complete, false);
});

test("reports reject invalid periods and dates", () => {
  assert.throws(() => buildReport({}, { period: "yearly", date: "2026-07-22" }), /invalid period/);
  assert.throws(() => buildReport({}, { period: "daily", date: "22-07-2026" }), /invalid date/);
});

test("reports without a requested date anchor to the latest stored snapshot", () => {
  const report = buildReport({
    dailyDigests: [
      digest("2026-07-09T04:00:00.000Z", [{ id: "older", title: "Older", score: 80 }]),
      digest("2026-07-10T04:00:00.000Z", [{ id: "latest", title: "Latest", score: 90 }]),
    ],
  }, { period: "daily", now: "2026-07-22T04:00:00.000Z" });

  assert.deepEqual(report.range, { start: "2026-07-10", end: "2026-07-10" });
  assert.equal(report.headline, "今日值得关注的 1 条 AI 动态");
});

test("reports use the latest inventory date and fill missing snapshots for every period", () => {
  const items = [
    { id: "monday", title: "Monday signal", score: 88, publishedAt: "2026-07-20T04:00:00.000Z" },
    { id: "latest", title: "Latest signal", score: 96, publishedAt: "2026-07-22T04:00:00.000Z" },
  ];
  const state = {
    items,
    dailyDigests: [digest("2026-05-07T04:00:00.000Z", [{ id: "may", title: "May snapshot", score: 80 }])],
  };
  const buildVirtualDigest = (dateKey) => digest(
    `${dateKey}T04:00:00.000Z`,
    items.filter((item) => item.publishedAt.startsWith(dateKey)),
  );

  const daily = buildReport(state, { period: "daily", now: "2026-07-22T12:00:00.000Z", buildVirtualDigest });
  const weekly = buildReport(state, { period: "weekly", now: "2026-07-22T12:00:00.000Z", buildVirtualDigest });
  const monthly = buildReport(state, { period: "monthly", now: "2026-07-22T12:00:00.000Z", buildVirtualDigest });

  assert.deepEqual(daily.range, { start: "2026-07-22", end: "2026-07-22" });
  assert.equal(daily.storyCount, 1);
  assert.equal(weekly.storyCount, 2);
  assert.equal(monthly.storyCount, 2);
  assert.equal(daily.coverage.complete, true);
});

test("report cover uses a concise issue headline instead of the longest lead story title", () => {
  const longTitle = "steven-jianhao-li/zotero-AI-Butler: 调用大模型自动精读论文库里的论文并总结为笔记";
  const report = buildReport({
    dailyDigests: [digest("2026-07-22T04:00:00.000Z", [{ id: "long", title: longTitle, score: 99 }])],
  }, { period: "daily", date: "2026-07-22", now: "2026-07-22T12:00:00.000Z" });

  assert.equal(report.headline, "今日值得关注的 1 条 AI 动态");
  assert.notEqual(report.headline, longTitle);
});

test("reports choose a deterministic representative from final sections without reordering them", () => {
  const regular = signal("regular", "event-regular", "expert", 99, {
    priorityTier: "expert_rss",
    publishedAt: "2026-07-22T03:00:00.000Z",
  });
  const pinned = signal("pinned", "event-pinned", "community", 60, {
    pinned: true,
    priorityTier: "community_fallback",
    publishedAt: "2026-07-22T02:00:00.000Z",
  });
  const report = buildReport({ dailyDigests: [{
    generatedAt: "2026-07-22T04:00:00.000Z",
    sections: [
      { key: "model", title: "模型", items: [regular] },
      { key: "product", title: "产品", items: [pinned] },
    ],
  }] }, {
    period: "daily",
    date: "2026-07-22",
    now: "2026-07-22T12:00:00.000Z",
  });

  assert.equal(report.coverStory.id, "pinned");
  assert.deepEqual(report.sections.map((section) => [section.key, section.items.map(({ id }) => id)]), [
    ["model", ["regular"]],
    ["product", ["pinned"]],
  ]);
  assert.equal(report.storyCount, 2);
  assert.equal(report.headline, "今日值得关注的 2 条 AI 动态");
});

test("report cover story resolves exact ranking ties by stable item ID", () => {
  const z = signal("z-tie", "event-z", "official", 80, {
    priorityTier: "official_first_party",
    publishedAt: "2026-07-22T01:00:00.000Z",
    title: "Stable AI model announcement",
    summary: "The official announcement describes an AI model release.",
  });
  const a = signal("a-tie", "event-a", "official", 80, {
    priorityTier: "official_first_party",
    publishedAt: "2026-07-22T01:00:00.000Z",
    title: "Stable AI model announcement",
    summary: "The official announcement describes an AI model release.",
  });
  const report = buildReport({ dailyDigests: [digest("2026-07-22T04:00:00.000Z", [z, a])] }, {
    period: "daily",
    date: "2026-07-22",
    now: "2026-07-22T12:00:00.000Z",
  });

  assert.deepEqual(report.sections[0].items.map(({ id }) => id), ["z-tie", "a-tie"]);
  assert.equal(report.coverStory.id, "a-tie");
});

test("reports without visible stories have a null cover story", () => {
  const report = buildReport({}, {
    period: "daily",
    date: "2026-07-22",
    now: "2026-07-22T12:00:00.000Z",
  });

  assert.equal(report.coverStory, null);
});

test("monthly reports keep a bounded set of the highest-scoring stories per section", () => {
  const dailyDigests = Array.from({ length: 25 }, (_, index) => digest(
    `2026-07-${String(index + 1).padStart(2, "0")}T04:00:00.000Z`,
    [{ id: `story-${index}`, title: `Story ${index}`, score: 100 - index }],
  ));

  const report = buildReport({ dailyDigests }, {
    period: "monthly",
    date: "2026-07-31",
    now: "2026-07-31T12:00:00.000Z",
  });

  assert.equal(report.storyCount, 18);
  assert.deepEqual(report.sections[0].items.map((item) => item.id), Array.from({ length: 18 }, (_, index) => `story-${index}`));
  assert.ok(report.sections[0].items.some((item) => item.id === report.coverStory.id));
});
