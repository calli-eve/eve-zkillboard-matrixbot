# EVE Online Killmail to Matrix Bot

A Node.js application that monitors zKillboard's RedisQ for killmails and posts relevant ones to Matrix. The bot monitors specific corporations or alliances and posts their kills and losses in a formatted message.

## Features

- Real-time killmail monitoring via RedisQ
- Configurable corporation/alliance ID watching
- Matrix integration
- Formatted messages with:
  - Kill/Loss information
  - Links to zKillboard
  - Final blow and top damage information
  - Ship type counts for attackers
  - ISK value formatting
- ESI integration for resolving names
- Automatic error recovery
- Docker support

## Configuration Options

`config.json` parameters:
```json
{
    "watchedIds": [
        98600992,  // Corp or Alliance ID
        98600993   // Can add multiple IDs
    ],
    "matrix": {
        "homeserverUrl": "https://matrix.example.org",
        "accessToken": "your_access_token",
        "roomId": "!roomId:matrix.example.org"
    },
    "userAgent": "EVE Killmail Bot/1.0 (your@email.com)",  // Identify your app to ESI
    "queueId": "my-custom-queue"  // Optional, randomly generated if not provided
}
```

### Configuration Details

- `watchedIds`: Array of corporation or alliance IDs to monitor (optional)
  - Empty array or omitted to monitor all killmails
  - Specific IDs to filter for only those corporations/alliances
- `matrix`: Matrix configuration object (required)
  - `homeserverUrl`: URL of your Matrix homeserver
  - `accessToken`: Access token for your Matrix bot account
  - `roomId`: ID of the room to post messages to
- `userAgent`: Identifies your application to ESI (required)
  - Should include your application name and version
  - Must include contact email in parentheses
- `queueId`: Unique identifier for your RedisQ queue (optional)
  - If not provided, a random one will be generated
  - Consistent queueId allows for maintaining position in queue across restarts

### Configuration Examples

Monitor all killmails:
```json
{
    "watchedIds": [],  // Empty array to watch all kills
    "matrix": {
        "homeserverUrl": "https://matrix.example.org",
        "accessToken": "your_access_token",
        "roomId": "!roomId:matrix.example.org"
    },
    "userAgent": "MyKillBot (example@example.com)"
}
```

Monitor specific entities:
```json
{
    "watchedIds": [
        98600992,  // Corp or Alliance ID
        98600993   // Can add multiple IDs
    ],
    "matrix": {
        "homeserverUrl": "https://matrix.example.org",
        "accessToken": "your_access_token",
        "roomId": "!roomId:matrix.example.org"
    },
    "userAgent": "MyKillBot (example@example.com)"
}
```

### Configuration Validation
The config file is validated on startup and will check:
- `watchedIds`: Array of numbers. Empty array or omitted to monitor all killmails
- `matrix`: Required object with valid homeserver URL, access token, and room ID
- `userAgent`: Must include contact information in parentheses, e.g., "YourApp/1.0 (your@email.com)"
- `queueId`: Must be a non-empty string

## Installation Instructions

### 1. Prerequisites
- Docker and Docker Compose installed
- A Matrix account and access token for your bot
- Corporation or Alliance IDs you want to monitor

### 2. Create Matrix Bot Account
1. Create a new Matrix account for your bot
2. Generate an access token for the bot account
3. Invite the bot to the room where you want killmails to appear
4. Note down the room ID (it starts with !)

### 3. Setup Project
1. Clone this repository:
```bash
git clone https://github.com/calli-eve/eve-zkill-matrixbot
cd eve-zkill-matrixbot
```

2. Create a `config.json` file:
```json
{
    "watchedIds": [
        98600992,  // Corp or Alliance ID
        98600993   // Can add multiple IDs
    ],
    "matrix": {
        "homeserverUrl": "https://matrix.example.org",
        "accessToken": "your_access_token",
        "roomId": "!roomId:matrix.example.org"
    },
    "userAgent": "EVE Killmail Bot/1.0 (your@email.com)",
    "queueId": "my-custom-queue"  // Optional
}
```

3. Build and start with Docker:
```bash
docker-compose up --build -d
```

## Message Format
The bot posts formatted messages to Matrix with the following information:
- Time of the killmail
- Link to zKillboard
- Victim name and affiliation (corporation/alliance)
- Ship type and system
- Final blow and top damage information
- Attacker ship type and count
- Estimated ISK value


