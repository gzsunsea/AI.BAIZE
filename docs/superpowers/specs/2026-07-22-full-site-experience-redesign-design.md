# AI.BAIZE Full-Site Experience Redesign

## Context

AI.BAIZE already provides a selected feed, the complete AI feed, local reading state, saved items, daily digests, education and culture views, a reading workspace, Ask Baize, theme switching, mobile navigation, Agent access, and administration. The current experience exposes most of these capabilities at the same navigation level, uses a visually dense 12px interface, and makes users work too hard to answer three common questions:

1. What matters right now?
2. What changed since my last visit?
3. Where can I read or revisit the result?

Recent AI HOT changes provide useful reference points: current hot topics, more scannable timelines, daily/weekly/monthly reports, reusable topic pages, richer in-site reading, local saving and export, and more coherent desktop/mobile presentation. AI.BAIZE will borrow the interaction principles while retaining its own editorial identity, source-quality rules, education/culture focus, and free-source architecture.

## Goals

- Make the selected homepage understandable within one screen: current events first, chronological feed second.
- Reduce navigation choices without removing existing public capabilities.
- Establish a distinctive, readable "Baize Editorial Desk" visual system across desktop and mobile.
- Turn daily digests into a daily/weekly/monthly report workspace using existing stored data.
- Make topic pages a reusable pattern rather than one-off education and culture views.
- Complete the reading loop from discovery to reading, saving, exporting, and processing.
- Preserve existing source selection, scoring, deduplication, runtime data, and free-service constraints.

## Non-Goals

- Replacing or redesigning the refresh and scraping pipeline.
- Copying AI HOT branding, layout, or wording.
- Adding accounts, cloud-synced bookmarks, payments, or paid APIs.
- Republishing full copyrighted articles. Content without explicit redistribution permission continues to expose editorial summaries and original links only.
- Launching 19 topic pages immediately. The redesign provides the topic-page framework and ships a focused initial set.
- Changing the public API contract in incompatible ways.

## Chosen Approach

Use a progressive full-site redesign on top of the current Express and React application. Existing API fields remain valid. New public endpoints are additive, and every new homepage/report section has an empty-data fallback. The work is delivered in coherent slices so the current site remains usable between changes.

Two alternatives were rejected:

- A strict AI HOT parity project would expand scope, weaken AI.BAIZE differentiation, and couple the product roadmap to another site.
- A visual-only reskin would leave the information hierarchy and reading journey unresolved.

## Information Architecture

The desktop sidebar groups destinations instead of presenting one flat list.

### Discover

- Selected
- All AI Updates
- Reports

### Topics

- Models
- Agents
- Open Source
- AI Education
- AI Culture

The Models, Agents, and Open Source entries reuse the same topic-page template and existing item metadata. Education and Culture keep their current editorial scope.

### Workspace

- Reading List
- Ask Baize

Ask Baize becomes a first-class workspace entry while remaining available from individual stories.

### Service

- Agent Access
- About

Administration is visually separated at the bottom of the sidebar and is excluded from primary mobile navigation. Existing mode names and compatible URLs remain supported internally during migration.

## Experience Design

### 1. Selected Homepage

The selected homepage contains four levels:

1. A compact page header with title, last refresh time, search, refresh, and theme actions. Inventory statistics move out of the primary reading path.
2. A "Current Signals" section containing up to five event clusters from the last 72 hours. A cluster is eligible only when it has at least two distinct source IDs or its representative item is pinned and its score meets the configured selected-feed threshold. If fewer than two clusters qualify, the section is hidden.
3. A category/channel filter row with a single clear active state. Advanced reading-state and density controls move into a secondary view menu.
4. A chronological feed grouped by local date. The current date heading remains sticky while its group is in view. Older groups can be collapsed, but today's group is always expanded.

Each current-signal card shows rank, event title, number of sources, representative source names, freshness, and the highest-quality representative item. Opening a signal opens the representative story in the reading workspace and exposes related coverage there.

### 2. Feed Cards

Feed cards use the following visual order:

1. Time, source, and source-type badge.
2. Title.
3. One concise editorial line: recommendation reason first, summary as fallback.
4. Optional fact/impact/scenario brief in comfortable density only.
5. Score, related-source count, tags, save, and more actions.

Compact density hides the editorial brief and nonessential tags but preserves the recommendation line. Read cards reduce contrast without collapsing. Keyboard shortcuts J/K/M/B continue to work and receive a small discoverability hint in the desktop view menu.

