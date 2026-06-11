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

Edit `data/players.csv` to add or modify players. Each row has a name and comma-separated team codes. Use `data/players_template.csv` as a reference.

Valid team codes and pot assignments are defined in `data/teams.csv`.

### Match Results

Match results are tracked in `data/matches.csv`. Each row has a datetime, home/away team codes, and home/away scores. Scores are left blank for unplayed matches. Fill them in as games are completed.

## Running the Script

```
node update.js YYYY-MM-DD
```

This processes all matches on the given date and outputs a summary showing:

1. Match results (with group standing medals on final group matchdays, or win/loss indicators in knockout rounds)
2. Each player's updated score, broken down as: `new_total = previous_total +/-per_team`

Players are sorted by score (descending).

Output is printed to the console and saved to `updates/YYYY-MM-DD.txt`. Create the `updates/` directory before running for the first time.

## Data Files

| File                        | Description                                                              |
| --------------------------- | ------------------------------------------------------------------------ |
| `data/teams.csv`            | Teams in the tournament with FIFA rank, group, pot, flag emoji, and code |
| `data/players.csv`          | Player picks                                                             |
| `data/players_template.csv` | Template for adding a new players                                        |
| `data/matches.csv`          | Full match schedule and results                                          |
