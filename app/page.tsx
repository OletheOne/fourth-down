'use client';

import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { ArrowRight, BrainCircuit, Check, ChevronRight, Database, ExternalLink, Link2, RefreshCw, RotateCcw, Search, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { demoPlayers, type DraftedPlayer, type LeagueSettings, parsePlayerCsv, type Player } from '@/lib/draft';
import { normalizeSettings, type DraftAnalysis, nameKey, keeperCost, resolveKeeperContracts } from '@/lib/optimizer';
import { EngineSettings, PlayerRiskEditor } from '@/components/engine-settings';

const defaultSettings: LeagueSettings = {
  userTeam: 'Team 6', draftSlot: 6, scoring: 'ppr', mode: 'balanced',
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, K: 1, DST: 1 },
};
const defaultTeams = Array.from({ length: 12 }, (_, index) => `Team ${index + 1}`);
type DataSource = 'demo' | 'fantasypros' | 'espn' | 'csv';
type LeagueSource = 'manual' | 'espn-public' | 'fantasypros-mcp';
type DraftMode = 'traditional' | 'keeper';
type LeagueProfile = { id: string; name: string };
type LeagueSnapshot = {
  leagueName?: string;
  season?: number;
  teams: Array<string | { name: string; isMine?: boolean }>;
  myTeam?: string;
  scoring?: string;
  starters?: Partial<LeagueSettings['starters']>;
  optimizerSettings?: Partial<LeagueSettings>;
  keepers?: Array<{ playerName: string; owner: string; originalRound?: number; seasonsKept?: number; costRound?: number }>;
  picks?: Array<{ playerName: string; owner: string; pick?: number }>;
  rosters?: Array<{ team: string; players: string[] }>;
  rostersAreCurrentDraft?: boolean;
  updatedAt?: string;
};
type SavedState = {
  players: Player[]; drafted: DraftedPlayer[]; settings: LeagueSettings; teams?: string[]; espnLeagueId?: string; espnSeason?: number;
  dataSource?: DataSource; lastFantasyProsSync?: string; leagueSource?: LeagueSource; leagueSnapshotUpdatedAt?: string;
  leagueRosters?: Array<{ team: string; players: string[] }>; espnLeagueName?: string; draftMode?: DraftMode;
  dataWarnings?: string[];
  rostersAreCurrentDraft?: boolean;
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
  const [rostersAreCurrentDraft,setRostersAreCurrentDraft]=useState(false);
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
  const [dataWarnings, setDataWarnings] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<DraftAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const syncGeneration = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  const [draftMode, setDraftMode] = useState<DraftMode>('keeper');
  const [profiles, setProfiles] = useState<LeagueProfile[]>([{ id: 'discord-league', name: 'Discord League' }]);
  const [activeProfileId, setActiveProfileId] = useState('discord-league');
  const [newProfileName, setNewProfileName] = useState('');

  useEffect(() => {
    let list: LeagueProfile[] = [{ id: 'discord-league', name: 'Discord League' }];
    try { list = JSON.parse(localStorage.getItem('fourth-down-profiles') || 'null') || list; } catch {}
    const active = localStorage.getItem('fourth-down-active-profile') || list[0].id;
    let raw = localStorage.getItem(`fourth-down-profile:${active}`);
    if (!raw) {
      raw = localStorage.getItem('fourth-down-state');
      if (raw) localStorage.setItem(`fourth-down-profile:${active}`, raw);
    }
    setProfiles(list); setActiveProfileId(active);
    if (raw) { try { loadSavedState(JSON.parse(raw) as SavedState); } catch {} }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(`fourth-down-profile:${activeProfileId}`, JSON.stringify(currentSavedState()));
    localStorage.setItem('fourth-down-profiles', JSON.stringify(profiles));
    localStorage.setItem('fourth-down-active-profile', activeProfileId);
  }, [players, drafted, settings, teams, espnLeagueId, espnSeason, dataSource, lastFantasyProsSync, leagueSource, leagueSnapshotUpdatedAt, leagueRosters, espnLeagueName, draftMode, profiles, activeProfileId, hydrated, dataWarnings, rostersAreCurrentDraft]);

  useEffect(() => {
    syncGeneration.current += 1;
    if (!hydrated || dataSource !== 'fantasypros') return;
    // Refresh rankings for scoring/profile/season changes; stat totals alone do not update ECR.
    void syncFantasyPros(true);
    const timer=window.setInterval(()=>void syncFantasyPros(true),15*60*1000);
    return ()=>{window.clearInterval(timer);syncGeneration.current+=1;};
    // syncFantasyPros intentionally uses the snapshot at this profile/scoring boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, activeProfileId, settings.scoring, espnSeason, dataSource]);

  const allKeepers = drafted.filter((entry) => entry.kind === 'keeper');
  const draftPicks = drafted.filter((entry) => entry.kind === 'draft');
  const keepers = draftMode === 'keeper' ? allKeepers : [];
  const activeDrafted = draftMode === 'keeper' ? drafted : draftPicks;
  const available = useMemo(() => players.filter((player) => player.active !== false && !activeDrafted.some((entry) => entry.playerId === player.id || nameKey(entry.playerName) === nameKey(player.name)) && !(rostersAreCurrentDraft&&leagueRosters.some(r=>r.players.some(n=>nameKey(n)===nameKey(player.name))))), [players, activeDrafted,rostersAreCurrentDraft,leagueRosters]);
  const pricedKeepers = allKeepers.filter((entry) => entry.costRound).length;
  useEffect(() => {
    if (!hydrated) return;
    setAnalyzing(true); setAnalysis(null); setAnalysisError('');
    const worker = new Worker(new URL('../lib/draft.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => { setAnalyzing(false); if (event.data.error) setAnalysisError(event.data.error); else setAnalysis(event.data.analysis); };
    worker.onerror = () => { setAnalyzing(false); setAnalysisError('Analysis could not run. Refresh the page; your saved picks are retained.'); };
    worker.postMessage({players, drafted, settings, teams, context:{draftMode,season:espnSeason,dataSource,lastSync:lastFantasyProsSync,warnings:dataWarnings,rosters:leagueRosters,rostersAreCurrentDraft}});
    return () => worker.terminate();
  }, [hydrated, players, drafted, settings, teams, draftMode, espnSeason, dataSource, lastFantasyProsSync, dataWarnings,leagueRosters,rostersAreCurrentDraft]);
  const recommendations = analysis?.recommendations ?? [];
  const best = recommendations[0];
  const currentPick = nextOpenDraftPick(draftPicks, keepers, teams);
  const currentOwner = ownerForPick(currentPick, teams);
  const isMyPick = currentOwner === settings.userTeam;
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
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
      execute: () => ({ analyzing, error: analysisError || undefined, analysis, pick: currentPick, best: best ?? null }),
    });
    register({
      name: 'read_draft_state', title: 'Read complete draft state',
      description: 'Return league settings, keepers, picks, roster context, and the top five current recommendations for a focused on-the-clock analysis.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({
        league: { profile: activeProfile?.name, name: espnLeagueName || undefined, draftMode, source: leagueSource, teams, settings, updatedAt: leagueSnapshotUpdatedAt || undefined },
        currentPick, currentOwner, isMyPick,
          keepers: keepers.map((entry) => ({ player: entry.playerName ?? players.find((player) => player.id === entry.playerId)?.name ?? entry.playerId, owner: entry.owner, originalRound: entry.originalRound, seasonsKept: entry.seasonsKept, costRound: entry.costRound })),
        picks: draftPicks.map((entry) => ({ pick: entry.pick, player: entry.playerName ?? players.find((player) => player.id === entry.playerId)?.name ?? entry.playerId, owner: entry.owner })),
        rosters: leagueRosters, analysis, analyzing, analysisError,
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
          const playerName = keeper.playerName.trim();
          const player = players.find((candidate) => candidate.name.toLowerCase() === playerName.toLowerCase());
          const originalRound = validRound(keeper.originalRound);
          const seasonsKept = validCount(keeper.seasonsKept) ?? (originalRound ? 1 : undefined);
          const costRound = validRound(keeper.costRound) ?? keeperCost(originalRound,seasonsKept,settings);
          return { playerId: player?.id ?? `external-${playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-keeper-${index + 1}`, playerName: player?.name ?? playerName, owner: keeper.owner, pick: index + 1, kind: 'keeper' as const, originalRound, seasonsKept, costRound };
        });
        const resolved = resolveKeeperContracts(additions,settings,teams);
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
          rostersAreCurrentDraft: { type: 'boolean' },
          optimizerSettings: { type:'object', properties:{bench:{type:'number'},superflex:{type:'number'},customScoring:{type:'object',additionalProperties:{type:'number'}},positionScoring:{type:'object',additionalProperties:{type:'object',additionalProperties:{type:'number'}}},positionLimits:{type:'object',additionalProperties:{type:'number'}},keeperRules:{type:'object',properties:{limit:{type:'number'},escalation:{type:'number'},horizon:{type:'number'},discount:{type:'number'},firstRound:{type:'string',enum:['ineligible','round-one']},collision:{type:'string',enum:['earlier','reject']}},additionalProperties:false}},additionalProperties:false},
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
    register({
      name: 'apply_keeper_costs', title: 'Apply keeper round costs',
      description: 'Enrich keepers already entered by team and player name with the finalized FantasyPros/ESPN draft-pick cost. Existing keeper names do not need to be re-entered.',
      inputSchema: {
        type: 'object',
        properties: {
          contracts: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', properties: { playerName: { type: 'string' }, owner: { type: 'string' }, originalRound: { type: 'number' }, seasonsKept: { type: 'number' }, costRound: { type: 'number' } }, required: ['playerName'], additionalProperties: false } },
        },
        required: ['contracts'], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => {
        const values = input as { contracts?: Array<{ playerName?: unknown; owner?: unknown; originalRound?: unknown; seasonsKept?: unknown; costRound?: unknown }> };
        if (!Array.isArray(values.contracts)) throw new Error('contracts must be an array.');
        const missing: string[] = [];
        const next = keepers.map((keeper) => {
          const contract = values.contracts!.find((candidate) => typeof candidate.playerName === 'string' && candidate.playerName.toLowerCase() === keeper.playerName?.toLowerCase() && (typeof candidate.owner !== 'string' || candidate.owner.toLowerCase() === keeper.owner.toLowerCase()));
          if (!contract) return keeper;
          const originalRound = validRound(contract.originalRound) ?? keeper.originalRound;
          const seasonsKept = validCount(contract.seasonsKept) ?? keeper.seasonsKept ?? (originalRound ? 1 : undefined);
          const costRound = validRound(contract.costRound) ?? keeperCost(originalRound,seasonsKept,settings) ?? keeper.costRound;
          return { ...keeper, originalRound, seasonsKept, costRound };
        });
        values.contracts.forEach((contract) => {
          if (typeof contract.playerName !== 'string' || !keepers.some((keeper) => nameKey(keeper.playerName) === nameKey(String(contract.playerName)) && (typeof contract.owner !== 'string' || nameKey(keeper.owner) === nameKey(String(contract.owner))))) missing.push(String(contract.playerName ?? 'unnamed keeper'));
        });
        const resolved = resolveKeeperContracts(next,settings,teams);
        setDrafted((entries) => [...entries.filter((entry) => entry.kind !== 'keeper'), ...resolved]);
        const confirmed = resolved.filter((keeper) => keeper.costRound).length;
        setNotice(`Keeper costs updated: ${confirmed}/${resolved.length} confirmed.${missing.length ? ` No matching keeper: ${missing.join(', ')}.` : ''}`);
        return { updated: confirmed, totalKeepers: resolved.length, unmatched: missing, keepers: resolved.map((keeper) => ({ playerName: keeper.playerName, owner: keeper.owner, costRound: keeper.costRound })) };
      },
    });
    register({
      name: 'sync_mock_draft_board', title: 'Sync mock draft board',
      description: 'Replace the current Traditional-mode profile’s mock draft board from FantasyPros or another mock room. Includes league settings, teams, and every completed pick in exact order.',
      inputSchema: {
        type: 'object', properties: {
          leagueName: { type: 'string' }, myTeam: { type: 'string' }, scoring: { type: 'string' },
          teams: { type: 'array', minItems: 2, maxItems: 32, items: { type: 'string' } },
          starters: { type: 'object', properties: { QB: { type: 'number' }, RB: { type: 'number' }, WR: { type: 'number' }, TE: { type: 'number' }, FLEX: { type: 'number' }, K: { type: 'number' }, DST: { type: 'number' } }, additionalProperties: false },
          picks: { type: 'array', maxItems: 500, items: { type: 'object', properties: { playerName: { type: 'string' }, owner: { type: 'string' }, pick: { type: 'number' } }, required: ['playerName', 'owner'], additionalProperties: false } },
        }, required: ['leagueName', 'teams', 'picks'], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => {
        const snapshot = input as LeagueSnapshot;
        setDraftMode('traditional');
        const result = applyLeagueSnapshot({ ...snapshot, keepers: [] }, 'fantasypros-mcp');
        setNotice(`${snapshot.leagueName || 'Mock draft'} synced in Traditional mode with ${snapshot.picks?.length ?? 0} picks.`);
        return { ...result, draftMode: 'traditional', profile: activeProfile?.name };
      },
    });
    return () => lifecycle.abort();
  }, [activeProfile?.name, available, best, currentPick, currentOwner, draftMode, draftPicks, espnLeagueName, isMyPick, keepers, leagueRosters, leagueSnapshotUpdatedAt, leagueSource, players, recommendations, settings, teams, analysis, analyzing, analysisError]);

  function currentSavedState(): SavedState {
    return { players, drafted, settings, teams, espnLeagueId, espnSeason, dataSource, lastFantasyProsSync, leagueSource, leagueSnapshotUpdatedAt, leagueRosters, espnLeagueName, draftMode, dataWarnings,rostersAreCurrentDraft };
  }

  function loadSavedState(saved: SavedState) {
    setFantasyProsSyncing(false);setAnalysis(null);setAnalyzing(false);setAnalysisError('');
    setPlayers(saved.players?.length ? saved.players : demoPlayers);
    setDrafted(saved.drafted ?? []);
    setSettings(normalizeSettings(saved.settings ?? defaultSettings)); setDataWarnings(saved.dataWarnings ?? []);setRostersAreCurrentDraft(saved.rostersAreCurrentDraft??false);
    setTeams(saved.teams?.length ? saved.teams : defaultTeams);
    setEspnLeagueId(saved.espnLeagueId ?? ''); setEspnSeason(saved.espnSeason ?? new Date().getFullYear());
    setDataSource(saved.dataSource ?? 'demo'); setLastFantasyProsSync(saved.lastFantasyProsSync ?? '');
    setLeagueSource(saved.leagueSource ?? 'manual'); setLeagueSnapshotUpdatedAt(saved.leagueSnapshotUpdatedAt ?? '');
    setLeagueRosters(saved.leagueRosters ?? []); setEspnLeagueName(saved.espnLeagueName ?? '');
    setDraftMode(saved.draftMode ?? 'keeper'); setSelectedPlayer(''); setPlayerQuery(''); setKeepersText(''); setNotice('');
  }

  function switchLeagueProfile(id: string) {
    if (id === activeProfileId) return;
    localStorage.setItem(`fourth-down-profile:${activeProfileId}`, JSON.stringify(currentSavedState()));
    const raw = localStorage.getItem(`fourth-down-profile:${id}`);
    setHydrated(false); setActiveProfileId(id);
    if (raw) loadSavedState(JSON.parse(raw) as SavedState);
    window.setTimeout(() => setHydrated(true), 0);
  }

  function createLeagueProfile() {
    const name = newProfileName.trim();
    if (!name) return;
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'league'}-${Date.now()}`;
    const profile: LeagueProfile = { id, name };
    const initial: SavedState = {
      players: dataSource === 'fantasypros' ? players : demoPlayers, drafted: [], teams: defaultTeams,
      settings: { ...defaultSettings, scoring: settings.scoring }, espnSeason, dataSource: dataSource === 'fantasypros' ? 'fantasypros' : 'demo',
      lastFantasyProsSync: dataSource === 'fantasypros' ? lastFantasyProsSync : '', leagueSource: 'manual', leagueRosters: [], espnLeagueName: name, draftMode: 'traditional',
    };
    localStorage.setItem(`fourth-down-profile:${activeProfileId}`, JSON.stringify(currentSavedState()));
    localStorage.setItem(`fourth-down-profile:${id}`, JSON.stringify(initial));
    setHydrated(false); setProfiles((current) => [...current, profile]); setActiveProfileId(id); loadSavedState(initial); setNewProfileName('');
    window.setTimeout(() => { setHydrated(true); setNotice(`${name} created in Traditional mode.`); }, 0);
  }

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
      const costRound = keeperCost(originalRound,seasonsKept,settings);
      const player = players.find((candidate) => candidate.name.toLowerCase() === playerName.toLowerCase());
      if (!player) missing.push(playerName);
      additions.push({ playerId: player?.id ?? `external-${playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-keeper-${index + 1}`, playerName: player?.name ?? playerName, owner, pick: index + 1, kind: 'keeper', originalRound, seasonsKept, costRound });
    });
    try {
      const resolved = resolveKeeperContracts(additions,settings,teams);
      setDrafted((entries) => [...entries.filter((entry) => entry.kind !== 'keeper'), ...resolved]);
      const moved = resolved.filter((entry, index) => entry.costRound !== additions[index].costRound).length;
      const pending = resolved.filter((entry) => !entry.costRound).length;
      setNotice(`Added ${resolved.length} keepers.${pending ? ` ${pending} round cost${pending === 1 ? ' is' : 's are'} pending.` : ''}${moved ? ` ${moved} duplicate round cost${moved === 1 ? ' was' : 's were'} moved one round earlier.` : ''}${missing.length ? ` ${missing.length} name${missing.length === 1 ? '' : 's'} will match automatically when the production player pool loads.` : ''}`);
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
      const costRound = kind === 'keeper' ? validRound(item.costRound) ?? keeperCost(originalRound,seasonsKept,{...settings,...snapshot.optimizerSettings}) : undefined;
      return { playerId: player?.id ?? `external-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kind}-${pick}`, playerName: player?.name ?? name, owner, pick, kind, originalRound, seasonsKept, costRound };
    };
    const nextKeepers = resolveKeeperContracts((snapshot.keepers ?? []).map((keeper, index) => makeEntry(keeper, index + 1, 'keeper')), {...settings,...snapshot.optimizerSettings},syncedTeams);
    const nextPicks = (snapshot.picks ?? []).map((pick, index) => makeEntry(pick, pick.pick && pick.pick > 0 ? Math.round(pick.pick) : index + 1, 'draft')).sort((a, b) => a.pick - b.pick);
    const effectiveKeepers = snapshot.keepers ? nextKeepers : keepers;
    const effectivePicks = snapshot.picks ? nextPicks : draftPicks;
    setTeams(syncedTeams);
    setSettings((current) => normalizeSettings({ ...current, ...snapshot.optimizerSettings, scoring, starters, rulesConfirmed:false, userTeam: syncedTeams.includes(myTeam) ? myTeam : syncedTeams[0], draftSlot: syncedTeams.includes(myTeam) ? syncedTeams.indexOf(myTeam) + 1 : 1 }));
    setSelectedOwner(ownerForPick(nextOpenDraftPick(effectivePicks, effectiveKeepers, syncedTeams), syncedTeams));
    setDrafted((current) => [
      ...(snapshot.keepers ? nextKeepers : current.filter((entry) => entry.kind === 'keeper')),
      ...(snapshot.picks ? nextPicks : current.filter((entry) => entry.kind === 'draft')),
    ]);
    setLeagueRosters(Array.isArray(snapshot.rosters) ? snapshot.rosters.filter((roster) => roster?.team && Array.isArray(roster.players)) : []);
    setRostersAreCurrentDraft(snapshot.rostersAreCurrentDraft??false);
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
    const generation=++syncGeneration.current;
    setFantasyProsSyncing(true);
    if (!silent) setNotice('Refreshing FantasyPros rankings, projections, ADP, and injuries…');
    const scoring = settings.scoring === 'half-ppr' ? 'HALF' : settings.scoring === 'ppr' ? 'PPR' : 'STD';
    try {
      const response = await fetch(`/api/fantasypros?season=${espnSeason}&scoring=${scoring}`, { cache: 'no-store' });
      const data = await response.json() as { code?: string; error?: string; players?: Player[]; updatedAt?: string; warnings?: string[] };
      if(generation!==syncGeneration.current)return;
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
      const nextByName = new Map(data.players.map((player) => [nameKey(player.name), player]));
      setDrafted((entries) => entries.map((entry) => {
        const previousPlayer = oldPlayers.get(entry.playerId);
        const replacement = nextByName.get(nameKey(entry.playerName ?? previousPlayer?.name ?? ''));
        return replacement ? { ...entry, playerId: replacement.id, playerName: replacement.name } : entry;
      }));
      setPlayers(current=>{const riskByName=new Map(current.filter(p=>p.risk).map(p=>[nameKey(p.name),p.risk]));return data.players!.map(p=>({...p,risk:riskByName.get(nameKey(p.name))}));}); setDataWarnings(data.warnings ?? []);
      setDataSource('fantasypros');
      setLastFantasyProsSync(data.updatedAt ?? new Date().toISOString());
      setNotice(`FantasyPros loaded ${data.players.length} players.${data.warnings?.length ? ` ${data.warnings.join(' ')}` : ''}`);
    } catch (error) {
      if(generation===syncGeneration.current){const message=error instanceof Error?error.message:'Could not refresh FantasyPros.';setNotice(message);setDataWarnings([`Refresh failed: ${message} Saved data retained.`]);}
    } finally {
      if(generation===syncGeneration.current)setFantasyProsSyncing(false);
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
          <Select value={activeProfileId} onValueChange={(value) => switchLeagueProfile(value as string)}><SelectTrigger className="h-9 w-[190px] border-white/15 bg-white/8 text-white"><SelectValue /></SelectTrigger><SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}</SelectContent></Select>
          <div className="hidden items-center gap-5 text-sm text-white/65 sm:flex">
            <span><b className="text-white">{teams.length}</b> teams</span><span className="capitalize"><b className="text-white">{draftMode}</b> draft</span><span><b className="text-white">{available.length}</b> available</span><span className={dataSource === 'demo' ? 'text-amber-300' : 'text-[#d7ff45]'}>{sourceLabel}</span>
          </div>
          <Badge className={isMyPick ? 'bg-[#d7ff45] text-[#0a1510]' : 'bg-white/10 text-white'}>{isMyPick ? 'You’re on the clock' : `Pick ${currentPick}`}</Badge>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_390px] sm:px-7">
        <section className="space-y-5">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="grid bg-[#10271b] text-white md:grid-cols-[1.25fr_.75fr]">
              <div className="p-6 sm:p-8">
                <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#d7ff45]"><span className="size-2 animate-pulse rounded-full bg-[#d7ff45]" /> {analyzing ? 'Simulating your draft…' : isMyPick ? 'Best pick on your clock' : 'Plan for your upcoming pick'}</div>
                {best ? <>
                  <div className="mb-3 flex flex-wrap items-end gap-3"><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{best.name}</h1><Badge className="mb-1 bg-white/10 text-white">{best.pos} · {best.team}</Badge></div>
                  <p className="max-w-2xl text-base leading-relaxed text-white/67">{best.rationale.join('. ')}.</p>
                  <div className="mt-6 flex flex-wrap gap-3"><Button className="h-10 bg-[#d7ff45] px-4 text-[#0a1510] hover:bg-[#c8ef3e]" onClick={() => { setSelectedPlayer(best.id); setPlayerQuery(best.name); setSelectedOwner(settings.userTeam); }}>Queue for my team <ArrowRight /></Button><span className="self-center text-sm text-white/70">{best.confidence} confidence · model value {best.score.toFixed(1)}</span></div>
                </> : <h1 className="text-2xl font-semibold">{analyzing ? 'Comparing completed rosters and next-turn options' : analysisError || 'No eligible recommendation. Review data and league rules below.'}</h1>}
              </div>
              {best && <div className="border-t border-white/10 bg-black/10 p-6 md:border-l md:border-t-0 sm:p-8">
                <p className="mb-4 text-xs font-semibold uppercase tracking-[.13em] text-white/45">Decision signals</p>
                <dl className="space-y-3 text-sm"><div><dt className="text-white/60">Roster improvement now</dt><dd className="text-lg">+{best.marginalPoints.toFixed(1)} model points</dd></div><div><dt className="text-white/60">Position replacement projection</dt><dd>{best.replacementPoints.toFixed(1)} points</dd></div><div><dt className="text-white/60">Available next turn (model only)</dt><dd>{best.nextPick ? `${Math.round(best.survival*100)}% · pick ${best.nextPick}` : 'No later pick'}</dd></div>{draftMode==='keeper'&&<div><dt className="text-white/60">Keeper portfolio option value</dt><dd>{best.keeperValue.toFixed(1)} · {best.nextKeeperRound?`next year R${best.nextKeeperRound}`:'not eligible next year'}</dd></div>}</dl>
              </div>}
            </div>
          </div>

          <section className="rounded-2xl border bg-card p-5 space-y-3" aria-live="polite">
            <h2 className="text-lg font-semibold">Decision audit</h2>
            <p className="text-sm">{analysis?.comparison ?? (analyzing?'Recalculating after your latest change.':'A comparison appears when analysis is ready.')}</p>
            {best&&<p className="text-sm">{best.baseline?'Conservative baseline selected: no alternative clears the simulation-noise threshold.':`Conservative simulated edge over the immediate roster-value baseline: ${best.conservativeEdge?.toFixed(1)} points.`} Ranking uses the conservative edge; raw model values can be higher for uncertain alternatives.</p>}
            {analysis&&<p className="text-sm text-muted-foreground">{analysis.candidateCount} shortlisted choices · {analysis.simulations} shared draft scenarios per choice · full remaining-draft rollout. {analysis.eligible} players with usable projections; {analysis.excluded} excluded from recommendations. Open starting slots: {analysis.openSlots.join(', ')||'none'}.</p>}
            {best&&<><p className="text-sm"><b>Example sequence:</b> {best.plan.join(' → ')}</p><p className="text-sm text-muted-foreground">Illustrative, not a promise of availability. Model value combines optimized starters, bye cover, bench insurance and (keeper mode only) discounted keeper options. It is not a win probability.</p><ul className="list-disc pl-5 text-sm space-y-1">{best.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>{best.newsHeadline&&<div className="rounded-lg bg-secondary p-3 text-sm"><b>{best.newsHeadline}</b><p className="mt-1">{best.newsBody}</p><p className="mt-1 text-muted-foreground">{best.newsUpdatedAt?new Date(best.newsUpdatedAt).toLocaleString():'News date unavailable'} · availability/role flags influence uncertainty, not invented point deductions.</p></div>}
              <PlayerRiskEditor key={best.id} player={best} onSave={risk=>setPlayers(ps=>ps.map(p=>p.id===best.id?{...p,risk}:p))}/></>}
            {analysis?.warnings.map(w=><p key={w} className="rounded-md bg-amber-50 p-2 text-sm text-amber-950">{w}</p>)}
            <details><summary className="cursor-pointer text-sm font-medium">How to interpret this model</summary><p className="mt-2 text-sm text-muted-foreground">Opponent choices use ADP dispersion, their own roster vacancies, position limits, and recent draft runs. Bench insurance assumes a 12% reserve option value with diminishing returns. Keeper future values use dynasty consensus as a proxy, not a forecast of future rankings. We do not apply a second age or PPR penalty/bonus. Historical outcome validation is not available; automated scenario tests check behavior, not guaranteed performance. Unsupported scoring and missing source timestamps remain explicit warnings.</p></details>
            <details><summary className="cursor-pointer text-sm font-medium">Validation results & scope</summary><p className="mt-2 text-sm text-muted-foreground">96 synthetic first-pick regression cases, zero illegal completed rosters. The conservative model averaged 1,483 starter points versus 1,477 for ADP/positional value and 1,477 for expert rankings. The roughly 6-point difference is smaller than sampling uncertainty (about ±14): no meaningful advantage is established. This is not historical NFL validation. Supported draft: snake, traditional or round-cost keepers. Auction, traded-pick schedules, IDP and custom flex eligibility require additional support.</p></details>
          </section>

          <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Next best options</h2><p className="text-sm text-muted-foreground">Re-ranked after every keeper and pick.</p></div><Badge variant="outline">{settings.mode}</Badge></div>
            <Table>
              <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Player / why</TableHead><TableHead>Pos</TableHead><TableHead className="hidden sm:table-cell">Proj.</TableHead><TableHead className="hidden md:table-cell">Lasts?</TableHead><TableHead className="text-right">Model value</TableHead></TableRow></TableHeader>
              <TableBody>{recommendations.slice(0, 8).map((player, index) => <TableRow key={player.id} className="cursor-pointer" onClick={() => { setSelectedPlayer(player.id); setPlayerQuery(player.name); }}><TableCell className="font-mono text-muted-foreground">{index + 1}</TableCell><TableCell><div className="font-medium">{player.name}</div><div className="text-sm text-muted-foreground">+{player.marginalPoints.toFixed(1)} roster gain · next: {player.nextOption??'last pick'}</div><details onClick={e=>e.stopPropagation()}><summary className="text-sm cursor-pointer">Tradeoffs & data cautions</summary><p className="text-sm">{player.rationale.join('. ')}</p><p className="text-sm text-muted-foreground">{player.issues.join(' · ')}</p></details></TableCell><TableCell><PositionBadge pos={player.pos} /></TableCell><TableCell className="hidden sm:table-cell">{player.projectedValue.toFixed(1)}</TableCell><TableCell className="hidden md:table-cell">{player.nextPick?`${Math.round(player.survival*100)}%`:'—'}</TableCell><TableCell className="text-right font-mono font-semibold">{player.score.toFixed(1)}</TableCell></TableRow>)}</TableBody>
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
            <Tabs defaultValue="setup">
              <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="keepers">Keepers</TabsTrigger><TabsTrigger value="setup">Setup</TabsTrigger><TabsTrigger value="data">Data</TabsTrigger></TabsList>
              <TabsContent value="keepers" className="pt-4">
                {draftMode === 'traditional' && <div className="mb-3 rounded-lg border bg-secondary/50 p-3 text-sm"><b>Traditional mode is active.</b><p className="mt-1 text-muted-foreground">Keepers are retained in this profile but do not remove players or reserve picks. Switch this profile to Keeper mode in Setup to activate them.</p></div>}
                <div className="mb-3 rounded-lg border border-[#10271b]/15 bg-[#10271b]/5 p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Draft-day resync planned</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">About 15 minutes before the draft, resync ESPN in FantasyPros. Then ask me to read its Keepers/Draft Picks page and sync Fourth Down.</p></div><Badge variant="outline">{keepers.length ? `${pricedKeepers}/${keepers.length} priced` : 'Waiting'}</Badge></div>
                  <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2" href="https://www.fantasypros.com/nfl/myleagues/settings/" target="_blank" rel="noreferrer">Open FantasyPros league setup <ExternalLink className="size-3" /></a>
                </div>
                <p className="mb-3 text-sm text-muted-foreground"><b>Fallback:</b> enter only <code>Team | Player</code>. Those keepers load immediately and stay marked “Cost pending.” If needed, add <code>| original round | years kept</code> later; this year’s cost is calculated automatically.</p>
                <Textarea className="min-h-32 resize-y" value={keepersText} onChange={(event) => setKeepersText(event.target.value)} placeholder={'Super Smash Burrows | Nico Collins | 5 | 2\nTeam Name | Player Name | 9 | 1'} />
                <Button className="mt-3 w-full" variant="secondary" onClick={importKeepers}>Load keepers ({keepers.length}/36)</Button>
                {keepers.length > 0 && <div className="mt-3 space-y-1 rounded-lg border bg-secondary/40 p-2.5">{keepers.map((keeper) => <div key={`${keeper.owner}-${keeper.playerId}`} className="flex items-center justify-between gap-3 text-xs"><span className="truncate"><b>{keeper.playerName ?? players.find((player) => player.id === keeper.playerId)?.name}</b> · {keeper.owner}</span><Badge variant="outline">{keeper.costRound ? `Costs R${keeper.costRound}` : 'Cost pending'}</Badge></div>)}</div>}
                <p className="mt-2 text-xs text-muted-foreground">Keeper-cost selections are automatically skipped on the live draft clock. If two keepers collide in one round, the later entry moves to the nearest earlier round.</p>
              </TabsContent>
              <TabsContent value="setup" className="space-y-4 pt-4">
                <Field label="Draft format"><Select value={draftMode} onValueChange={(value) => {setDraftMode(value as DraftMode);setSettings(s=>({...s,rulesConfirmed:false}));}}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="traditional">Traditional draft</SelectItem><SelectItem value="keeper">Keeper draft</SelectItem></SelectContent></Select></Field>
                <div><p className="mb-1.5 text-sm font-medium">Add another league</p><div className="grid grid-cols-[1fr_auto] gap-2"><Input value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} placeholder="Mock Draft League" /><Button variant="secondary" onClick={createLeagueProfile} disabled={!newProfileName.trim()}>Create</Button></div><p className="mt-1.5 text-xs text-muted-foreground">Every league keeps its own settings, keepers, picks, and sync state.</p></div>
                <Field label="My team"><Select value={settings.userTeam} onValueChange={(value) => { const team = value as string; setSettings({ ...settings, userTeam: team, draftSlot: teams.indexOf(team) + 1 }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{teams.map((team) => <SelectItem key={team} value={team}>{team}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Draft slot"><Select value={String(settings.draftSlot)} onValueChange={(value) => setSettings({ ...settings, draftSlot: Number(value), userTeam: teams[Number(value) - 1] ?? settings.userTeam })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{teams.map((_, index) => <SelectItem key={index + 1} value={String(index + 1)}>Slot {index + 1}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Team direction"><Select value={settings.mode} onValueChange={(value) => setSettings({ ...settings, mode: value as LeagueSettings['mode'] })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contend">Contend now</SelectItem><SelectItem value="balanced">Balanced</SelectItem><SelectItem value="rebuild">Rebuild / youth</SelectItem></SelectContent></Select></Field>
                <Field label="Scoring"><Select value={settings.scoring} onValueChange={(value) => setSettings({ ...settings, rulesConfirmed:false, scoring: value as LeagueSettings['scoring'] })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ppr">PPR</SelectItem><SelectItem value="half-ppr">Half PPR</SelectItem><SelectItem value="standard">Standard</SelectItem></SelectContent></Select></Field>
                <EngineSettings settings={settings} onChange={setSettings} keeper={draftMode==='keeper'}/>
              </TabsContent>
              <TabsContent value="data" className="pt-4">
                <div className="mb-4 rounded-xl border border-[#d7ff45]/50 bg-[#10271b] p-3 text-white">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-[#d7ff45] text-[#10271b]"><Database className="size-4" /></span><div><p className="text-sm font-semibold">FantasyPros intelligence</p><p className="text-xs text-white/55">{dataSource === 'fantasypros' && lastFantasyProsSync ? `Updated ${new Date(lastFantasyProsSync).toLocaleString()}` : 'Production player data source'}</p></div></div>
                    <Badge className={dataSource === 'fantasypros' ? 'bg-[#d7ff45] text-[#10271b]' : 'bg-white/10 text-white'}>{dataSource === 'fantasypros' ? 'Live' : 'Not loaded'}</Badge>
                  </div>
                  <p className="mb-3 text-sm leading-relaxed text-white/75">Loads current projections, rankings, consensus ADP, expert disagreement, injuries and recent news. Players without usable current projections stay out of recommendations. Refreshes every 15 minutes while open; saved locally for draft continuity.</p>
                  <Button className="w-full bg-[#d7ff45] text-[#10271b] hover:bg-[#c8ef3e]" onClick={() => void syncFantasyPros()} disabled={fantasyProsSyncing}>
                    <RefreshCw className={fantasyProsSyncing ? 'animate-spin' : ''} /> {fantasyProsSyncing ? 'Refreshing…' : dataSource === 'fantasypros' ? 'Refresh FantasyPros' : 'Load FantasyPros data'}
                  </Button>
                  {dataSource !== 'fantasypros' && <p className="mt-2 rounded-md bg-amber-300/10 px-2 py-1.5 text-xs text-amber-100">Free keys return sample data. The full draft pool requires <a className="font-semibold underline underline-offset-2" href="https://www.fantasypros.com/premium/" target="_blank" rel="noreferrer">FantasyPros HOF production access</a>.</p>}
                  <p className="mt-2 text-center text-xs text-white/45">Data provided by <a className="underline underline-offset-2 hover:text-white" href="https://www.fantasypros.com/api-data/" target="_blank" rel="noreferrer">FantasyPros</a> · personal use only</p>
                </div>
                <div className="mb-4 rounded-xl border border-[#10271b]/15 bg-[#10271b]/5 p-3">
                  <div className="mb-2 flex items-start justify-between gap-2"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-[#10271b] text-white"><Link2 className="size-4" /></span><div><p className="text-sm font-semibold">FantasyPros league bridge</p><p className="text-xs text-muted-foreground">Authenticated ESPN context, without sharing credentials</p></div></div><Badge variant="outline">{leagueSource === 'fantasypros-mcp' ? 'Synced' : 'Ready'}</Badge></div>
                  <p className="mb-2 text-xs leading-relaxed text-muted-foreground">A connected assistant can send teams, settings, rosters, keepers, and picks from an ESPN league or mock draft into the active profile. Mock-board sync replaces only that profile’s picks.</p>
                  <a className="mb-3 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2" href="https://support.fantasypros.com/hc/en-us/articles/55212611981851-How-do-I-connect-to-the-FantasyPros-MCP-Server" target="_blank" rel="noreferrer">Open official connection guide <ExternalLink className="size-3" /></a>
                  {leagueSource === 'fantasypros-mcp' && <div className="mb-3 rounded-md bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900"><b>{espnLeagueName || 'FantasyPros league'}</b> · {teams.length} teams · {keepers.length} keepers{leagueSnapshotUpdatedAt ? ` · Updated ${new Date(leagueSnapshotUpdatedAt).toLocaleString()}` : ''}</div>}
                  {leagueRosters.length>0&&<div className="mb-3 space-y-2 text-sm"><p>Are these synced rosters from the current draft? Previous-season rosters must not remove players from this year's pool.</p><Select value={rostersAreCurrentDraft?'current':'unconfirmed'} onValueChange={v=>setRostersAreCurrentDraft(v==='current')}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unconfirmed">Unconfirmed / prior-season roster</SelectItem><SelectItem value="current">Confirmed current draft rosters</SelectItem></SelectContent></Select></div>}
                  <Textarea className="min-h-24 resize-y font-mono text-xs" value={leagueSnapshotText} onChange={(event) => setLeagueSnapshotText(event.target.value)} placeholder={'Optional fallback: paste a JSON league snapshot\n{"teams":["Team 1","Team 2"],"myTeam":"Team 1","keepers":[]}'} />
                  <Button className="mt-2 w-full" variant="secondary" onClick={importLeagueSnapshot} disabled={!leagueSnapshotText.trim()}><Upload /> Load league snapshot</Button>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Fourth Down stores the snapshot only in this browser. It never receives your ESPN username, password, cookies, or FantasyPros OAuth tokens.</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </aside>
      </div>
    </main>
  );
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
