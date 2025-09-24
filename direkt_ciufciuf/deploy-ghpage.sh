#!/bin/bash
# Skrypt do publikacji strony direkt_ciufciuf do katalogu docs/ciufciuf/ (gh-pages)

set -e

# Ścieżki źródłowe
FRONTEND_DIR="$(dirname "$0")/frontend"
SCRAPER_DIR="$(dirname "$0")/scraper"
DOCS_DIR="$(dirname "$0")/../docs"
CIUFCIUF_DIR="$DOCS_DIR/ciufciuf"

# Tworzenie katalogu docs/ciufciuf/ jeśli nie istnieje
mkdir -p "$CIUFCIUF_DIR"

echo "Kopiowanie plików ciufciuf do docs/ciufciuf/..."

# Kopiowanie plików frontendowych do podkatalogu ciufciuf
cp "$FRONTEND_DIR"/*.html "$CIUFCIUF_DIR"/
cp "$FRONTEND_DIR"/*.js "$CIUFCIUF_DIR"/
cp "$FRONTEND_DIR"/*.css "$CIUFCIUF_DIR"/ 2>/dev/null || true

# Kopiowanie skompresowanych plików JSON do podkatalogu ciufciuf
test -f "$SCRAPER_DIR/stations.json.gz" && cp "$SCRAPER_DIR/stations.json.gz" "$CIUFCIUF_DIR/"
test -f "$SCRAPER_DIR/trains.json.gz" && cp "$SCRAPER_DIR/trains.json.gz" "$CIUFCIUF_DIR/"

# Kopiowanie testowej strony kompresji do głównego katalogu docs
cp "$(dirname "$0")/test-compression.html" "$DOCS_DIR/" 2>/dev/null || true

echo "Struktura katalogów:"
echo "docs/ - główna strona z linkami do projektów"
echo "docs/ciufciuf/ - aplikacja Direkt Ciufciuf"
echo ""
echo "Pliki zostały skopiowane. Możesz teraz wypchnąć zmiany na GitHub."
