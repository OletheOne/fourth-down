'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, BrainCircuit, Check, ChevronRight, Database, Download, ExternalLink, Link2, RefreshCw, RotateCcw, Search, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { demoPlayers, type DraftedPlayer, type LeagueSettings, parsePlayerCsv, type Player, rankAvailable } from '@/lib/draft';

const defaultSettings: LeagueSettings = {
  userTeam: 'Team 6', draftSlot: 6, scoring: 'ppr', mode: 'balanced',
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, K: 1, DST: 1 },
};
const defaultTeams = Array.from({ length: 12 }, (_, index) => `Team ${index + 1}`);
type DataSource = 'demo' | 'fantasypros' | 'espn' | 'csv';
type LeagueSource = 'manual' | 'espn-public' | 'fantasypros-mcp';
type LeagueSnapshot = {
  leagueName?: string;
  season?: number;
  teams: Array<string | { name: string; isMine?: boolean }>;
  myTeam?: string;
  scoring?: string;
  starters?: Partial<LeagueSettings['starters']>;
  keepers?: Array<{ playerName: string; owner: string; originalRound?: number; seasonsKept?: number; costRound?: number }>;
  picks?: Array<{ playerName: string; owner: string; pick?: number }>;
  rosters?: Array<{ team: string; players: string[] }>;
  updatedAt?: string;
};
type SavedState = {
  players: Player[]; drafted: DraftedPlayer[]; settings: LeagueSettings; teams?: string[]; espnLeagueId?: string; espnSeason?: number;
  dataSource?: DataSource; lastFantasyProsSync?: string; leagueSource?: LeagueSource; leagueSnapshotUpdatedAt?: string;
  leagueRosters?: Array<{ team: string; players: string[] }>; espnLeagueName?: string;
};

