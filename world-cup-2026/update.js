const fs = require('fs');
const path = require('path');

const date = process.argv[2];
if (!date) {
  console.error('Usage: node update.js YYYY-MM-DD');
  process.exit(1);
}

const dir = __dirname;

function parseCSVLine(line) {
  const values = [];
  let cur = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { values.push(cur); cur = ''; }
    else { cur += ch; }
  }
  values.push(cur);
  return values;
}

function parseCSV(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (values[i] ?? '').trim());
    return obj;
  });
}

const teamsData = parseCSV(path.join(dir, 'data/teams.csv'));
const teamByCode = {};
teamsData.forEach(t => {
  teamByCode[t.Code] = { flag: t.Flag, name: t.Team, group: t.Group };
});

// Build group -> [codes] map
const groups = {};
teamsData.forEach(t => {
  if (!groups[t.Group]) groups[t.Group] = [];
  groups[t.Group].push(t.Code);
});

const playersData = parseCSV(path.join(dir, 'data/players.csv'));
const players = playersData.map(p => ({
  name: p.Name,
  picks: p.Picks.split(',').map(c => c.trim()),
}));

const matchesData = parseCSV(path.join(dir, 'data/matches.csv'));

const matchDate = m => m['Datetime'].slice(0, 10);

const todayMatches = matchesData.filter(m =>
  matchDate(m) === date &&
  m['Home Team'] &&
  m['Home Score'] !== '' &&
  m['Away Score'] !== ''
);

const prevMatches = matchesData.filter(m =>
  matchDate(m) < date &&
  m['Home Team'] &&
  m['Home Score'] !== '' &&
  m['Away Score'] !== ''
);

// Compute cumulative score for a player up through a set of matches
function computeScore(picks, matches) {
  let score = 0;
  for (const m of matches) {
    const home = m['Home Team'];
    const away = m['Away Team'];
    const homeScore = parseInt(m['Home Score']);
    const awayScore = parseInt(m['Away Score']);
    if (picks.includes(home)) score += homeScore - awayScore;
    if (picks.includes(away)) score += awayScore - homeScore;
  }
  return score;
}

// For each player, compute delta from today's matches
function computeDelta(picks, matches) {
  // Returns list of {code, delta} in match order, only for picked teams that played
  const entries = [];
  for (const m of matches) {
    const home = m['Home Team'];
    const away = m['Away Team'];
    const homeScore = parseInt(m['Home Score']);
    const awayScore = parseInt(m['Away Score']);
    if (picks.includes(home)) {
      entries.push({ code: home, delta: homeScore - awayScore });
    }
    if (picks.includes(away)) {
      entries.push({ code: away, delta: awayScore - homeScore });
    }
  }
  return entries;
}

function fmtDelta(delta) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '+0';
}

