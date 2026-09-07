# Fourth Down evaluation protocol — 2026-09-07

The old 96-case synthetic first-pick exercise is retired as evidence of advantage.
It remains a regression fixture only. Its eight outcomes per fixture are clustered,
and subsequent changes were checked on the same fixtures. It is not a holdout.

## Locked design before inspecting results

Bonus models: use 2018–2022 for development (rolling-origin validation in
2020–2022), then freeze methods and evaluate 2023–2025. Kicker distance shares
use made kicks, shrunk toward a recent league prior. Defensive points-allowed
bands use team game histories, shrunk toward a league prior. Tune shrinkage only
on development years. Compare with a league-prior forecast and the app's previous
zero bonus. Report held-out MAE and probability scores, sample sizes and paired
uncertainty. A model that does not beat a prior must use that prior, not claim
player-specific predictive skill. Conditional kicker bonus evaluation must be
labeled conditional on actual made-FG volume; it does not validate FG projections.

Historical draft evaluation: preseason ranking snapshots strictly before each
season's first game; never end-of-season rankings. Train rank-to-points mappings
on earlier seasons only, and retain ranked busts/zero-outcome players. Use the
verified Discord scoring and 12 teams. All strategies make every selection,
with identical roster legality and opponent policies. Evaluate more than one
draft slot/opponent style. Simulated opponents are not actual ESPN draft logs.
Weekly lineup decisions use preseason expectations and known byes, not realized
weekly points. Report matched-ID coverage and limitations, including absence of
historical provider projections/ADP where applicable. Don't call ECR an ADP feed.

Outcomes are hidden from drafting policies. The rollout algorithm must likewise
choose using observable projections, then grade using latent outcomes. Paired
randomness is shared across strategies. Uncertainty must cluster by season for
historical claims; draft scenarios within a season are not independent NFL
seasons. Report per-season differences, not just an aggregate p-value.

2023 is the draft-development year; 2024–2025 are held out. No policy changes
based on those outcomes may subsequently be described as held-out validation.
If no advantage is established, default to the simpler roster-aware policy and
make experimental lookahead explicit. Do not silently promote an unvalidated
policy. This is an evidence gate, not a promise of statistically significant wins.

Source manifests include URLs and SHA-256. Raw downloaded data and generated
large fixtures stay in ignored research/cache. Ship only small derived model
artifacts and aggregate reports, with attribution. Never include credentials.

## Audit amendment before completed evaluation

During code review a second hindsight dependency was found: rollout grading
selected the best lineup using realized values. It is now scored using starters
selected from observable projections. The first interrupted 2024 run had emitted
partial results before this correction. Therefore 2024 is now an audited replay,
NOT an untouched holdout. 2025 was not reached in that run and remains the sole
untouched final season. No later performance tuning is permitted on its results.
This reduces the independent evidence available and must be disclosed.
