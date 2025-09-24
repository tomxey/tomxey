# Polish Railway Connections Scraper

This scraper extracts train connections data from Polish railways using the koleo-cli package.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the scraper:
```bash
python main.py
```

## Features

- Fetches all train stations in Poland
- Extracts direct connections between stations
- Saves data in JSON format for use with the web interface
- Includes travel times and connection details

## Output

The scraper generates:
- `stations.json` - List of all train stations with coordinates
- `connections.json` - Direct connections between stations with travel times