// Compute group standings from a set of completed matches
function groupStandings(groupCode, matches) {
  const teams = groups[groupCode];
  const stats = {};
  teams.forEach(t => { stats[t] = { pts: 0, gd: 0, gf: 0 }; });
  for (const m of matches) {
    const h = m['Home Team'], a = m['Away Team'];
    if (!teams.includes(h) || !teams.includes(a)) continue;
    const hs = parseInt(m['Home Score']), as = parseInt(m['Away Score']);
    stats[h].gf += hs; stats[h].gd += hs - as;
    stats[a].gf += as; stats[a].gd += as - hs;
    if (hs > as)      { stats[h].pts += 3; }
    else if (hs < as) { stats[a].pts += 3; }
    else              { stats[h].pts += 1; stats[a].pts += 1; }
  }
  return teams.map(t => ({ code: t, ...stats[t] }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

// Determine medal prefix for a team on a final group matchday, or '' if not final/not ready
// Returns map of code -> medal emoji, or null if not applicable
function groupMedals(groupCode) {
  const teams = groups[groupCode];
  // All matches for this group (all 6)
  const groupMatches = matchesData.filter(m => teams.includes(m['Home Team']) && teams.includes(m['Away Team']));
  const totalMatches = groupMatches.length; // should be 6
  const completedAll = groupMatches.filter(m => m['Home Score'] !== '' && m['Away Score'] !== '');
  if (completedAll.length !== totalMatches) return null;

  const standings = groupStandings(groupCode, completedAll);

  // Check for ambiguity: any two adjacent teams with same pts, gd, and gf
  const medals = ['🥇', '🥈', '🥉', '❌'];
  let ambiguous = false;
  for (let i = 0; i < standings.length - 1; i++) {
    const a = standings[i], b = standings[i + 1];
    if (a.pts === b.pts && a.gd === b.gd && a.gf === b.gf) {
      ambiguous = true;
      break;
    }
  }

  if (ambiguous) {
    console.error(`Warning: ambiguous standings in Group ${groupCode} 🥇🥈🥉❌`);
    return null;
  }

  const result = {};
  standings.forEach((t, i) => { result[t.code] = medals[i]; });
  return result;
}

const GROUP_STAGE_END = '2026-06-27';

// Returns {home: emoji, away: emoji} or null if emojis can't be determined
function knockoutEmojis(m) {
  const hs = parseInt(m['Home Score']), as = parseInt(m['Away Score']);
  if (hs === as) {
    console.error(`Warning: ambiguous result in knockout match ${m['Home Team']} vs ${m['Away Team']} ✅❌`);
    return null;
  }
  return hs > as
    ? { home: '✅', away: '❌' }
    : { home: '❌', away: '✅' };
}

// For each today's match, precompute medals if this is the final group matchday
const matchMedals = {};
for (const m of todayMatches) {
  const home = m['Home Team'];
  const group = teamByCode[home]?.group;
  if (!group || matchMedals[group] !== undefined) continue;
  const teams = groups[group];
  // Is today the final matchday for this group?
  // Final matchday = all 4 teams play on the same day (2 simultaneous games)
  const groupMatchesToday = matchesData.filter(m2 =>
    matchDate(m2) === date && teams.includes(m2['Home Team']) && teams.includes(m2['Away Team'])
  );
  const todayTeams = new Set(groupMatchesToday.flatMap(m2 => [m2['Home Team'], m2['Away Team']]));
  const isFinalDay = todayTeams.size === 4 && groupMatchesToday.every(m2 => m2['Home Score'] !== '' && m2['Away Score'] !== '');
  matchMedals[group] = isFinalDay ? groupMedals(group) : null;
}

const lines = [];
lines.push(date);
lines.push('');

if (todayMatches.length === 0) {
  lines.push('No matches played today.');
} else {
  // Match lines
  for (const m of todayMatches) {
    const home = m['Home Team'];
    const away = m['Away Team'];
    const homeFlag = teamByCode[home]?.flag ?? home;
    const awayFlag = teamByCode[away]?.flag ?? away;
    let homePrefix = '', awaySuffix = '';
    if (date > GROUP_STAGE_END) {
      const ko = knockoutEmojis(m);
      if (ko) { homePrefix = `${ko.home} `; awaySuffix = ` ${ko.away}`; }
    } else {
      const group = teamByCode[home]?.group;
      const medals = matchMedals[group];
      if (medals) { homePrefix = `${medals[home]} `; awaySuffix = ` ${medals[away]}`; }
    }
    lines.push(`${homePrefix}${home} ${homeFlag} ${m['Home Score']}- ${m['Away Score']} ${awayFlag} ${away}${awaySuffix}`);
  }

  lines.push('');

  // Player lines
  const playerRows = players.map(player => {
    const prevScore = computeScore(player.picks, prevMatches);
    const deltas = computeDelta(player.picks, todayMatches);
    const todayTotal = deltas.reduce((sum, e) => sum + e.delta, 0);
    const newScore = prevScore + todayTotal;
    return { player, prevScore, deltas, newScore };
  });

  playerRows.sort((a, b) => b.newScore - a.newScore || b.prevScore - a.prevScore);

  for (const { player, prevScore, deltas, newScore } of playerRows) {
    if (deltas.length === 0) {
      lines.push(`${player.name}: ${newScore} = ${newScore}`);
    } else {
      const deltaParts = deltas.map(e => `${fmtDelta(e.delta)}${teamByCode[e.code]?.flag ?? e.code}`);
      lines.push(`${player.name}: ${newScore} = ${prevScore} ${deltaParts.join(' ')}`);
    }
  }
}

lines.push('');

const output = lines.join('\n');
const outPath = path.join(dir, 'updates', `${date}.txt`);
fs.writeFileSync(outPath, output);
console.log(output);
