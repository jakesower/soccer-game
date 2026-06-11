# World Cup 2026 Scoring Game

A pick'em style game for the 2026 FIFA World Cup. Each player drafts teams from fixed pots and earns or loses points based on their teams' goal differentials throughout the tournament.

## How Scoring Works

For every match a picked team plays in, the player gets the goal differential from that team's perspective:

- Your team wins 3-1: **+2**
- Your team loses 0-2: **-2**
- Your team draws 1-1: **+0**

Scores accumulate across all matches in the tournament.

## Setup

### Adding Players

Create a CSV file in the `groups/` folder (e.g. `groups/work.csv`). Each row has a name and comma-separated team codes. See `etc/players_template.csv` at the repo root for a reference.

Valid team codes and pot assignments are defined in `data/teams.csv`.

### Match Results

Match results are tracked in `data/matches.csv`. Each row has a datetime, home/away team codes, and home/away scores. Scores are left blank for unplayed matches. Fill them in as games are completed.

## Running the Script

From the repo root:

```
node update.js world-cup-2026 work 2026-06-11
```

Arguments:
1. **Tournament folder** — the directory containing `data/` and `groups/`
2. **Group name** — the name of the player group CSV (without `.csv`) in the tournament's `groups/` folder
3. **Date** — `YYYY-MM-DD` to process

This outputs a summary showing:

1. Match results (with group standing medals on final group matchdays, or win/loss indicators in knockout rounds)
2. Each player's updated score, broken down as: `new_total = previous_total +/-per_team`

Players are sorted by score (descending).

## Data Files

| File                         | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `data/teams.csv`             | Teams in the tournament with FIFA rank, group, pot, flag emoji, and code |
| `data/matches.csv`           | Full match schedule and results                                          |
| `groups/*.csv`               | Player group files with picks                                            |
| `etc/players_template.csv`   | Template for adding new players (repo root)                              |
