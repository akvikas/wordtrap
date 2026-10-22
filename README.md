# WordTrap

WordTrap is a real-time social deduction word game: everyone except one imposter receives the same secret word. Players take turns giving timed clues, vote to identify the imposter, resolve ties by dealing a fresh word with the same imposter, and give the caught imposter one final guess to steal the round.

## Features

- One authoritative game engine for roles, timers, scoring, and valid actions
- Play immediately with a bot-filled table
- Private room codes for playing with friends
- Turn-based timed clues and secret-word leak prevention
- Voting, tie resets, imposter final-guess mechanic, and match podium
- Host controls, reconnect handling, and chat rate limiting

## Development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm test
npm run typecheck
npm run build
```

## Deployment

The repository includes `vercel.json` and is ready to import into Vercel. Use the default build command and add any required production environment variables in the Vercel project settings.

## Disclaimer

This project is a social game for entertainment. It does not collect or require personal data to play a bot table.
