#!/bin/bash
# Skrypt do publikacji strony direkt_ciufciuf do katalogu docs/ (gh-pages)

set -e

# Ścieżki źródłowe
FRONTEND_DIR="$(dirname "$0")/frontend"
SCRAPER_DIR="$(dirname "$0")/scraper"
DOCS_DIR="$(dirname "$0")/../docs"

# Tworzenie katalogu docs/ jeśli nie istnieje
mkdir -p "$DOCS_DIR"

# Kopiowanie plików frontendowych
cp "$FRONTEND_DIR"/*.html "$DOCS_DIR"/
cp "$FRONTEND_DIR"/*.js "$DOCS_DIR"/
cp "$FRONTEND_DIR"/*.css "$DOCS_DIR"/ 2>/dev/null || true

# Kopiowanie skompresowanych plików JSON
test -f "$SCRAPER_DIR/stations.json.gz" && cp "$SCRAPER_DIR/stations.json.gz" "$DOCS_DIR/"
test -f "$SCRAPER_DIR/trains.json.gz" && cp "$SCRAPER_DIR/trains.json.gz" "$DOCS_DIR/"

# Kopiowanie testowej strony kompresji
cp "$(dirname "$0")/test-compression.html" "$DOCS_DIR/" 2>/dev/null || true

echo "Pliki zostały skopiowane do docs/. Możesz teraz wypchnąć zmiany na GitHub."