### 3. Topic Pages

A single topic-page component accepts a topic definition containing label, description, category/tag filters, preferred channels, and optional highlighted items. The initial public topics are Models, Agents, Open Source, AI Education, and AI Culture.

Topic pages use the same feed and date grouping as the homepage. They do not create a parallel data store or independent ranking system. Empty topics show a clear explanation and a link back to Selected rather than an empty card grid.

### 4. Reports

The existing AI Daily page becomes Reports with Daily, Weekly, and Monthly tabs.

- Daily uses the latest digest and existing archive.
- Weekly aggregates the latest seven local dates from stored daily snapshots, removes duplicate items by event identity, and groups the result by editorial section.
- Monthly aggregates the current calendar month from stored daily snapshots using the same deduplication rule.

Weekly and monthly reports are deterministic summaries of stored digests; they do not invoke an LLM during page requests. Their lead headline is derived from the highest-scoring event cluster, and their "Key Themes" list is derived from section and tag frequency. A weekly report is complete only when all seven local dates have a stored snapshot. A current-month report is complete only when every elapsed local date in that month has a stored snapshot. Otherwise the report states the actual covered date range and number of covered days instead of implying completeness. Estimated reading time is `max(1, ceil(storyCount / 5))` minutes.

The report workspace shows period tabs, issue navigation, estimated reading time, story count, key themes, section contents, and a back-to-top action. Daily archive behavior remains available.

### 5. Reading Workspace

Desktop continues to use a right-side workspace; mobile uses a draggable-feeling bottom sheet without requiring gesture logic. The workspace contains:

- source, publication time, category, and score;
- title and editorial fact/impact/scenario brief;
- recommendation reason;
- related coverage grouped under the same event;
- tags;
- original-link action;
- save, processed-state, share, and Markdown-export actions;
- Ask Baize tab with the selected story as context.

Markdown export includes the AI.BAIZE title, source, publication time, editorial brief, recommendation reason, AI.BAIZE item identifier, and original link. It never adds unavailable full text.

### 6. Mobile Navigation and Controls

The mobile bottom navigation contains Selected, All, Reports, Reading List, and More. More opens the existing navigation drawer with topics, Ask Baize, service links, theme choice, and About. Administration remains reachable in the drawer but is visually separated.

Search opens as a focused full-width row. Filters and display options open in a compact sheet so the feed is not pushed below several rows of controls. Current Signals uses a vertical list rather than horizontal scrolling to preserve discoverability. Reading actions remain reachable above the safe-area inset.

## Visual System

The visual direction is "Baize Editorial Desk": calm, editorial, and information-led rather than futuristic glass UI.

- Base text increases from 12px to 14px on desktop and remains at least 14px for mobile reading content.
- Display type uses the existing system stack with stronger Chinese typographic hierarchy; no external font dependency is added.
- Dark theme uses ink blue/green surfaces with warm ivory text. Light theme uses warm paper surfaces with dark ink text.
- Cyan remains an interaction accent, while warm gold marks editorial importance. Large background radial gradients and repeated glass effects are reduced.
- One spacing scale, radius scale, border color, shadow scale, and content-width scale are defined as CSS custom properties.
- Cards use spacing, type, and subtle borders for hierarchy. Color is never the only indicator of selected, read, saved, or error state.
- Animation is limited to drawer/workspace transitions, hover/focus feedback, and loading states, and respects `prefers-reduced-motion`.

## Frontend Structure

The current single `src/main.tsx` file is split only along redesign boundaries:

- `src/app/App.tsx`: application state, mode routing, and data orchestration.
- `src/components/layout/`: desktop sidebar, mobile header, bottom navigation, and page shell.
- `src/components/feed/`: current signals, filters, date groups, cards, and display controls.
- `src/components/reader/`: reading workspace, export, and Ask Baize presentation.
- `src/components/reports/`: report navigation, archive, lead, themes, and sections.
- `src/components/topics/`: topic definitions and reusable topic page.
- `src/styles/`: tokens, base, layout, feed, reader, reports, and responsive styles.
- `src/lib/`: formatting, local reading-state persistence, and export helpers.

Administration may remain in its existing implementation during the first extraction, but it must consume the shared tokens and page shell. The split is not a general rewrite and must preserve current behavior.

## Backend and Data Contracts

### Current Signals

Add `GET /api/public/hot-topics` and an equivalent internal helper. The response contains:

- `generatedAt`
- `items[]` with `id`, `title`, `sourceCount`, `sources`, `topScore`, `publishedAt`, `representative`, and `relatedItems`