export default function Home() {
  const [players, setPlayers] = useState<Player[]>(demoPlayers);
  const [drafted, setDrafted] = useState<DraftedPlayer[]>([]);
  const [settings, setSettings] = useState<LeagueSettings>(defaultSettings);
  const [teams, setTeams] = useState(defaultTeams);
  const [espnLeagueId, setEspnLeagueId] = useState('');
  const [espnSeason, setEspnSeason] = useState(new Date().getFullYear());
  const [espnSyncing, setEspnSyncing] = useState(false);
  const [espnLeagueName, setEspnLeagueName] = useState('');
  const [leagueSource, setLeagueSource] = useState<LeagueSource>('manual');
  const [leagueSnapshotUpdatedAt, setLeagueSnapshotUpdatedAt] = useState('');
  const [leagueRosters, setLeagueRosters] = useState<Array<{ team: string; players: string[] }>>([]);
  const [leagueSnapshotText, setLeagueSnapshotText] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>('demo');
  const [lastFantasyProsSync, setLastFantasyProsSync] = useState('');
  const [fantasyProsSyncing, setFantasyProsSyncing] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('Team 1');
  const [playerQuery, setPlayerQuery] = useState('');
  const [keepersText, setKeepersText] = useState('');
  const [bulkPicksText, setBulkPicksText] = useState('');
  const [csvText, setCsvText] = useState('');
  const [notice, setNotice] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('fourth-down-state');
    if (raw) {
      try {
        const saved = JSON.parse(raw) as SavedState;
        setPlayers(saved.players); setDrafted(saved.drafted); setSettings(saved.settings);
        if (saved.teams?.length) setTeams(saved.teams);
        if (saved.espnLeagueId) setEspnLeagueId(saved.espnLeagueId);
        if (saved.espnSeason) setEspnSeason(saved.espnSeason);
        if (saved.dataSource) setDataSource(saved.dataSource);
        if (saved.lastFantasyProsSync) setLastFantasyProsSync(saved.lastFantasyProsSync);
        if (saved.leagueSource) setLeagueSource(saved.leagueSource);
        if (saved.leagueSnapshotUpdatedAt) setLeagueSnapshotUpdatedAt(saved.leagueSnapshotUpdatedAt);
        if (saved.leagueRosters) setLeagueRosters(saved.leagueRosters);
        if (saved.espnLeagueName) setEspnLeagueName(saved.espnLeagueName);
      } catch {}
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) localStorage.setItem('fourth-down-state', JSON.stringify({ players, drafted, settings, teams, espnLeagueId, espnSeason, dataSource, lastFantasyProsSync, leagueSource, leagueSnapshotUpdatedAt, leagueRosters, espnLeagueName }));
  }, [players, drafted, settings, teams, espnLeagueId, espnSeason, dataSource, lastFantasyProsSync, leagueSource, leagueSnapshotUpdatedAt, leagueRosters, espnLeagueName, hydrated]);

  useEffect(() => {
    if (!hydrated || dataSource !== 'fantasypros' || !lastFantasyProsSync) return;
    if (Date.now() - new Date(lastFantasyProsSync).getTime() > 6 * 60 * 60 * 1000) void syncFantasyPros(true);
    // The refresh is intentionally evaluated only when saved state finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const available = useMemo(() => players.filter((player) => !drafted.some((entry) => entry.playerId === player.id || entry.playerName?.toLowerCase() === player.name.toLowerCase())), [players, drafted]);
  const draftPicks = drafted.filter((entry) => entry.kind === 'draft');
  const keepers = drafted.filter((entry) => entry.kind === 'keeper');
  const recommendations = useMemo(() => rankAvailable(players, drafted, settings, teams), [players, drafted, settings, teams]);
  const best = recommendations[0];
  const currentPick = nextOpenDraftPick(draftPicks, keepers, teams);
  const currentOwner = ownerForPick(currentPick, teams);
  const isMyPick = currentOwner === settings.userTeam;
  const sourceLabel = dataSource === 'fantasypros' ? 'FantasyPros live' : dataSource === 'espn' ? 'ESPN data' : dataSource === 'csv' ? 'Custom CSV' : 'Demo data';
  const filteredPlayers = available.filter((player) => `${player.name} ${player.pos} ${player.team}`.toLowerCase().includes(playerQuery.toLowerCase())).slice(0, 8);

  useEffect(() => {
    type WebTool = {
      name: string; title: string; description: string; inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    };
    const context = (document as unknown as { modelContext?: { registerTool: (tool: WebTool, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebTool) => void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);

    register({
      name: 'read_draft_recommendation', title: 'Read draft recommendation',
      description: 'Return the best available pick and decision signals after all currently recorded keepers and draft picks.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => best ? { pick: currentPick, player: best.name, position: best.pos, team: best.team, score: Number(best.score.toFixed(1)), signals: best.components, rationale: best.rationale } : { pick: currentPick, player: null },
    });
    register({
      name: 'read_draft_state', title: 'Read complete draft state',
      description: 'Return league settings, keepers, picks, roster context, and the top five current recommendations for a focused on-the-clock analysis.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({
        league: { name: espnLeagueName || undefined, source: leagueSource, teams, settings, updatedAt: leagueSnapshotUpdatedAt || undefined },
        currentPick, currentOwner, isMyPick,
          keepers: keepers.map((entry) => ({ player: entry.playerName ?? players.find((player) => player.id === entry.playerId)?.name ?? entry.playerId, owner: entry.owner, originalRound: entry.originalRound, seasonsKept: entry.seasonsKept, costRound: entry.costRound })),
        picks: draftPicks.map((entry) => ({ pick: entry.pick, player: entry.playerName ?? players.find((player) => player.id === entry.playerId)?.name ?? entry.playerId, owner: entry.owner })),
        rosters: leagueRosters,
        recommendations: recommendations.slice(0, 5).map((player) => ({ player: player.name, position: player.pos, team: player.team, score: Number(player.score.toFixed(1)), signals: player.components, rationale: player.rationale })),
      }),
    });
    register({
      name: 'record_draft_pick', title: 'Record draft pick',
      description: 'Record one selected player for an owner and immediately update the visible board and recommendation.',
      inputSchema: { type: 'object', properties: { playerName: { type: 'string' }, owner: { type: 'string' } }, required: ['playerName', 'owner'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        const values = input as Record<string, unknown>;
        if (typeof values.playerName !== 'string' || typeof values.owner !== 'string') throw new Error('playerName and owner must be strings.');
        const player = available.find((candidate) => candidate.name.toLowerCase() === values.playerName!.toString().toLowerCase());
        if (!player) throw new Error('That player is not available in the current pool.');
        const pick = currentPick;
        setDrafted((entries) => [...entries, { playerId: player.id, playerName: player.name, owner: values.owner as string, pick, kind: 'draft' }]);
        setNotice(`${player.name} recorded for ${values.owner}.`);
        return { recorded: true, pick, player: player.name, owner: values.owner };
      },
    });
    register({
      name: 'load_keeper_players', title: 'Load keeper players',
      description: 'Replace the keeper list in one batch. Include originalRound and seasonsKept to calculate this year’s forfeited round automatically, or provide costRound directly.',
      inputSchema: { type: 'object', properties: { keepers: { type: 'array', items: { type: 'object', properties: { playerName: { type: 'string' }, owner: { type: 'string' }, originalRound: { type: 'number' }, seasonsKept: { type: 'number' }, costRound: { type: 'number' } }, required: ['playerName', 'owner'], additionalProperties: false }, maxItems: 36 } }, required: ['keepers'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        const values = input as { keepers?: Array<{ playerName?: unknown; owner?: unknown; originalRound?: unknown; seasonsKept?: unknown; costRound?: unknown }> };
        if (!Array.isArray(values.keepers)) throw new Error('keepers must be an array.');
        const additions = values.keepers.map((keeper, index) => {
          if (typeof keeper.playerName !== 'string' || typeof keeper.owner !== 'string') throw new Error(`Invalid keeper at index ${index}.`);
          const player = players.find((candidate) => candidate.name.toLowerCase() === keeper.playerName!.toLowerCase());
          if (!player) throw new Error(`${keeper.playerName} is not in the current player pool.`);
          const originalRound = validRound(keeper.originalRound);
          const seasonsKept = validCount(keeper.seasonsKept) ?? (originalRound ? 1 : undefined);
          const costRound = validRound(keeper.costRound) ?? (originalRound ? Math.max(1, originalRound - (seasonsKept ?? 1)) : undefined);
          return { playerId: player.id, playerName: player.name, owner: keeper.owner, pick: index + 1, kind: 'keeper' as const, originalRound, seasonsKept, costRound };
        });
        const resolved = resolveKeeperRoundCollisions(additions);
        setDrafted((entries) => [...entries.filter((entry) => entry.kind !== 'keeper'), ...resolved]);
        setNotice(`Added ${additions.length} keepers.`);
        return { loaded: resolved.length, keepers: resolved.map((keeper) => ({ playerName: keeper.playerName, owner: keeper.owner, costRound: keeper.costRound })) };
      },
    });
    register({
      name: 'load_fantasypros_league_snapshot', title: 'Load FantasyPros league snapshot',
      description: 'Load the active FantasyPros-synced ESPN league into Fourth Down, including teams, my team, scoring, starter slots, keepers, rosters, and any draft picks. Use FantasyPros league tools to assemble these fields first.',
      inputSchema: {
        type: 'object',
        properties: {
          leagueName: { type: 'string' }, season: { type: 'number' }, myTeam: { type: 'string' }, scoring: { type: 'string' }, updatedAt: { type: 'string' },
          teams: { type: 'array', minItems: 2, maxItems: 32, items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { name: { type: 'string' }, isMine: { type: 'boolean' } }, required: ['name'], additionalProperties: false }] } },
          starters: { type: 'object', properties: { QB: { type: 'number' }, RB: { type: 'number' }, WR: { type: 'number' }, TE: { type: 'number' }, FLEX: { type: 'number' }, K: { type: 'number' }, DST: { type: 'number' } }, additionalProperties: false },
          keepers: { type: 'array', maxItems: 100, items: { type: 'object', properties: { playerName: { type: 'string' }, owner: { type: 'string' }, originalRound: { type: 'number' }, seasonsKept: { type: 'number' }, costRound: { type: 'number' } }, required: ['playerName', 'owner'], additionalProperties: false } },
          picks: { type: 'array', maxItems: 500, items: { type: 'object', properties: { playerName: { type: 'string' }, owner: { type: 'string' }, pick: { type: 'number' } }, required: ['playerName', 'owner'], additionalProperties: false } },
          rosters: { type: 'array', maxItems: 32, items: { type: 'object', properties: { team: { type: 'string' }, players: { type: 'array', items: { type: 'string' } } }, required: ['team', 'players'], additionalProperties: false } },
        },
        required: ['teams'], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => applyLeagueSnapshot(input as LeagueSnapshot, 'fantasypros-mcp'),
    });
    return () => lifecycle.abort();
  }, [available, best, currentPick, currentOwner, draftPicks, espnLeagueName, isMyPick, keepers, leagueRosters, leagueSnapshotUpdatedAt, leagueSource, players, recommendations, settings, teams]);

  function addDraftPick() {
    if (!selectedPlayer) return;
    const player = players.find((candidate) => candidate.id === selectedPlayer);
    const entry: DraftedPlayer = { playerId: selectedPlayer, playerName: player?.name, owner: selectedOwner, pick: currentPick, kind: 'draft' };
    setDrafted((entries) => [...entries, entry]);
    setSelectedPlayer(''); setPlayerQuery('');
    setSelectedOwner(ownerForPick(nextOpenDraftPick([...draftPicks, entry], keepers, teams), teams));
    setNotice('Pick recorded. Rankings updated.');
  }

  function importKeepers() {
    const rows = keepersText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const additions: DraftedPlayer[] = [];
    const missing: string[] = [];
    rows.forEach((row, index) => {
      const parts = row.split('|').map((part) => part.trim());
      const playerName = parts.length > 1 ? parts[1] : parts[0];
      const owner = parts.length > 1 ? parts[0] : teams[Math.floor(index / 3)] ?? teams[teams.length - 1];
      const originalRound = validRound(parts[2]);
      const seasonsKept = validCount(parts[3]) ?? (originalRound ? 1 : undefined);
      const costRound = originalRound ? Math.max(1, originalRound - (seasonsKept ?? 1)) : undefined;
      const player = players.find((candidate) => candidate.name.toLowerCase() === playerName.toLowerCase());
      if (player) additions.push({ playerId: player.id, playerName: player.name, owner, pick: index + 1, kind: 'keeper', originalRound, seasonsKept, costRound }); else missing.push(playerName);
    });
    try {
      const resolved = resolveKeeperRoundCollisions(additions);
      setDrafted((entries) => [...entries.filter((entry) => entry.kind !== 'keeper'), ...resolved]);
      const moved = resolved.filter((entry, index) => entry.costRound !== additions[index].costRound).length;
      setNotice(missing.length ? `Added ${resolved.length}. Not found: ${missing.join(', ')}` : `Added ${resolved.length} keepers.${moved ? ` ${moved} duplicate round cost${moved === 1 ? ' was' : 's were'} moved one round earlier.` : ''}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not calculate keeper costs.'); }
  }

  function importDraftPicks() {
    const rows = bulkPicksText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const additions: DraftedPlayer[] = [];
    const outsidePool: string[] = [];
    const used = new Set(drafted.map((entry) => entry.playerId));
    const simulatedPicks = [...draftPicks];
    rows.forEach((row, index) => {
      const parts = row.split('|').map((part) => part.trim());
      const rawPlayer = parts.length > 1 ? parts.slice(1).join('|') : parts[0];
      const cleaned = rawPlayer.replace(/^#?\d+[.)\-:]?\s*/, '').trim();
      const player = available.find((candidate) => !used.has(candidate.id) && (candidate.name.toLowerCase() === cleaned.toLowerCase() || cleaned.toLowerCase().includes(candidate.name.toLowerCase())));
      const pick = nextOpenDraftPick(simulatedPicks, keepers, teams);
      const owner = parts.length > 1 ? parts[0] : ownerForPick(pick, teams);
      const entry: DraftedPlayer = player
        ? { playerId: player.id, playerName: player.name, owner, pick, kind: 'draft' }
        : { playerId: `external-${cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${pick}`, playerName: cleaned, owner, pick, kind: 'draft' };
      additions.push(entry); simulatedPicks.push(entry);
      if (player) used.add(player.id); else outsidePool.push(cleaned);
    });
    setDrafted((entries) => [...entries, ...additions]);
    if (additions.length) setBulkPicksText('');
    setNotice(outsidePool.length ? `Added all ${additions.length} picks. Outside the ranking pool: ${outsidePool.join(', ')}` : `Added ${additions.length} picks. Recommendation updated.`);
  }

  function importPlayers() {
    try {
      const imported = parsePlayerCsv(csvText);
      setPlayers(imported); setDrafted([]); setDataSource('csv');
      setNotice(`Loaded ${imported.length} players. Previous keepers and picks were cleared.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not read that CSV.'); }
  }

  function applyLeagueSnapshot(snapshot: LeagueSnapshot, source: LeagueSource = 'fantasypros-mcp') {
    if (!snapshot || !Array.isArray(snapshot.teams)) throw new Error('The league snapshot must include a teams array.');
    const syncedTeams = snapshot.teams.map((team) => typeof team === 'string' ? team.trim() : team?.name?.trim()).filter(Boolean);
    if (syncedTeams.length < 2) throw new Error('The league snapshot needs at least two named teams.');
    if (new Set(syncedTeams.map((team) => team.toLowerCase())).size !== syncedTeams.length) throw new Error('Team names must be unique.');
    const inferredMine = snapshot.teams.find((team) => typeof team !== 'string' && team.isMine);
    const myTeam = snapshot.myTeam?.trim() || (typeof inferredMine === 'object' ? inferredMine.name.trim() : '') || settings.userTeam;
    const scoring = normalizeScoring(snapshot.scoring) ?? settings.scoring;
    const validPositions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST'] as const;
    const starters = { ...settings.starters };
    validPositions.forEach((position) => {
      const count = snapshot.starters?.[position];
      if (typeof count === 'number' && Number.isFinite(count) && count >= 0 && count <= 10) starters[position] = Math.round(count);
    });
    const lookup = new Map(players.map((player) => [player.name.toLowerCase(), player]));
    const missing: string[] = [];
    const makeEntry = (item: { playerName: string; owner: string; originalRound?: number; seasonsKept?: number; costRound?: number }, pick: number, kind: DraftedPlayer['kind']): DraftedPlayer => {
      const name = item.playerName?.trim();
      const owner = item.owner?.trim();
      if (!name || !owner) throw new Error(`Every ${kind} needs a playerName and owner.`);
      const player = lookup.get(name.toLowerCase());
      if (!player) missing.push(name);
      const originalRound = kind === 'keeper' ? validRound(item.originalRound) : undefined;
      const seasonsKept = kind === 'keeper' ? validCount(item.seasonsKept) ?? (originalRound ? 1 : undefined) : undefined;
      const costRound = kind === 'keeper' ? validRound(item.costRound) ?? (originalRound ? Math.max(1, originalRound - (seasonsKept ?? 1)) : undefined) : undefined;
      return { playerId: player?.id ?? `external-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kind}-${pick}`, playerName: player?.name ?? name, owner, pick, kind, originalRound, seasonsKept, costRound };
    };
    const nextKeepers = resolveKeeperRoundCollisions((snapshot.keepers ?? []).map((keeper, index) => makeEntry(keeper, index + 1, 'keeper')));
    const nextPicks = (snapshot.picks ?? []).map((pick, index) => makeEntry(pick, pick.pick && pick.pick > 0 ? Math.round(pick.pick) : index + 1, 'draft')).sort((a, b) => a.pick - b.pick);
    const effectiveKeepers = snapshot.keepers ? nextKeepers : keepers;
    const effectivePicks = snapshot.picks ? nextPicks : draftPicks;
    setTeams(syncedTeams);
    setSettings((current) => ({ ...current, scoring, starters, userTeam: syncedTeams.includes(myTeam) ? myTeam : current.userTeam, draftSlot: syncedTeams.includes(myTeam) ? syncedTeams.indexOf(myTeam) + 1 : current.draftSlot }));
    setSelectedOwner(ownerForPick(nextOpenDraftPick(effectivePicks, effectiveKeepers, syncedTeams), syncedTeams));
    setDrafted((current) => [
      ...(snapshot.keepers ? nextKeepers : current.filter((entry) => entry.kind === 'keeper')),
      ...(snapshot.picks ? nextPicks : current.filter((entry) => entry.kind === 'draft')),
    ]);
    setLeagueRosters(Array.isArray(snapshot.rosters) ? snapshot.rosters.filter((roster) => roster?.team && Array.isArray(roster.players)) : []);
    setEspnLeagueName(snapshot.leagueName?.trim() || espnLeagueName || 'FantasyPros league');
    if (snapshot.season && Number.isInteger(snapshot.season)) setEspnSeason(snapshot.season);
    setLeagueSource(source);
    setLeagueSnapshotUpdatedAt(snapshot.updatedAt || new Date().toISOString());
    setNotice(`League snapshot loaded: ${syncedTeams.length} teams, ${nextKeepers.length} keepers, ${nextPicks.length} picks.${missing.length ? ` ${missing.length} player${missing.length === 1 ? '' : 's'} will match automatically when the production player pool loads.` : ''}`);
    return { loaded: true, teams: syncedTeams.length, keepers: nextKeepers.length, picks: nextPicks.length, unmatchedPlayers: missing };
  }

  function importLeagueSnapshot() {
    try {
      const snapshot = JSON.parse(leagueSnapshotText) as LeagueSnapshot;
      applyLeagueSnapshot(snapshot);
      setLeagueSnapshotText('');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not read that league snapshot.'); }
  }

  async function syncFantasyPros(silent = false) {
    setFantasyProsSyncing(true);
    if (!silent) setNotice('Refreshing FantasyPros rankings, projections, ADP, and injuries…');
    const scoring = settings.scoring === 'half-ppr' ? 'HALF' : settings.scoring === 'ppr' ? 'PPR' : 'STD';
    try {
      const response = await fetch(`/api/fantasypros?season=${espnSeason}&scoring=${scoring}`, { cache: 'no-store' });
      const data = await response.json() as { code?: string; error?: string; players?: Player[]; updatedAt?: string; warnings?: string[] };
      if (!response.ok || data.error) {
        if (data.code === 'sample_access') {
          if (players.length < 100) { setPlayers(demoPlayers); setDataSource('demo'); setLastFantasyProsSync(''); }
          setNotice(data.error ?? 'This key only has FantasyPros sample access.');
          return;
        }
        throw new Error(data.error ?? 'FantasyPros refresh failed.');
      }
      if (!data.players?.length) throw new Error('FantasyPros returned no draftable players.');

      const oldPlayers = new Map(players.map((player) => [player.id, player]));
      const nextByName = new Map(data.players.map((player) => [player.name.toLowerCase(), player]));
      setDrafted((entries) => entries.map((entry) => {
        const previousPlayer = oldPlayers.get(entry.playerId);
        const replacement = nextByName.get((entry.playerName ?? previousPlayer?.name ?? '').toLowerCase());
        return replacement ? { ...entry, playerId: replacement.id, playerName: replacement.name } : entry;
      }));
      setPlayers(data.players);
      setDataSource('fantasypros');
      setLastFantasyProsSync(data.updatedAt ?? new Date().toISOString());
      setNotice(`FantasyPros loaded ${data.players.length} players.${data.warnings?.length ? ` ${data.warnings.join(' ')}` : ''}`);
    } catch (error) {
      if (!silent) setNotice(error instanceof Error ? error.message : 'Could not refresh FantasyPros.');
    } finally {
      setFantasyProsSyncing(false);
    }
  }

  async function syncEspn() {
    if (!/^\d+$/.test(espnLeagueId.trim())) { setNotice('Enter the numeric ESPN League ID.'); return; }
    setEspnSyncing(true); setNotice('Connecting to ESPN…');
    try {
      const response = await fetch(`/api/espn?leagueId=${encodeURIComponent(espnLeagueId.trim())}&season=${espnSeason}`, { cache: 'no-store' });
      const data = await response.json() as {
        error?: string;
        league?: { name: string; scoring: LeagueSettings['scoring'] };
        teams?: string[];
        players?: Array<{ espnId: string; name: string; pos: Player['pos']; team: string; projectedPoints: number; adp: number; age: number }>;
        picks?: Array<{ espnId: string; playerName: string; owner: string; pick: number; kind: 'keeper' | 'draft' }>;
        warnings?: string[];
      };
      if (!response.ok || data.error) throw new Error(data.error ?? 'ESPN sync failed.');
      const syncedTeams = data.teams?.length ? data.teams : teams;
      const existingByName = new Map(players.map((player) => [player.name.toLowerCase(), player]));
      const syncedPlayers: Player[] = (data.players ?? []).map((espnPlayer) => {
        const existing = existingByName.get(espnPlayer.name.toLowerCase());
        const usableAdp = espnPlayer.adp < 900 ? espnPlayer.adp : existing?.adp ?? 999;
        return {
          id: existing?.id ?? espnPlayer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), espnId: espnPlayer.espnId,
          name: espnPlayer.name, pos: espnPlayer.pos, team: espnPlayer.team,
          projectedPoints: espnPlayer.projectedPoints || existing?.projectedPoints || 0,
          adp: usableAdp, age: espnPlayer.age || existing?.age || 26,
          dynastyRank: existing?.dynastyRank ?? Math.max(1, Math.round(usableAdp)),
          tier: existing?.tier ?? Math.max(1, Math.ceil(usableAdp / 12)), bye: existing?.bye ?? 0,
        };
      });
      const nextPlayers = syncedPlayers.length ? syncedPlayers : players;
      const syncedDrafted = (data.picks ?? []).map((pick) => {
        const player = nextPlayers.find((candidate) => candidate.espnId === pick.espnId || candidate.name.toLowerCase() === pick.playerName.toLowerCase());
        return player ? { playerId: player.id, playerName: player.name, owner: pick.owner, pick: pick.pick, kind: pick.kind } satisfies DraftedPlayer : null;
      }).filter(Boolean) as DraftedPlayer[];
      const espnKeepers = syncedDrafted.filter((entry) => entry.kind === 'keeper');
      const espnPicks = syncedDrafted.filter((entry) => entry.kind === 'draft');
      setPlayers(nextPlayers); setTeams(syncedTeams); setEspnLeagueName(data.league?.name ?? 'ESPN League');
      setLeagueSource('espn-public'); setLeagueSnapshotUpdatedAt(new Date().toISOString());
      if (dataSource !== 'fantasypros') setDataSource('espn');
      setSettings((current) => ({ ...current, scoring: data.league?.scoring ?? current.scoring, userTeam: syncedTeams.includes(current.userTeam) ? current.userTeam : syncedTeams[current.draftSlot - 1] ?? syncedTeams[0], }));
      setSelectedOwner(syncedTeams[0] ?? 'Team 1');
      setDrafted((current) => {
        const currentKeepers = current.filter((entry) => entry.kind === 'keeper');
        const currentPicks = current.filter((entry) => entry.kind === 'draft');
        return [...(espnKeepers.length ? espnKeepers : currentKeepers), ...(espnPicks.length >= currentPicks.length ? espnPicks : currentPicks)];
      });
      setNotice(`${data.league?.name ?? 'ESPN league'} synced: ${syncedTeams.length} teams, ${espnKeepers.length} keepers, ${espnPicks.length} draft picks.${data.warnings?.length ? ` ${data.warnings.join(' ')}` : ''}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not sync ESPN.'); }
    finally { setEspnSyncing(false); }
  }

  function exportState() {
    const blob = new Blob([JSON.stringify({ players, drafted, settings, teams, espnLeagueId, espnSeason, dataSource, lastFantasyProsSync, leagueSource, leagueSnapshotUpdatedAt, leagueRosters, espnLeagueName }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'fourth-down-draft.json'; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/8 bg-[#0a1510] text-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-[#d7ff45] text-[#0a1510]"><BrainCircuit className="size-5" /></span>
            <div><p className="font-semibold leading-tight">Fourth Down</p><p className="text-xs text-white/55">Dynasty draft room</p></div>
          </div>
          <div className="hidden items-center gap-5 text-sm text-white/65 sm:flex">
            <span><b className="text-white">{teams.length}</b> teams</span><span><b className="text-white">3</b> keepers</span><span><b className="text-white">{available.length}</b> available</span><span className={dataSource === 'demo' ? 'text-amber-300' : 'text-[#d7ff45]'}>{sourceLabel}</span>
          </div>
          <Badge className={isMyPick ? 'bg-[#d7ff45] text-[#0a1510]' : 'bg-white/10 text-white'}>{isMyPick ? 'You’re on the clock' : `Pick ${currentPick}`}</Badge>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_390px] sm:px-7">
        <section className="space-y-5">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="grid bg-[#10271b] text-white md:grid-cols-[1.25fr_.75fr]">
              <div className="p-6 sm:p-8">
                <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#d7ff45]"><span className="size-2 animate-pulse rounded-full bg-[#d7ff45]" /> Best pick right now</div>
                {best ? <>
                  <div className="mb-3 flex flex-wrap items-end gap-3"><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{best.name}</h1><Badge className="mb-1 bg-white/10 text-white">{best.pos} · {best.team}</Badge></div>
                  <p className="max-w-2xl text-base leading-relaxed text-white/67">{best.rationale.join('. ')}.</p>
                  <div className="mt-6 flex flex-wrap gap-3"><Button className="h-10 bg-[#d7ff45] px-4 text-[#0a1510] hover:bg-[#c8ef3e]" onClick={() => { setSelectedPlayer(best.id); setPlayerQuery(best.name); setSelectedOwner(settings.userTeam); }}>Queue for my team <ArrowRight /></Button><span className="self-center text-sm text-white/50">Composite score {best.score.toFixed(1)}</span></div>
                </> : <h1 className="text-3xl font-semibold">Import a player pool to begin</h1>}
              </div>
              {best && <div className="border-t border-white/10 bg-black/10 p-6 md:border-l md:border-t-0 sm:p-8">
                <p className="mb-4 text-xs font-semibold uppercase tracking-[.13em] text-white/45">Decision signals</p>
                <Signal label="Win now" value={best.components.winNow} /><Signal label="Dynasty" value={best.components.dynasty} /><Signal label="Scarcity" value={best.components.scarcity} /><Signal label="Roster fit" value={best.components.rosterFit} /><Signal label="Take now" value={best.components.urgency} />
              </div>}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Next best options</h2><p className="text-sm text-muted-foreground">Re-ranked after every keeper and pick.</p></div><Badge variant="outline">{settings.mode}</Badge></div>
            <Table>
              <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Player</TableHead><TableHead>Pos</TableHead><TableHead className="hidden sm:table-cell">Proj.</TableHead><TableHead className="hidden md:table-cell">ADP</TableHead><TableHead className="text-right">Score</TableHead></TableRow></TableHeader>
              <TableBody>{recommendations.slice(0, 8).map((player, index) => <TableRow key={player.id} className="cursor-pointer" onClick={() => { setSelectedPlayer(player.id); setPlayerQuery(player.name); }}><TableCell className="font-mono text-muted-foreground">{index + 1}</TableCell><TableCell><div className="font-medium">{player.name}</div><div className="text-xs text-muted-foreground">Age {player.age} · Tier {player.tier}</div></TableCell><TableCell><PositionBadge pos={player.pos} /></TableCell><TableCell className="hidden sm:table-cell">{player.projectedPoints}</TableCell><TableCell className="hidden md:table-cell">{player.adp}</TableCell><TableCell className="text-right font-mono font-semibold">{player.score.toFixed(1)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Live entry</p><h2 className="text-xl font-semibold">Record pick {currentPick}</h2></div><span className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-bold">{currentPick}</span></div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="player-search">Player</label>
            <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input id="player-search" className="h-10 pl-9" value={playerQuery} onChange={(event) => { setPlayerQuery(event.target.value); setSelectedPlayer(''); }} placeholder="Search available players…" /></div>
            {playerQuery && <div className="mt-1 max-h-60 overflow-auto rounded-lg border bg-popover p-1 shadow-lg">{filteredPlayers.length ? filteredPlayers.map((player) => <button key={player.id} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-secondary ${selectedPlayer === player.id ? 'bg-secondary' : ''}`} onClick={() => { setSelectedPlayer(player.id); setPlayerQuery(player.name); }}><span><b>{player.name}</b><span className="ml-2 text-muted-foreground">{player.pos} · {player.team}</span></span>{selectedPlayer === player.id && <Check className="size-4" />}</button>) : <p className="p-3 text-sm text-muted-foreground">No available player found.</p>}</div>}
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <Select value={selectedOwner} onValueChange={(value) => setSelectedOwner(value as string)}><SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent>{teams.map((team) => <SelectItem key={team} value={team}>{team}{team === settings.userTeam ? ' (you)' : ''}</SelectItem>)}</SelectContent></Select>
              <Button className="h-10 px-4" disabled={!selectedPlayer} onClick={addDraftPick}>Add pick <ChevronRight /></Button>
            </div>
            {notice && <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">{notice}</p>}
            {draftPicks.length > 0 && <Button variant="ghost" className="mt-3 w-full" onClick={() => setDrafted((entries) => entries.filter((entry) => entry !== draftPicks[draftPicks.length - 1]))}><RotateCcw /> Undo last draft pick</Button>}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <Tabs defaultValue="keepers">
              <TabsList className="grid w-full grid-cols-4"><TabsTrigger value="keepers">Keepers</TabsTrigger><TabsTrigger value="picks">Picks</TabsTrigger><TabsTrigger value="setup">Setup</TabsTrigger><TabsTrigger value="data">Data</TabsTrigger></TabsList>
              <TabsContent value="keepers" className="pt-4">
                <p className="mb-3 text-sm text-muted-foreground">One per line: <code>Team | Player | original round | years kept</code>. This year’s cost is calculated automatically. Example: round 5, kept 2 years = round 3.</p>
                <Textarea className="min-h-32 resize-y" value={keepersText} onChange={(event) => setKeepersText(event.target.value)} placeholder={'Super Smash Burrows | Nico Collins | 5 | 2\nTeam Name | Player Name | 9 | 1'} />
                <Button className="mt-3 w-full" variant="secondary" onClick={importKeepers}>Load keeper contracts ({keepers.length}/36)</Button>
                {keepers.some((keeper) => keeper.costRound) && <div className="mt-3 space-y-1 rounded-lg border bg-secondary/40 p-2.5">{keepers.map((keeper) => <div key={`${keeper.owner}-${keeper.playerId}`} className="flex items-center justify-between gap-3 text-xs"><span className="truncate"><b>{keeper.playerName ?? players.find((player) => player.id === keeper.playerId)?.name}</b> · {keeper.owner}</span><Badge variant="outline">Costs R{keeper.costRound ?? '—'}</Badge></div>)}</div>}
                <p className="mt-2 text-xs text-muted-foreground">Keeper-cost selections are automatically skipped on the live draft clock. If two keepers collide in one round, the later entry moves to the nearest earlier round.</p>
              </TabsContent>
              <TabsContent value="picks" className="pt-4"><p className="mb-3 text-sm text-muted-foreground">Paste new picks in draft order, one player per line. Teams are assigned by snake order. To override: <code>Team | Player</code>.</p><Textarea className="min-h-32 resize-y" value={bulkPicksText} onChange={(event) => setBulkPicksText(event.target.value)} placeholder={'Player selected at pick 1\nPlayer selected at pick 2\nPlayer selected at pick 3'} /><Button className="mt-3 w-full" variant="secondary" onClick={importDraftPicks} disabled={!bulkPicksText.trim()}>Add picks after #{draftPicks.length}</Button></TabsContent>
              <TabsContent value="setup" className="space-y-4 pt-4"><Field label="My team"><Select value={settings.userTeam} onValueChange={(value) => { const team = value as string; setSettings({ ...settings, userTeam: team, draftSlot: teams.indexOf(team) + 1 }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{teams.map((team) => <SelectItem key={team} value={team}>{team}</SelectItem>)}</SelectContent></Select></Field><Field label="Draft slot"><Select value={String(settings.draftSlot)} onValueChange={(value) => setSettings({ ...settings, draftSlot: Number(value), userTeam: teams[Number(value) - 1] ?? settings.userTeam })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{teams.map((_, index) => <SelectItem key={index + 1} value={String(index + 1)}>Slot {index + 1}</SelectItem>)}</SelectContent></Select></Field><Field label="Team direction"><Select value={settings.mode} onValueChange={(value) => setSettings({ ...settings, mode: value as LeagueSettings['mode'] })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contend">Contend now</SelectItem><SelectItem value="balanced">Balanced</SelectItem><SelectItem value="rebuild">Rebuild / youth</SelectItem></SelectContent></Select></Field><Field label="Scoring"><Select value={settings.scoring} onValueChange={(value) => setSettings({ ...settings, scoring: value as LeagueSettings['scoring'] })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ppr">PPR</SelectItem><SelectItem value="half-ppr">Half PPR</SelectItem><SelectItem value="standard">Standard</SelectItem></SelectContent></Select></Field></TabsContent>
              <TabsContent value="data" className="pt-4">
                <div className="mb-4 rounded-xl border border-[#d7ff45]/50 bg-[#10271b] p-3 text-white">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-[#d7ff45] text-[#10271b]"><Database className="size-4" /></span><div><p className="text-sm font-semibold">FantasyPros intelligence</p><p className="text-xs text-white/55">{dataSource === 'fantasypros' && lastFantasyProsSync ? `Updated ${new Date(lastFantasyProsSync).toLocaleString()}` : 'Production player data source'}</p></div></div>
                    <Badge className={dataSource === 'fantasypros' ? 'bg-[#d7ff45] text-[#10271b]' : 'bg-white/10 text-white'}>{dataSource === 'fantasypros' ? 'Live' : 'Not loaded'}</Badge>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-white/65">Loads the complete player pool, projections, redraft and dynasty consensus, ADP, tiers, injuries, and news signals. Saved locally so your board remains available during the draft.</p>
                  <Button className="w-full bg-[#d7ff45] text-[#10271b] hover:bg-[#c8ef3e]" onClick={() => void syncFantasyPros()} disabled={fantasyProsSyncing}>
                    <RefreshCw className={fantasyProsSyncing ? 'animate-spin' : ''} /> {fantasyProsSyncing ? 'Refreshing…' : dataSource === 'fantasypros' ? 'Refresh FantasyPros' : 'Load FantasyPros data'}
                  </Button>
                  {dataSource !== 'fantasypros' && <p className="mt-2 rounded-md bg-amber-300/10 px-2 py-1.5 text-xs text-amber-100">Free keys return sample data. The full draft pool requires <a className="font-semibold underline underline-offset-2" href="https://www.fantasypros.com/premium/" target="_blank" rel="noreferrer">FantasyPros HOF production access</a>.</p>}
                  <p className="mt-2 text-center text-xs text-white/45">Data provided by <a className="underline underline-offset-2 hover:text-white" href="https://www.fantasypros.com/api-data/" target="_blank" rel="noreferrer">FantasyPros</a> · personal use only</p>
                </div>
                <div className="mb-4 rounded-xl border border-[#10271b]/15 bg-[#10271b]/5 p-3">
                  <div className="mb-2 flex items-start justify-between gap-2"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-[#10271b] text-white"><Link2 className="size-4" /></span><div><p className="text-sm font-semibold">FantasyPros league bridge</p><p className="text-xs text-muted-foreground">Authenticated ESPN context, without sharing credentials</p></div></div><Badge variant="outline">{leagueSource === 'fantasypros-mcp' ? 'Synced' : 'Ready'}</Badge></div>
                  <p className="mb-2 text-xs leading-relaxed text-muted-foreground">Connect ESPN inside FantasyPros, then connect the official FantasyPros MCP server in ChatGPT or Codex. A connected assistant can send teams, settings, rosters, keepers, and picks into this draft room using its league-snapshot tool.</p>
                  <a className="mb-3 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2" href="https://support.fantasypros.com/hc/en-us/articles/55212611981851-How-do-I-connect-to-the-FantasyPros-MCP-Server" target="_blank" rel="noreferrer">Open official connection guide <ExternalLink className="size-3" /></a>
                  {leagueSource === 'fantasypros-mcp' && <div className="mb-3 rounded-md bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900"><b>{espnLeagueName || 'FantasyPros league'}</b> · {teams.length} teams · {keepers.length} keepers{leagueSnapshotUpdatedAt ? ` · Updated ${new Date(leagueSnapshotUpdatedAt).toLocaleString()}` : ''}</div>}
                  <Textarea className="min-h-24 resize-y font-mono text-xs" value={leagueSnapshotText} onChange={(event) => setLeagueSnapshotText(event.target.value)} placeholder={'Optional fallback: paste a JSON league snapshot\n{"teams":["Team 1","Team 2"],"myTeam":"Team 1","keepers":[]}'} />
                  <Button className="mt-2 w-full" variant="secondary" onClick={importLeagueSnapshot} disabled={!leagueSnapshotText.trim()}><Upload /> Load league snapshot</Button>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Fourth Down stores the snapshot only in this browser. It never receives your ESPN username, password, cookies, or FantasyPros OAuth tokens.</p>
                </div>
                <div className="mb-4 rounded-xl border border-[#10271b]/15 bg-[#10271b]/5 p-3">
                  <div className="mb-2 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-[#10271b] text-white"><Link2 className="size-4" /></span><div><p className="text-sm font-semibold">Direct ESPN sync</p>{leagueSource === 'espn-public' && espnLeagueName && <p className="text-xs text-muted-foreground">Connected to {espnLeagueName}</p>}</div></div>
                  <div className="grid grid-cols-[1fr_92px] gap-2"><Input inputMode="numeric" value={espnLeagueId} onChange={(event) => setEspnLeagueId(event.target.value.replace(/\D/g, ''))} placeholder="League ID" aria-label="ESPN League ID" /><Input inputMode="numeric" value={espnSeason} onChange={(event) => setEspnSeason(Number(event.target.value))} aria-label="ESPN season" /></div>
                  <Button className="mt-2 w-full" onClick={syncEspn} disabled={espnSyncing || !espnLeagueId}>{espnSyncing ? 'Syncing…' : 'Sync ESPN now'}</Button>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Works only for leagues ESPN exposes publicly. Use the authenticated FantasyPros bridge above for a private league.</p>
                </div>
                <p className="mb-2 text-sm font-medium">Backup and custom data</p><p className="mb-2 text-xs text-muted-foreground">CSV is optional. Columns: name, pos, team, projectedPoints, adp, age, dynastyRank, tier, bye</p><Textarea className="min-h-24 resize-y font-mono text-xs" value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder="Optional: paste a custom CSV…" /><div className="mt-3 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={importPlayers} disabled={!csvText.trim()}><Upload /> Import CSV</Button><Button variant="outline" onClick={exportState}><Download /> Back up</Button></div>
              </TabsContent>
            </Tabs>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Signal({ label, value }: { label: string; value: number }) {
  return <div className="mb-3"><div className="mb-1.5 flex justify-between text-sm"><span className="text-white/65">{label}</span><span className="font-mono text-xs text-white/75">{Math.round(value)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#d7ff45]" style={{ width: `${value}%` }} /></div></div>;
}
function PositionBadge({ pos }: { pos: string }) {
  const colors: Record<string, string> = { QB: 'bg-violet-100 text-violet-800', RB: 'bg-emerald-100 text-emerald-800', WR: 'bg-blue-100 text-blue-800', TE: 'bg-orange-100 text-orange-800', K: 'bg-slate-100 text-slate-700', DST: 'bg-rose-100 text-rose-800' };
  return <Badge className={colors[pos] ?? ''}>{pos}</Badge>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1.5 block font-medium">{label}</span>{children}</label>;
}
function normalizeScoring(value?: string): LeagueSettings['scoring'] | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (!normalized) return undefined;
  if (['ppr', 'full-ppr', '1-ppr', '1.0-ppr'].includes(normalized)) return 'ppr';
  if (['half', 'half-ppr', '0.5-ppr'].includes(normalized)) return 'half-ppr';
  if (['standard', 'std', 'non-ppr', '0-ppr'].includes(normalized)) return 'standard';
  return undefined;
}
function validRound(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : undefined;
}
function validCount(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 30 ? parsed : undefined;
}
function resolveKeeperRoundCollisions(entries: DraftedPlayer[]) {
  const usedByOwner = new Map<string, Set<number>>();
  return entries.map((entry) => {
    if (!entry.costRound) return entry;
    const key = entry.owner.toLowerCase();
    const used = usedByOwner.get(key) ?? new Set<number>();
    let costRound = entry.costRound;
    while (used.has(costRound) && costRound > 1) costRound -= 1;
    if (used.has(costRound)) throw new Error(`${entry.owner} has more keeper costs than available rounds near round ${entry.costRound}. Enter an explicit valid cost for one of them.`);
    used.add(costRound); usedByOwner.set(key, used);
    return { ...entry, costRound };
  });
}
function keeperBoardPick(entry: DraftedPlayer, teams: string[]) {
  if (!entry.costRound) return undefined;
  const slot = teams.findIndex((team) => team.toLowerCase() === entry.owner.toLowerCase()) + 1;
  if (!slot) return undefined;
  const pickInRound = entry.costRound % 2 === 1 ? slot : teams.length - slot + 1;
  return (entry.costRound - 1) * teams.length + pickInRound;
}
function nextOpenDraftPick(picks: DraftedPlayer[], keepers: DraftedPlayer[], teams: string[]) {
  const used = new Set(picks.map((entry) => entry.pick));
  const reserved = new Set(keepers.map((entry) => keeperBoardPick(entry, teams)).filter((pick): pick is number => Boolean(pick)));
  let pick = 1;
  while ((used.has(pick) || reserved.has(pick)) && pick < 10000) pick += 1;
  return pick;
}
function ownerForPick(pick: number, teams: string[]) {
  const teamCount = teams.length || 12;
  const round = Math.floor((pick - 1) / teamCount) + 1;
  const pickInRound = ((pick - 1) % teamCount) + 1;
  const ownerSlot = round % 2 === 1 ? pickInRound : teamCount - pickInRound + 1;
  return teams[ownerSlot - 1] ?? `Team ${ownerSlot}`;
}
