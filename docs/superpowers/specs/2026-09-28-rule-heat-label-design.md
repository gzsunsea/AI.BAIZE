# Rule-based Heat Label Design

## Context

AI.BAIZE's hot-topic score is calculated from source quality, independent-source coverage, freshness, and the selected score of the event's strongest report. It is not a measurement of live discussion volume and the app does not currently retain a historical heat series. The hot-list page documents the formula in a collapsed rules section, but the list cards and story header label the number only as “热度”.

AIHOT exposes discussion heat and historical curves. Reusing that terminology without equivalent underlying measurements would imply data AI.BAIZE does not collect.

## Goals

- Make the displayed metric's rule-based nature clear wherever its numeric value appears on the hot list or story page.
- Explain that the score is not real-time discussion volume and that historical trends are not currently available.
- Preserve the existing transparent formula and evidence boundaries.

## Non-goals

- Do not change the score formula, ranking, API shape, source weighting, or event grouping.
- Do not add or estimate discussion-volume measurements or historical curves.
- Do not change the separate “hot” metric used by Chinese public-account monitoring.

## Design

- In the hot-list introduction, state that the displayed heat is a site-calculated rule score derived from source quality, independent-source coverage, freshness, and selected content score; clarify it is not live discussion volume and no historical series is available.
- Label each hot-list card's numeric value “规则热度”.
- Use the same “规则热度” label in the story-page header so the metric remains unambiguous when opened directly or shared.
- Keep the expandable rules section as the detailed explanation of weights and caps. Avoid repeating the full formula on every card.

## Adversarial review

- A reader might still mistake the score for engagement if the label is shortened or omitted on the detail page; therefore both list and story labels are in scope.
- A longer explanation could clutter the page; keep the full formula in the existing disclosure and use one concise clarification in the page introduction.
- The absence of history must not be presented as a temporary loading state or replaced with synthetic values; this design adds no graph or trend data.
- The API already exposes `trendAvailable: false` and the formula; this is a presentation-only correction, not a backend change.

## Verification

- Add text-contract tests proving the hot-list introduction distinguishes rule score from discussion volume and notes the missing history.
- Add assertions proving the list and story-page score labels say “规则热度”.
- Run the focused UI contract tests, then the full test suite, typecheck, production build, and `git diff --check`.

## Approval boundary

This document describes the proposal only. Product-code changes should begin after the user reviews and approves this design.
