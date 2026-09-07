# Fourth Down decision engine v2

This is a bounded, deterministic-seed decision model, not a guarantee or a trained win-probability model.

## Objective and rollout

Score completed rosters by optimized starter points, bye-week replacement coverage, diminishing bench insurance above waiver replacement, and (keeper mode only) discounted keeper portfolio value. Subtract a configurable downside preference times scenario dispersion. Shared random scenarios compare a shortlist built from immediate roster gains, market leaders, each position's leader and keeper candidates. Opponents use their own roster needs, limits, ADP dispersion and recent position runs. Later user picks use greedy legal roster improvement. This is full-draft rollout with a bounded shortlist, not exhaustive search over every possible draft sequence.

The final ordering uses a paired, conservative improvement estimate relative to an immediate-roster-value baseline. Small noisy differences default to that baseline. The displayed raw model value is not a percentage and need not follow the conservative ordering. Availability estimates come from a neutral waiting branch and are conditional on the supplied board, not calibrated probabilities.

## Lineups, data and league rules

Dedicated slots are assigned first, then RB/WR/TE FLEX, then QB/RB/WR/TE superflex. Every player occupies at most one slot. Roster capacity and position limits reserve room for mandatory unfilled starters. Waiver replacement is derived from league-wide positional demand including benches. Bye overlap loses projected weekly coverage; usable reserves provide cover. Bench insurance uses a disclosed 12% option-value assumption with diminishing returns.

Provider scoring totals are applied exactly once. Stat-coefficient overrides adjust their known baseline, including per-position premiums and K/DST coefficients. Missing statistics, unverified zero bonus projections and scoring mismatches are explicit. Distance FG bins and points-allowed bonuses cannot be exact without projected component counts. Provider totals remain the basis where detailed scoring cannot be reconstructed; do not call those customized projections exact.

The player catalog remains available for identity reconciliation, but inactive catalog-only players and missing/zero current projections are not recommended. Newest news wins; injuries use the actual injuries response array. ADP average and dispersion, expert spread and ranking range, season, fetch time, ranking time and projection time are retained when provided. Unknown source timestamps remain unknown. Designations never invent missed games. Recent availability/role news triggers review and uncertainty; a sourced user override can model absence without double-counting it in projections. News is a limited recent feed, not a complete dossier.

Confirmed current-draft roster snapshots contribute roster context and remove players from availability. Unconfirmed/prior-season snapshots do not. Roster-only players without pick numbers cause a timing warning. Name normalization reconciles punctuation/case, and duplicate/unmatched identities remain visible. User-entered picks and keepers are retained during feed refresh and profile changes invalidate in-flight refreshes.

## Keeper economics

Defaults: three keepers, one round earlier per year, three future years, 0.65 annual discount. Contend/balanced/rebuild discounts future option value by an additional 0.15/0.30/0.50 objective weight. These are disclosed modeling preferences, not fitted coefficients. The round-one boundary and collision rule must be confirmed with the commissioner.

Future value is inferred from dynasty positional consensus and current positional projection curves, not a claimed future ADP forecast. No separate age penalty duplicates dynasty consensus. Enumerate initial keeper portfolios and, for up to three contracts, all cost-assignment orders. Future years can only retain/drop those players; actual charged collision costs carry forward. Larger keeper limits use deterministic future-value cost ordering. The model does not assume a player who was dropped can reappear as a keeper. Traditional mode has no dynasty/keeper component regardless of team direction.

## Verification and limits

Run optimizer scenario tests, the feed adapter tests, the first-pick synthetic benchmark, TypeScript checking, production build, and worker bundle test. The optional live-optimizer test uses a runtime-only authorized key and prints no credentials.

The synthetic benchmark is deliberately separate from historical NFL validation. In the 96-case regression sample, the conservative model averaged 1483.00 realized starting-lineup points versus 1477.25 ADP, 1476.52 ECR and 1477.25 positional value. Paired differences were +5.75/+6.47/+5.75, with two-standard-error widths of 13.66/13.53/13.66. This does **not** establish a meaningful advantage. It evaluates the first pick followed by the same continuation policy, not an entire season. No claim of backtested real-world superiority or calibrated injury/availability probability is supported.

League confirmation, optional source absences, stale data, assumed uncertainty, missing exact scoring inputs and unsupported draft types (auction, traded-pick schedules, IDP, non-nested flex eligibility) require human review. This release supports the requested snake traditional/three-keeper draft; it must not silently claim support for other formats.
