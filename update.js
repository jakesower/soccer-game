const fs = require('fs');
const path = require('path');

const tournament = process.argv[2];
const date = process.argv[3];
const group = process.argv[4];
if (!tournament || !date || !group) {
  console.error('Usage: node update.js <tournament> <YYYY-MM-DD> <group>');
  process.exit(1);
}

const tournamentDir = path.join(__dirname, tournament);

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

const teamsData = parseCSV(path.join(tournamentDir, 'data/teams.csv'));
const teamByCode = {};
teamsData.forEach(t => {
  teamByCode[t.Code] = { flag: t.Flag, name: t.Team, group: t.Group };
});

const groups = {};
teamsData.forEach(t => {
  if (!groups[t.Group]) groups[t.Group] = [];
  groups[t.Group].push(t.Code);
});

const playersData = parseCSV(path.join(tournamentDir, `groups/${group}.csv`));
const players = playersData.map(p => ({
  name: p.Name,
  picks: p.Picks.split(',').map(c => c.trim()),
}));

const matchesData = parseCSV(path.join(tournamentDir, 'data/matches.csv'));

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

function computeDelta(picks, matches) {
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

function fmtScore(n) {
  return n < 0 ? `−${-n}` : `${n}`;
}

function fmtDelta(delta) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${-delta}`;
  return '+0';
}

function computeStats(teamList, matches) {
  const stats = {};
  teamList.forEach(t => { stats[t] = { pts: 0, gd: 0, gf: 0 }; });
  for (const m of matches) {
    const h = m['Home Team'], a = m['Away Team'];
    if (!teamList.includes(h) || !teamList.includes(a)) continue;
    const hs = parseInt(m['Home Score']), as = parseInt(m['Away Score']);
    stats[h].gf += hs; stats[h].gd += hs - as;
    stats[a].gf += as; stats[a].gd += as - hs;
    if (hs > as)      { stats[h].pts += 3; }
    else if (hs < as) { stats[a].pts += 3; }
    else              { stats[h].pts += 1; stats[a].pts += 1; }
  }
  return stats;
}

function fifaTiebreak(tiedTeams, matches) {
  if (tiedTeams.length <= 1) return tiedTeams;

  // Step 1: head-to-head among tied teams only
  const h2h = computeStats(tiedTeams, matches);
  const byH2H = [...tiedTeams].sort((a, b) =>
    h2h[b].pts - h2h[a].pts || h2h[b].gd - h2h[a].gd || h2h[b].gf - h2h[a].gf
  );

  // Group into sub-clusters still tied after head-to-head
  const result = [];
  let cluster = [byH2H[0]];
  for (let i = 1; i < byH2H.length; i++) {
    const prev = h2h[byH2H[i - 1]], cur = h2h[byH2H[i]];
    if (prev.pts === cur.pts && prev.gd === cur.gd && prev.gf === cur.gf) {
      cluster.push(byH2H[i]);
    } else {
      result.push(...cluster);
      cluster = [byH2H[i]];
    }
  }
  result.push(...cluster);
  return result;
}

function groupStandings(groupCode, matches) {
  const teams = groups[groupCode];
  const stats = computeStats(teams, matches);

  // Sort by overall points first
  const sorted = [...teams].sort((a, b) => stats[b].pts - stats[a].pts);

  // Identify clusters tied on points, apply FIFA tiebreak to each
  const result = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && stats[sorted[j]].pts === stats[sorted[i]].pts) j++;
    const tiedCluster = sorted.slice(i, j);
    if (tiedCluster.length === 1) {
      result.push(tiedCluster[0]);
    } else {
      // Step 1: head-to-head
      const h2hSorted = fifaTiebreak(tiedCluster, matches);

      // Check if step 1 fully resolved it
      const h2hStats = computeStats(h2hSorted, matches);
      let k = 0;
      while (k < h2hSorted.length) {
        let l = k + 1;
        while (l < h2hSorted.length) {
          const a = h2hStats[h2hSorted[l - 1]], b = h2hStats[h2hSorted[l]];
          if (a.pts === b.pts && a.gd === b.gd && a.gf === b.gf) l++;
          else break;
        }
        const subCluster = h2hSorted.slice(k, l);
        if (subCluster.length === 1) {
          result.push(subCluster[0]);
        } else {
          // Step 2: overall GD, then overall GF
          subCluster.sort((a, b) => stats[b].gd - stats[a].gd || stats[b].gf - stats[a].gf);
          result.push(...subCluster);
        }
        k = l;
      }
    }
    i = j;
  }

  return result.map(code => ({ code, ...stats[code] }));
}

function groupMedals(groupCode) {
  const teams = groups[groupCode];
  const groupMatches = matchesData.filter(m => teams.includes(m['Home Team']) && teams.includes(m['Away Team']));
  const totalMatches = groupMatches.length;
  const completedAll = groupMatches.filter(m => m['Home Score'] !== '' && m['Away Score'] !== '');
  if (completedAll.length !== totalMatches) return null;

  const standings = groupStandings(groupCode, completedAll);

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

function knockoutEmojis(m) {
  const home = m['Home Team'], away = m['Away Team'];
  const hs = parseInt(m['Home Score']), as = parseInt(m['Away Score']);
  const winner = m['Winner']?.trim();
  const round = m['Round']?.trim();
  let winEmoji = '✅', loseEmoji = '❌';
  if (round === 'Third') { winEmoji = '🥉'; }
  else if (round === 'Final') { winEmoji = '🥇'; loseEmoji = '🥈'; }
  if (hs > as) return { home: winEmoji, away: loseEmoji };
  if (hs < as) return { home: loseEmoji, away: winEmoji };
  if (winner === home) return { home: winEmoji, away: loseEmoji };
  if (winner === away) return { home: loseEmoji, away: winEmoji };
  console.error(`Warning: ambiguous result in knockout match ${home} vs ${away} — set Winner column ✅❌`);
  return null;
}

const matchMedals = {};
for (const m of todayMatches) {
  const home = m['Home Team'];
  const grp = teamByCode[home]?.group;
  if (!grp || matchMedals[grp] !== undefined) continue;
  const teams = groups[grp];
  const groupMatchesToday = matchesData.filter(m2 =>
    matchDate(m2) === date && teams.includes(m2['Home Team']) && teams.includes(m2['Away Team'])
  );
  const todayTeams = new Set(groupMatchesToday.flatMap(m2 => [m2['Home Team'], m2['Away Team']]));
  const isFinalDay = todayTeams.size === 4 && groupMatchesToday.every(m2 => m2['Home Score'] !== '' && m2['Away Score'] !== '');
  matchMedals[grp] = isFinalDay ? groupMedals(grp) : null;
}

const lines = [];
lines.push(date);
lines.push('');

if (todayMatches.length === 0) {
  lines.push('No matches played today.');
} else {
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
      const grp = teamByCode[home]?.group;
      const medals = matchMedals[grp];
      if (medals) { homePrefix = `${medals[home]} `; awaySuffix = ` ${medals[away]}`; }
    }
    lines.push(`${homePrefix}${home} ${homeFlag} ${m['Home Score']} - ${m['Away Score']} ${awayFlag} ${away}${awaySuffix}`);
  }

  lines.push('');

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
      lines.push(`${player.name}: ${fmtScore(newScore)} = ${fmtScore(newScore)}`);
    } else {
      const deltaParts = deltas.map(e => `${fmtDelta(e.delta)}${teamByCode[e.code]?.flag ?? e.code}`);
      lines.push(`${player.name}: ${fmtScore(newScore)} = ${fmtScore(prevScore)} ${deltaParts.join(' ')}`);
    }
  }
}

lines.push('');

const output = lines.join('\n');
console.log(output);

require('child_process').execSync('pbcopy', { input: output });
