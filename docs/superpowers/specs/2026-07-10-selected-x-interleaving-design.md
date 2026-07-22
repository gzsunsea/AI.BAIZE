# Selected X Interleaving Design

## Goal

Keep the configured X quota in the selected feed while ensuring those items are visible throughout the first page instead of collecting at the end.

## Decision

Selection eligibility and quotas remain unchanged. After the selector has chosen and ranked its items, it will preserve pinned items at the front, split the remaining items into X signals and other signals, and insert one X signal after each fixed-size group of non-X items. The group size is derived from the selected item count and available X count, so a 60-item feed with 12 X items places roughly one X item in every five positions.

This ordering is deterministic. It does not randomize the feed, change item scores, reduce official first-party coverage, or manufacture X items when inventory is insufficient.

## Data Flow

1. `selectCuratedItems` applies existing URL, source, community, Chinese-media, preferred-source, and X-quota constraints.
2. The selected set is ranked with the existing `selectedRank` comparator.
3. Pinned items remain at the front in ranked order.
4. Unpinned X and non-X items are interleaved at a stable interval.
5. API pagination consumes the resulting order without further sorting.

## Verification

- A regression test creates 20 selected items with a 25% X quota and verifies five X items are selected.
- The same test verifies that the first eight results contain two X items, proving X visibility on the first page segment.
- Existing selection, security, scraper, and daily-digest tests must remain green.
- Production verification checks that page 1 of `/api/public/items?mode=selected&take=30` contains X status URLs.
