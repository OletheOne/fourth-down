# Fourth Down — final data and decision audit

Audited September 7, 2026. This is a code and live-data audit, not independent proof of predictive superiority.

## 1. Does every input contribute to the best possible pick?

No. The default is a bounded roster-value policy, not an absolute optimizer of championship probability. It evaluates every legal projected candidate's immediate roster gain, then places its selected baseline first. Full-draft scenarios supply supporting context. The default deliberately does not substitute an experimentally worse policy merely because it uses more inputs.

| Input | Actual use |
| --- | --- |
| Season projections; league scoring | Direct projected value and roster improvement |
| Rosters, starters, FLEX, position maximums | Legal candidates, lineup allocation, bench capacity |
| Keepers, finalized round costs, snake order, completed picks | Availability, roster needs, exact remaining turns |
| Positional replacement pool, byes, bench depth | Default roster-value objective; replacement shares and 12% bench insurance are assumptions |
| ADP, expert consensus | Market ordering, candidate selection, tie-breaks, exploratory opponent drafts |
| Expert dispersion, rank range, injury flags, dated news | Scenario uncertainty and review alerts; not automatic default point deductions |
| Opponent roster needs, recent position runs | Exploratory opponent choices, not an independently fitted league-specific behavior model |
| Dynasty rankings, escalating keeper costs, horizon | Exploratory future portfolio; not part of default ordering |
| Projected carries, attempts, receptions | Scoring components or explanatory workload; not added again as an arbitrary bonus |
| Age, tiers | Source/context fields; no independent age or tier multiplier |
| Threshold bonuses | Separately estimated K/DST distributions, with baseline guards; not exact source projections |

Historical testing did not establish that lookahead beats roster value. The untouched 2025 comparisons favored roster value, but involved simulated opponents, archived PPR rankings, estimated forecasts, and frozen lineups. Keeper-specific superiority and a globally optimal draft remain unproven. More features need chronological holdouts, realistic draft opponents and paired comparisons against the unchanged baseline—not a larger synthetic sample from the same assumptions.

## 2. Live data and the interception warning

The authenticated feed returned 885 players, 619 projection records, 538 redraft ranking records, 437 dynasty ranking records and 332 ADP records. These counts describe different source universes, not 885 equally complete forecasts. Players without usable current-season projections are excluded from recommendations. All 32 selected keeper identities matched in the preceding integration tests.

All 77 projected quarterbacks in the normalized player pool had passing-interception projections. None of the 132 RBs, 203 WRs or 127 TEs had a passing-interception field. The engine incorrectly applied a missing-field check across every offensive position. This generated 462 irrelevant warnings; it did not apply a phantom interception penalty or change those players' totals.

Fixed category-aware validation: a non-QB without a projected passing category does not require passing statistics. Supplied passing data, unusual passing roles and explicit position scoring still trigger the appropriate adjustments and missing-field checks. A QB with missing/non-finite interceptions still raises a genuine warning. Interception scoring remains the FantasyPros baseline of -1 adjusted to this league's -2 exactly once. We do not manufacture zero projections for rare trick plays.

Projection edit timestamps were not supplied in the checked projection response. This remains a transparent source note; fetch time is not substituted as expert update time. Positive injury/news coverage does not establish that every player is healthy or that projections incorporate every headline. Defense points-allowed estimates remain approximate, with schedule/roster limitations.

## 3. Highest-value candidates for new research

1. **League-specific draft market:** historic ESPN pick order, position runs by manager and ESPN default-board effects. Test against consensus ADP before changing wait recommendations. This is different information from player scoring projections.
2. **Opportunity changes:** target share, air-yard share, routes/snaps and goal-line usage, especially changes after injuries or transactions. Prefer changes relative to what forecasts already imply; raw season volume is already included in projections.
3. **Depth-chart movement and contingent upside:** who gains work if a starter misses time. The connected FantasyPros depth-chart tool returned ordered RBs for Atlanta in this audit. This confirms availability for assistant-assisted research, not automatic ingestion into Fourth Down's public-API refresh. A backup label alone is not a quantified upside forecast.
4. **Projection revisions and source disagreement:** timestamped forecasts and out-of-sample calibrated errors. The current expert ranking spread is not a calibrated player-point distribution. Independent sources may still be correlated.
5. **League-specific future keeper surplus:** historically observed retention costs, collisions, injuries, waiver replacement and yearly roster turnover. Current dynasty rank proxies are not a validated multi-year value forecast.

These are hypotheses, not demonstrated advantages, and were not silently added to the recommendation score. Do not double-count schedule, role, age or opportunity already embedded in expert projections. Keep championship/weekly-win objectives separate from a season-point proxy.

Primary references: [nflverse data availability](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html), [nflfastR player-stat construction including target/air-yard share](https://github.com/nflverse/nflfastR/blob/master/R/calculate_stats.R), [FantasyPros accuracy methodology](https://www.fantasypros.com/about/faq/football-draft-accuracy-methodology/). nflverse participation data from 2023 onward is provided after postseason rather than as a live in-season feed; its injury source stopped after 2024. Do not promise these as current injury/route feeds without a new verified source.

## 4. Interface changes

- Replace the long decision audit with “Why this pick”: season projection, estimated roster gain, open slots and prioritized pre-pick checks.
- Default comparison table displays roster gain, which actually determines its ordering, rather than an exploratory total that could contradict the displayed order.
- Off-clock recommendations explicitly mean “if available.” Scenario availability is not presented as measured odds.
- Translate missing fields into plain English; keep source timestamp limitations distinct from failures and injuries.
- Show projected workload and draft-market context on demand without adding either twice to the scoring objective.
- Keep source notes, technical diagnostics, experimental strategy limits and the availability-review controls accessible through progressive disclosure.

Regression checks cover all quarterback interception adjustments, non-QB false-positive removal, unusual roles, missing real fields, presentation classification, keeper reservations, engine behavior, refresh resilience and the production inline worker. No browser visual QA was performed because browser testing was not requested.
