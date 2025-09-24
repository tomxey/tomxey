#!/usr/bin/env python3
"""
Utility functions for the Polish Railway Scraper
"""

import json
import requests
from typing import Dict, List, Optional
from datetime import datetime

def load_json_file(filepath: str) -> Dict:
    """Load JSON data from file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"File {filepath} not found")
        return {}
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON from {filepath}: {e}")
        return {}

def save_json_file(data: Dict, filepath: str) -> bool:
    """Save data to JSON file"""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error saving to {filepath}: {e}")
        return False

def validate_station_data(station: Dict) -> bool:
    """Validate station data structure"""
    required_fields = ['id', 'name', 'latitude', 'longitude']
    return all(field in station and station[field] is not None for field in required_fields)

def validate_connection_data(connection: Dict) -> bool:
    """Validate connection data structure"""
    required_fields = ['from_station_id', 'to_station_id', 'duration_minutes']
    return all(field in connection and connection[field] is not None for field in required_fields)

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate approximate distance between two points in kilometers"""
    from math import radians, cos, sin, asin, sqrt

    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])

    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))

    # Radius of earth in kilometers
    r = 6371

    return c * r

def filter_connections_by_distance(stations: Dict, connections: List[Dict], max_distance_km: float = 500) -> List[Dict]:
    """Filter connections that are unreasonably long distances"""
    filtered_connections = []

    for conn in connections:
        from_station = stations.get(conn['from_station_id'])
        to_station = stations.get(conn['to_station_id'])

        if from_station and to_station:
            distance = calculate_distance(
                from_station['latitude'], from_station['longitude'],
                to_station['latitude'], to_station['longitude']
            )

            if distance <= max_distance_km:
                conn['distance_km'] = round(distance, 2)
                filtered_connections.append(conn)

    return filtered_connections

def generate_statistics(stations: Dict, connections: List[Dict]) -> Dict:
    """Generate statistics about the scraped data"""
    stats = {
        'total_stations': len(stations),
        'total_connections': len(connections),
        'average_connections_per_station': len(connections) / len(stations) if stations else 0,
        'cities_covered': len(set(station.get('city', '') for station in stations.values() if station.get('city'))),
        'carriers': list(set(conn.get('carrier', '') for conn in connections if conn.get('carrier'))),
        'duration_stats': {}
    }

    if connections:
        durations = [conn['duration_minutes'] for conn in connections if conn.get('duration_minutes')]
        if durations:
            stats['duration_stats'] = {
                'min_duration_minutes': min(durations),
                'max_duration_minutes': max(durations),
                'avg_duration_minutes': sum(durations) / len(durations)
            }

    return stats
