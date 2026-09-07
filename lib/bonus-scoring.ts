import model from './bonus-model.json';
import type { Player, LeagueSettings } from './draft';

export type BonusEstimate = { points: number; details: string[]; issues: string[] };
const teamKey=(t:string)=>({JAC:'JAX',LA:'LAR',OAK:'LV',SD:'LAC'}[t]??t);

// The provider's aggregate mean cannot identify threshold-event frequencies.
// Use separately trained historical distributions, never fabricated provider stats.
export function estimateBonuses(p:Player,s:LeagueSettings):BonusEstimate {
  const result:BonusEstimate={points:0,details:[],issues:[]};
  const weights=p.pos==='K'?s.bonusRules?.fieldGoals:p.pos==='DST'?s.bonusRules?.pointsAllowed:undefined;
  if(!weights)return result;
  if(weights.length!==(p.pos==='K'?3:7)||weights.some(x=>!Number.isFinite(x))){result.issues.push('Invalid bonus scoring bands; correct Setup');return result;}
  if(p.season!==model.forecastSeason){result.issues.push(`Bonus model is trained only for ${model.forecastSeason}; season mismatch, bonus excluded`);return result;}
  const stats=p.stats??{};
  const standard=p.pointsByScoring?.standard??(p.projectionScoring==='standard'?p.projectedPoints:undefined);
  const fields=p.pos==='K'?['fg','xpt']:['def_sack','def_int','def_fr','def_safety','def_td'];
  if(standard===undefined||fields.some(k=>!Number.isFinite(stats[k]))){result.issues.push('Bonus estimate needs a verified provider baseline and component projections; refresh data');return result;}
  const reconstructed=p.pos==='K'?3*stats.fg+stats.xpt:stats.def_sack+2*stats.def_int+2*stats.def_fr+2*stats.def_safety+6*stats.def_td;
  // Fail closed if provider starts including these bands, or changes its definition.
  if(Math.abs(reconstructed-standard)>.15){result.issues.push('Provider baseline changed or already includes extra scoring; bonus excluded to prevent double counting');return result;}
  if(p.pos==='K'){
    // Development selected the league prior over individual kicker histories.
    const probabilities=model.kicker.prior;
    const base=s.positionScoring?.K?.fg??s.customScoring?.fg??3;
    result.points=stats.fg*probabilities.reduce((sum,pr,i)=>sum+pr*(weights[i]-base),0);
    result.details.push(`Estimated FG-distance adjustment ${result.points>=0?'+':''}${result.points.toFixed(1)} points; ${stats.fg.toFixed(1)} projected made FGs × historical distance mix (${probabilities.map(x=>Math.round(x*100)).join('/')}% for 0–39/40–49/50+ yards).`);
    result.issues.push('FG distance mix is a historical estimate, not a FantasyPros event projection. Held-out seasonal bonus MAE about 3.5 points conditional on made-FG volume; volume error is additional.');
  }else{
    const profiles=model.defense.profiles as Record<string,number[]>;
    const probabilities=profiles[teamKey(p.team)]??model.defense.prior;
    const games=p.expectedGames??17;
    if(!Number.isFinite(games)||games<0||games>17){result.issues.push('Invalid projected DST games; bonus excluded');return result;}
    result.points=games*probabilities.reduce((sum,pr,i)=>sum+pr*weights[i],0);
    result.details.push(`Estimated points-allowed adjustment ${result.points>=0?'+':''}${result.points.toFixed(1)} points over ${games} games; ${profiles[teamKey(p.team)]?'team history shrunk toward league rates':'league-prior fallback'}.`);
    result.issues.push('Points-allowed bands are historical estimates. Held-out seasonal bonus MAE about 11.7 points under Discord weights; schedule strength and roster changes are not modeled. Historical scoring is reconstructed, not reconciled ESPN game logs.');
  }
  result.details.push(`nflverse ${model.trainedThrough} cutoff; model ${model.version}; no current-season outcomes used.`);
  return result;
}
