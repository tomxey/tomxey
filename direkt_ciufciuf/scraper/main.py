#!/usr/bin/env python3
"""
Polish Railway Connections Scraper
Uses koleo-cli to fetch train stations and connections data
"""

import asyncio
import json
import gzip
import os
import sys
import time
from datetime import datetime, timedelta, date
from typing import Dict, List, Set, Tuple
import click
from dotenv import load_dotenv
from tqdm.asyncio import tqdm

# Import koleo functionality
try:
    from koleo import KoleoAPI
except ImportError:
    print("Error: koleo package not found. Please install with: pip install koleo-cli")
    sys.exit(1)

load_dotenv()

class PolishRailwayScraper:
    """Scraper for Polish railway connections using koleo-cli"""

    def __init__(self):
        self.api = KoleoAPI()
        # Add required header for EOL API
        if hasattr(self.api, 'base_headers'):
            self.api.base_headers['Accept-EOL-Response-Version'] = '1'
        self.stations = {}
        self.trains = {}  # Store complete train routes instead of connections
        self.processed_stations = set()
        self.load_existing_data()

    def load_existing_data(self):
        """Load existing trains and stations from JSON files to avoid re-scraping"""
        print("Loading existing data from JSON files...")

        # Try to load from compressed files first, then fallback to uncompressed
        # Load existing stations
        if os.path.exists('stations.json.gz'):
            try:
                stations_data = self.load_compressed_json('stations.json.gz')
                # Convert keys to integers to prevent duplicates
                self.stations = {int(k): v for k, v in stations_data.items()}
                print(f"Loaded {len(self.stations)} existing stations from compressed file")
            except Exception as e:
                print(f"Warning: Could not load compressed stations: {e}")
        elif os.path.exists('stations.json'):
            try:
                with open('stations.json', 'r', encoding='utf-8') as f:
                    stations_data = json.load(f)
                # Convert keys to integers to prevent duplicates
                self.stations = {int(k): v for k, v in stations_data.items()}
                print(f"Loaded {len(self.stations)} existing stations")
            except Exception as e:
                print(f"Warning: Could not load existing stations: {e}")

        # Load existing trains
        if os.path.exists('trains.json.gz'):
            try:
                existing_trains = self.load_compressed_json('trains.json.gz')
                # Convert keys to strings for consistency
                self.trains = {str(k): v for k, v in existing_trains.items()}
                print(f"Loaded {len(self.trains)} existing trains from compressed cache")
            except Exception as e:
                print(f"Warning: Could not load compressed trains: {e}")
        elif os.path.exists('trains.json'):
            try:
                with open('trains.json', 'r', encoding='utf-8') as f:
                    existing_trains = json.load(f)
                # Convert keys to strings for consistency
                self.trains = {str(k): v for k, v in existing_trains.items()}
                print(f"Loaded {len(self.trains)} existing trains from cache")
            except Exception as e:
                print(f"Warning: Could not load existing trains: {e}")

    async def close(self):
        """Close the API session properly"""
        try:
            await self.api.close()
        except:
            pass

    async def fetch_stations(self) -> Dict:
        """Fetch all train stations in Poland"""
        print("Fetching train stations...")

        try:
            stations_data = await self.api.get_stations()

            for station in stations_data:
                station_id = station.get('id')
                transport_mode = station.get('transport_mode')

                self.stations[station_id] = {
                    'id': station_id,
                    'name': station.get('name', ''),
                    'city': station.get('city', ''),
                    'latitude': station.get('latitude'),
                    'longitude': station.get('longitude'),
                    'country': station.get('country', 'PL'),
                    'transport_mode': transport_mode,
                    'type': station.get('type'),
                    'region': station.get('region'),
                    'ibnr': station.get('ibnr'),
                    'time_zone': station.get('time_zone', 'Europe/Warsaw')
                }

            print(f"Found {len(self.stations)} stations")
            return self.stations

        except Exception as e:
            print(f"Error fetching stations: {e}")
            import traceback
            traceback.print_exc()
            return {}

    async def fetch_trains_for_station(self, station_id: str, station_name: str) -> List[Dict]:
        """Fetch all train departures from a specific station for a full week and get complete routes"""
        trains = []
        new_trains_count = 0
        cached_trains_count = 0

        try:
            # Get departures for the next 7 days starting from tomorrow
            start_date = date.today() + timedelta(days=1)

            for day_offset in range(7):  # 7 days starting from tomorrow
                search_date = start_date + timedelta(days=day_offset)

                print(f"Fetching departures from {station_name} for {search_date.strftime('%Y-%m-%d')}...")

                # Get all departures from this station for this specific date
                departures = await self.api.get_departures(int(station_id), search_date)

                if departures:
                    print(f"Found {len(departures)} departures for {search_date.strftime('%Y-%m-%d')}")

                    # Create progress bar for trains at this station on this date
                    with tqdm(departures, desc=f"{station_name[:20]} - {search_date.strftime('%m-%d')}", unit="train", leave=False) as pbar:
                        for departure in pbar:
                            # Extract train info from departure data
                            train_id = departure.get('stations', [{}])[0].get('train_id') if departure.get('stations') else None

                            if train_id:
                                train_id_str = str(train_id)

                                # Check if train is already in cache
                                if train_id_str in self.trains:
                                    # Train already exists, use cached data
                                    trains.append(self.trains[train_id_str])
                                    cached_trains_count += 1
                                    train_name = departure.get('train_full_name', f'Train {train_id}')
                                    pbar.set_postfix_str(f"Cached: {train_name}")
                                else:
                                    # Train not in cache, fetch from API
                                    train_name = departure.get('train_full_name', f'Train {train_id}')
                                    pbar.set_postfix_str(f"Fetching: {train_name}")

                                    train_details = await self.api.get_train(train_id)
                                    train_info = train_details['train']

                                    # Extract all stops from the train route
                                    stops = []
                                    for stop in train_details['stops']:
                                        stops.append({
                                            'station_id': stop.get('station_id'),
                                            'station_name': stop.get('station_name'),
                                            'arrival_time': stop.get('arrival'),
                                            'departure_time': stop.get('departure'),
                                        })

                                    # Store the complete train information
                                    self.trains[train_id_str] = {
                                        'train_id': train_id,
                                        'train_number': departure.get('train_full_name'),
                                        'carrier': departure.get('brand_id'),
                                        'date': search_date.strftime('%Y-%m-%d'),
                                        'stops': stops,
                                        'route_name': train_info.get('name', ''),
                                        'total_stops': len(stops)
                                    }

                                    trains.append(self.trains[train_id_str])
                                    new_trains_count += 1

                                    # Small delay between train detail requests
                                    await asyncio.sleep(0.2)
                else:
                    print(f"No departures found for {search_date.strftime('%Y-%m-%d')}")

                # Add delay between date requests to avoid overwhelming the API
                if day_offset < 6:  # Don't delay after the last day
                    await asyncio.sleep(0.3)

            print(f"✓ Completed {station_name} (7 days): {len(trains)} total trains ({cached_trains_count} cached, {new_trains_count} new)")

            # Add delay to avoid overwhelming the API (only if we made new requests)
            if new_trains_count > 0:
                await asyncio.sleep(0.5)

        except Exception as e:
            print(f"✗ Error fetching trains from {station_name}: {e}")
            import traceback
            traceback.print_exc()

        return trains

    async def scrape_all_trains(self):
        """Scrape trains from all stations (full scraping)"""
        print("Starting full train scraping...")
        print("This will fetch trains from all stations and get complete routes!")

        all_station_items = list(self.stations.items())
        station_items = [s for s in all_station_items if s[1]['transport_mode'] == 'rail']

        # Create progress bar for all stations
        with tqdm(station_items, desc="Processing all stations", unit="station") as pbar:
            for station_id, station_info in pbar:
                # Update progress bar with current station
                pbar.set_postfix_str(f"Station: {station_info['name'][:30]}")

                # Skip if already processed
                if station_id in self.processed_stations:
                    pbar.set_postfix_str(f"Skipped: {station_info['name'][:30]} (already processed)")
                    continue

                trains = await self.fetch_trains_for_station(
                    str(station_id), station_info['name']
                )

                self.processed_stations.add(station_id)
                pbar.set_postfix_str(f"Completed: {station_info['name'][:30]} ({len(trains)} trains)")

                # Save progress every 500 stations
                if len(self.processed_stations) % 500 == 0:
                    self.save_partial_data()

        print("Full train scraping completed!")

    def save_partial_data(self):
        """Save partial data to avoid losing progress"""
        print("Saving partial data...")
        self.save_compressed_data()

    def save_final_data(self):
        """Save final scraped data"""
        print("Saving final data...")
        self.save_compressed_data()

        # Generate summary
        trains_with_routes = sum(1 for train in self.trains.values() if train.get('stops'))
        total_stops = sum(len(train.get('stops', [])) for train in self.trains.values())

        summary = {
            'scraping_date': datetime.now().isoformat(),
            'total_stations': len(self.stations),
            'total_trains': len(self.trains),
            'trains_with_complete_routes': trains_with_routes,
            'total_stops_across_all_trains': total_stops,
            'stations_processed': len(self.processed_stations)
        }

        with open('scraping_summary.json', 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        print(f"Scraping summary: {summary}")

    def save_compressed_json(self, data, filename):
        """Save data as compressed JSON"""
        json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        json_bytes = json_str.encode('utf-8')

        with gzip.open(filename, 'wb') as f:
            f.write(json_bytes)

    def save_uncompressed_json(self, data, filename):
        """Save data as uncompressed JSON"""
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def load_compressed_json(self, filename):
        """Load data from compressed JSON"""
        with gzip.open(filename, 'rb') as f:
            json_bytes = f.read()
            json_str = json_bytes.decode('utf-8')
            return json.loads(json_str)

    def save_compressed_data(self):
        """Save data in both compressed and uncompressed formats"""
        # Save compressed versions
        print("Saving compressed stations...")
        self.save_compressed_json(self.stations, 'stations.json.gz')

        print("Saving uncompressed stations...")
        self.save_uncompressed_json(self.stations, 'stations.json')

        print("Saving compressed trains...")
        self.save_compressed_json(self.trains, 'trains.json.gz')

        print("Saving uncompressed trains...")
        self.save_uncompressed_json(self.trains, 'trains.json')

        # Calculate compression ratios
        if os.path.exists('stations.json.gz'):
            stations_original_size = len(json.dumps(self.stations, ensure_ascii=False, indent=2).encode('utf-8'))
            stations_compressed_size = os.path.getsize('stations.json.gz')
            stations_ratio = (1 - stations_compressed_size / stations_original_size) * 100
            print(f"Stations compression: {stations_original_size/1024/1024:.1f}MB -> {stations_compressed_size/1024/1024:.1f}MB ({stations_ratio:.1f}% reduction)")

        if os.path.exists('trains.json.gz'):
            trains_original_size = len(json.dumps(self.trains, ensure_ascii=False, indent=2).encode('utf-8'))
            trains_compressed_size = os.path.getsize('trains.json.gz')
            trains_ratio = (1 - trains_compressed_size / trains_original_size) * 100
            print(f"Trains compression: {trains_original_size/1024/1024:.1f}MB -> {trains_compressed_size/1024/1024:.1f}MB ({trains_ratio:.1f}% reduction)")

        print(f"Saved {len(self.stations)} stations, {len(self.trains)} trains (compressed)")

async def run_scraper(stations_only):
    """Main async function to run the scraper"""
    scraper = PolishRailwayScraper()

    try:
        await scraper.fetch_stations()

        if not stations_only:
            await scraper.scrape_all_trains()

        # Save final data
        scraper.save_final_data()

        print("Scraping completed successfully!")

    finally:
        # Always close the session
        await scraper.close()

@click.command()
@click.option('--stations-only', is_flag=True, help='Only fetch stations data')
def main(stations_only):
    """Polish Railway Connections Scraper"""

    # Run the async scraper
    asyncio.run(run_scraper(stations_only))

if __name__ == '__main__':
    main()