The endpoint derives results from existing clusters and enriched visible items. It returns an empty array when inventory is insufficient and never triggers a refresh.

### Reports

Add `GET /api/public/reports?period=daily|weekly|monthly&date=YYYY-MM-DD`. The default period is daily and the default date is the latest covered date. The response contains:

- period and covered date range;
- completeness note;
- headline, story count, and estimated reading minutes;
- key themes;
- deduplicated sections and items;
- previous/next issue identifiers when available.

Existing `/api/daily`, `/api/public/daily`, and `/api/public/dailies` continue working.

### Topics

Topic pages initially reuse `/api/items` with current category, channel, tag, and query support. No new endpoint is required unless implementation proves the filters cannot express a topic definition without incompatible client-side overfetching.

## State and Data Flow

1. App mode determines the page definition.
2. The page requests only the data it owns: feed, current signals, report, or saved local entries.
3. Shared local reading state provides read, saved, and processed status to feed and reader components.
4. Opening a story marks it read and loads no additional remote content unless Ask Baize is explicitly invoked.
5. Missing optional sections degrade independently; a failed current-signals request does not hide the feed, and a failed report does not affect navigation.

Saved, read, processed, density, and theme keys remain compatible with current local storage. No user data migration is required.

## Error, Loading, and Empty States

- The page shell and navigation render before data responses.
- Feed loading uses stable skeleton rows sized like final cards.
- Current Signals disappears on an empty response and shows a compact retry message only on a request error.
- Report errors remain inside the report workspace with retry and Daily fallback actions.
- Search and filters distinguish "no matches" from "no inventory".
- Original links remain available even if Ask Baize fails.
- API responses validate period/date inputs and return structured 400 errors for invalid values.

## Accessibility

- All navigation, filters, cards, dialogs, and drawers are keyboard reachable.
- Focus returns to the invoking card when the reading workspace closes.
- Dialog and drawer states expose correct labels and expanded state.
- Text and interactive controls meet WCAG AA contrast targets in both themes.
- Touch targets are at least 44 by 44 CSS pixels on mobile.
- Sticky elements do not cover focused content, and safe-area insets are applied to mobile navigation and reading actions.

## Verification

### Automated

- Unit tests cover current-signal eligibility, ordering, source independence, and empty inventory.
- Unit tests cover weekly/monthly date boundaries, event deduplication, incomplete coverage, and deterministic output.
- Existing scoring, scraper, selection, security, Ask Baize, and daily tests remain green.
- Frontend helper tests cover date grouping, topic filters, reading-state compatibility, and Markdown export where practical with the current test stack.
- `npm run build` completes without TypeScript or Vite errors.

### Interaction

- Verify selected feed, all feed, each initial topic, all three report periods, reading list, Ask Baize, Agent access, About, and Admin.
- Verify loading, error, empty, read, saved, processed, and compact-density states.
- Verify keyboard reading flow and focus restoration on desktop.
- Verify widths 375px, 768px, 1280px, and 1600px in dark, light, and automatic themes.
- Verify iOS/Android safe-area behavior and that mobile content is not hidden behind bottom navigation.

## Delivery Sequence

1. Introduce shared visual tokens and the new responsive page shell while preserving current pages.
2. Add current-signals API, homepage hierarchy, date-grouped feed, and redesigned cards.
3. Add the topic-page framework and migrate Education/Culture plus the three initial general topics.
4. Add report aggregation API and the Daily/Weekly/Monthly report workspace.
5. Upgrade the reading workspace, Markdown export, mobile controls, accessibility, and final consistency pass.

Each slice must build and keep existing server tests green before the next slice begins. Deployment is out of scope until the complete redesign is locally verified and the user explicitly approves production rollout.

## Acceptance Criteria

- A first-time visitor can identify current high-value events and enter the chronological feed from the first screen.
- Primary navigation is grouped and contains no more than five top-level mobile actions.
- Selected and topic feeds are date-grouped, readable in both densities, and preserve local reading state.
- Current Signals is cluster-backed and hides when evidence is insufficient.
- Daily, weekly, and monthly reports load from existing stored data without paid APIs or request-time LLM calls.
- Story discovery, reading, saving, processing, sharing, exporting, and Ask Baize form one coherent workspace.
- The complete public site uses the shared visual tokens and works at the four target widths in both color themes.
- Existing public daily and item APIs remain compatible.
- No production runtime data is overwritten during implementation or later deployment.
