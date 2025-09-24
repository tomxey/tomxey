// Main application for Direkt Ciufciuf - Polish Railway Map
class PolishRailwayMap {
    constructor() {
        this.map = null;
        this.stations = {};
        this.trains = {};
        this.stationMarkers = {};
        this.selectedStationId = null;
        
        this.init();
    }

    async init() {
        // Initialize map
        this.initMap();
        
        // Load data
        await this.loadData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Hide loading screen
        document.getElementById('loading').classList.add('hidden');
    }

    initMap() {
        // Initialize Leaflet map centered on Poland
        this.map = L.map('map').setView([52.0693, 19.4803], 6);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        // Custom station icon
        this.stationIcon = L.divIcon({
            className: 'station-marker',
            html: '<div style="background: #3498db; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        this.selectedStationIcon = L.divIcon({
            className: 'station-marker-selected',
            html: '<div style="background: #e74c3c; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
    }

    async loadCompressedJSON(url) {
        // Load and decompress a gzip-compressed JSON file using pako
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const compressedData = await response.arrayBuffer();
            const decompressed = pako.inflate(compressedData, { to: 'string' });
            return JSON.parse(decompressed);
        } catch (error) {
            console.error(`Error loading compressed file ${url}:`, error);
            throw error;
        }
    }

    async loadData() {
        try {
            console.log('Loading railway data...');
            
            // Try to load compressed files first, then fallback to uncompressed
            let allStations, trains;

            // Load stations data - try compressed first
            try {
                allStations = await this.loadCompressedJSON('/stations.json.gz');
                console.log('Loaded compressed stations data');
            } catch (error) {
                console.log('Compressed stations not available, trying uncompressed...');
                const stationsResponse = await fetch('/stations.json');
                allStations = await stationsResponse.json();
                console.log('Loaded uncompressed stations data');
            }

            // Filter stations to only include those with transport_mode "rail"
            this.stations = {};
            Object.entries(allStations).forEach(([stationId, station]) => {
                if (station.transport_mode === 'rail') {
                    this.stations[stationId] = station;
                }
            });

            // Load trains data - try compressed first
            try {
                this.trains = await this.loadCompressedJSON('/trains.json.gz');
                console.log('Loaded compressed trains data');
            } catch (error) {
                console.log('Compressed trains not available, trying uncompressed...');
                const trainsResponse = await fetch('/trains.json');
                this.trains = await trainsResponse.json();
                console.log('Loaded uncompressed trains data');
            }

            console.log(`Loaded ${Object.keys(allStations).length} total stations`);
            console.log(`Filtered to ${Object.keys(this.stations).length} rail stations`);
            console.log(`Loaded ${Object.keys(this.trains).length} trains`);
            
            // Update statistics
            this.updateStats();
            
            // Add stations to map
            this.addStationsToMap();
            
        } catch (error) {
            console.error('Error loading data:', error);
            alert('Błąd podczas ładowania danych kolejowych. Sprawdź czy pliki danych są dostępne.');
        }
    }

    updateStats() {
        document.getElementById('stationCount').textContent = Object.keys(this.stations).length.toLocaleString();
        document.getElementById('trainCount').textContent = Object.keys(this.trains).length.toLocaleString();
        
        // Calculate total connections from all trains
        let totalConnections = 0;
        Object.values(this.trains).forEach(train => {
            const stops = train.stops || [];
            if (stops.length > 1) {
                // Each train with n stops creates n*(n-1)/2 possible connections
                totalConnections += (stops.length * (stops.length - 1)) / 2;
            }
        });
        
        document.getElementById('connectionCount').textContent = totalConnections.toLocaleString();
    }

    addStationsToMap() {
        Object.entries(this.stations).forEach(([stationId, station]) => {
            if (station.latitude && station.longitude) {
                const marker = L.marker([station.latitude, station.longitude], {
                    icon: this.stationIcon
                }).addTo(this.map);

                // Add click event to show connections
                marker.on('click', () => {
                    this.selectStation(stationId, station);
                });

                // Store marker reference
                this.stationMarkers[stationId] = marker;

                // Add popup with station info
                marker.bindPopup(`
                    <div>
                        <h4>${station.name}</h4>
                        <p>Miasto: ${station.city || 'N/A'}</p>
                        <p>ID: ${station.id}</p>
                    </div>
                `);
            }
        });

        console.log(`Added ${Object.keys(this.stationMarkers).length} station markers to map`);
    }

    selectStation(stationId, station) {
        // Reset previous selection
        this.clearSelection();

        // Mark as selected
        this.selectedStationId = stationId;
        
        // Update marker icon
        if (this.stationMarkers[stationId]) {
            this.stationMarkers[stationId].setIcon(this.selectedStationIcon);
        }

        // Show connections in sidebar
        this.showStationConnections(stationId, station);

        // Color code stations by travel time instead of showing lines
        this.colorStationsByTravelTime(stationId);

        // Close sidebar on mobile after selection
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            const sidebarOverlay = document.getElementById('sidebarOverlay');
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        }
    }

    clearSelection() {
        // Reset previous selected station marker
        if (this.selectedStationId && this.stationMarkers[this.selectedStationId]) {
            this.stationMarkers[this.selectedStationId].setIcon(this.stationIcon);
        }

        // Reset all station markers to default color instead of clearing lines
        Object.entries(this.stationMarkers).forEach(([id, marker]) => {
            if (id !== this.selectedStationId) {
                marker.setIcon(this.stationIcon);
            }
        });

        this.selectedStationId = null;
    }

    colorStationsByTravelTime(fromStationId) {
        console.log(`Calculating direct travel times from station ${fromStationId}...`);

        // Calculate direct travel times to all stations (no transfers)
        const result = this.calculateDirectTravelTimes(fromStationId);
        const travelTimes = result.travelTimes;
        const trainDetails = result.trainDetails;

        // Find min and max travel times for color scaling
        const times = Object.values(travelTimes).filter(time => time < Infinity);
        if (times.length === 0) {
            console.log('No directly reachable stations found');
            return;
        }

        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        console.log(`Direct travel time range: ${minTime} to ${maxTime} minutes`);

        // Color code all station markers
        Object.entries(this.stationMarkers).forEach(([stationId, marker]) => {
            if (stationId === fromStationId) {
                // Keep selected station with selected icon
                return;
            }

            const travelTime = travelTimes[stationId];
            const color = this.getTravelTimeColor(travelTime, minTime, maxTime);
            const opacity = this.getStationOpacity(travelTime);
            const isReachable = travelTime < Infinity;

            // Make reachable stations bigger (twice the size) and put unreachable ones behind
            const size = isReachable ? 20 : 10; // 20px for reachable, 10px for unreachable
            const zIndex = isReachable ? 1000 : 100; // Higher z-index for reachable stations

            // Create colored icon with appropriate size and z-index
            const coloredIcon = L.divIcon({
                className: 'station-marker',
                html: `<div style="background: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); opacity: ${opacity}; z-index: ${zIndex}; position: relative;"></div>`,
                iconSize: [size + 4, size + 4], // Add 4px for border
                iconAnchor: [(size + 4) / 2, (size + 4) / 2]
            });

            marker.setIcon(coloredIcon);

            // Clear any existing tooltips AND popups first to avoid conflicts
            marker.unbindTooltip();
            marker.unbindPopup();

            // Add hover tooltips for reachable stations
            if (isReachable) {
                const station = this.stations[stationId];
                const hours = Math.floor(travelTime / 60);
                const minutes = Math.floor(travelTime % 60);
                const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                const train = trainDetails[stationId];

                // Create tooltip with train details
                let tooltipContent = `${station.name} (${station.city || 'N/A'}) - ${timeStr}`;
                if (train && train.trainNumber) {
                    tooltipContent += ` | ${train.trainNumber} ${train.departureTime}-${train.arrivalTime}`;
                }

                marker.bindTooltip(tooltipContent, {
                    permanent: false,
                    direction: 'top',
                    offset: [0, -10]
                });

                // Also add a detailed popup for click
                let popupContent = `
                    <div>
                        <h4>${station.name}</h4>
                        <p>Miasto: ${station.city || 'N/A'}</p>
                        <p>Czas podróży: ${timeStr}</p>`;

                if (train && train.trainNumber) {
                    popupContent += `
                        <p><strong>Najszybszy pociąg:</strong> ${train.trainNumber}</p>
                        <p>Odjazd: ${train.departureTime} → Przyjazd: ${train.arrivalTime}</p>`;
                }

                popupContent += `</div>`;
                marker.bindPopup(popupContent);
            } else {
                // For unreachable stations, restore the original popup
                const station = this.stations[stationId];
                marker.bindPopup(`
                    <div>
                        <h4>${station.name}</h4>
                        <p>Miasto: ${station.city || 'N/A'}</p>
                        <p>Niedostępne bezpośrednio</p>
                    </div>
                `);
            }
        });
    }

    calculateDirectTravelTimes(fromStationId) {
        const travelTimes = {};
        const trainDetails = {}; // Store train info for fastest connections

        // Initialize all stations as unreachable
        Object.keys(this.stations).forEach(stationId => {
            travelTimes[stationId] = Infinity;
            trainDetails[stationId] = null;
        });

        // Set source station to 0
        travelTimes[fromStationId] = 0;

        // Find direct connections from trains
        Object.values(this.trains).forEach(train => {
            const stops = train.stops || [];

            // Find the index of our starting station in this train
            const startIndex = stops.findIndex(stop =>
                stop.station_id && stop.station_id.toString() === fromStationId.toString()
            );

            if (startIndex !== -1) {
                // For all subsequent stops on this train, calculate direct travel time
                for (let i = startIndex + 1; i < stops.length; i++) {
                    const targetStop = stops[i];
                    if (targetStop.station_id) {
                        const targetId = targetStop.station_id.toString();
                        const directTravelTime = this.calculateTravelTime(stops[startIndex], targetStop);

                        if (directTravelTime > 0) {
                            // Keep the shortest direct connection to each station
                            if (travelTimes[targetId] > directTravelTime) {
                                travelTimes[targetId] = directTravelTime;
                                // Store train details for this fastest connection
                                trainDetails[targetId] = {
                                    trainNumber: train.train_number,
                                    carrier: train.carrier,
                                    departureTime: this.formatTime(stops[startIndex].departure_time),
                                    arrivalTime: this.formatTime(targetStop.arrival_time)
                                };
                            }
                        }
                    }
                }
            }
        });

        return { travelTimes, trainDetails };
    }

    calculateTravelTime(fromStop, toStop) {
        if (!fromStop.departure_time || !toStop.arrival_time) {
            return 0;
        }

        const departureMinutes = this.timeToMinutes(fromStop.departure_time);
        const arrivalMinutes = this.timeToMinutes(toStop.arrival_time);

        // Handle day crossing (arrival next day)
        let travelTime = arrivalMinutes - departureMinutes;
        if (travelTime < 0) {
            travelTime += 24 * 60; // Add 24 hours in minutes
        }

        return travelTime;
    }

    timeToMinutes(timeObj) {
        if (!timeObj || typeof timeObj !== 'object') return 0;

        const hour = timeObj.hour || 0;
        const minute = timeObj.minute || 0;

        return hour * 60 + minute;
    }

    getTravelTimeColor(travelTime, minTime, maxTime) {
        if (travelTime === Infinity || travelTime === undefined) {
            return '#000000'; // Black for unreachable stations
        }

        // Convert travel time to hours for absolute scale
        const hoursTime = travelTime / 60;

        // Absolute color scale with gradients
        if (hoursTime >= 10) {
            return '#000000'; // Black for 10+ hours
        } else if (hoursTime >= 8) {
            // Gradient from dark red (8h) to black (10h)
            const normalizedTime = (hoursTime - 8) / 2; // Normalize between 0-1 for 8h-10h range
            const darkRed = Math.floor(128 * (1 - normalizedTime)); // 128 to 0
            return `rgb(${darkRed}, 0, 0)`;
        } else if (hoursTime >= 4) {
            // Gradient from red (4h) to dark red (8h)
            const normalizedTime = (hoursTime - 4) / 4; // Normalize between 0-1 for 4h-8h range
            const red = Math.floor(255 - (127 * normalizedTime)); // 255 to 128
            return `rgb(${red}, 0, 0)`;
        } else if (hoursTime >= 1) {
            // Gradient from green (1h) to red (4h)
            const normalizedTime = (hoursTime - 1) / 3; // Normalize between 0-1 for 1h-4h range
            const red = Math.floor(255 * normalizedTime);
            const green = Math.floor(255 * (1 - normalizedTime));
            return `rgb(${red}, ${green}, 0)`;
        } else {
            // Intense green for up to 1 hour
            return '#00ff00';
        }
    }

    getStationOpacity(travelTime) {
        if (travelTime === Infinity || travelTime === undefined) {
            return 0.2; // 20% opacity for unreachable stations
        }
        return 1.0; // Full opacity for reachable stations
    }

    setupEventListeners() {
        // Mobile menu functionality
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.querySelector('.sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');

        const toggleSidebar = () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('active');
        };

        const closeSidebar = () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        };

        menuToggle.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);

        // Enhanced station search with autocomplete
        const searchInput = document.getElementById('stationSearch');
        const searchResults = document.getElementById('searchResults');
        let selectedIndex = -1;
        let searchTimeout;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.performSearch(e.target.value, searchResults);
                selectedIndex = -1;
            }, 300); // Debounce search
        });

        // Keyboard navigation for search results
        searchInput.addEventListener('keydown', (e) => {
            const items = searchResults.querySelectorAll('.search-result-item');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                this.updateSearchSelection(items, selectedIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                this.updateSearchSelection(items, selectedIndex);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    items[selectedIndex].click();
                } else if (items.length === 1) {
                    items[0].click();
                }
            } else if (e.key === 'Escape') {
                this.hideSearchResults();
                searchInput.blur();
            }
        });

        // Hide search results when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                this.hideSearchResults();
            }
        });

        // Map click to clear selection
        this.map.on('click', (e) => {
            // Only clear if clicking on map (not on markers)
            if (e.originalEvent.target === this.map.getContainer()) {
                this.clearSelection();
                document.getElementById('selectedStation').innerHTML = `
                    <h3>Wybierz stację na mapie</h3>
                    <p>Kliknij na stację, aby zobaczyć dostępne połączenia kolejowe.</p>
                `;
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Focus search on Ctrl+F or /
            if ((e.ctrlKey && e.key === 'f') || (e.key === '/' && !e.target.matches('input, textarea'))) {
                e.preventDefault();
                searchInput.focus();
            }
            // Clear selection on Escape
            if (e.key === 'Escape' && !searchInput.matches(':focus')) {
                this.clearSelection();
                document.getElementById('selectedStation').innerHTML = `
                    <h3>Wybierz stację na mapie</h3>
                    <p>Kliknij na stację, aby zobaczyć dostępne połączenia kolejowe.</p>
                `;
            }
        });
    }

    performSearch(query, resultsContainer) {
        if (query.length < 2) {
            this.hideSearchResults();
            return;
        }

        const matches = Object.entries(this.stations)
            .filter(([id, station]) => 
                station.name.toLowerCase().includes(query.toLowerCase()) ||
                (station.city && station.city.toLowerCase().includes(query.toLowerCase()))
            )
            .slice(0, 8) // Show up to 8 results
            .sort((a, b) => {
                // Prioritize exact matches and station names over cities
                const aName = a[1].name.toLowerCase();
                const bName = b[1].name.toLowerCase();
                const q = query.toLowerCase();

                if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
                if (bName.startsWith(q) && !aName.startsWith(q)) return 1;
                return aName.localeCompare(bName);
            });

        if (matches.length === 0) {
            resultsContainer.innerHTML = '<div class="search-result-item">Brak wyników</div>';
            resultsContainer.classList.remove('hidden');
            return;
        }

        const html = matches.map(([stationId, station]) => `
            <div class="search-result-item" data-station-id="${stationId}">
                <div class="search-result-name">${station.name}</div>
                <div class="search-result-city">${station.city || 'N/A'}</div>
            </div>
        `).join('');

        resultsContainer.innerHTML = html;
        resultsContainer.classList.remove('hidden');

        // Add click handlers
        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            const stationId = item.dataset.stationId;
            if (stationId) {
                item.addEventListener('click', () => {
                    const station = this.stations[stationId];
                    this.selectStation(stationId, station);
                    this.map.setView([station.latitude, station.longitude], 10);
                    document.getElementById('stationSearch').value = station.name;
                    this.hideSearchResults();
                });
            }
        });
    }

    updateSearchSelection(items, selectedIndex) {
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    hideSearchResults() {
        document.getElementById('searchResults').classList.add('hidden');
    }

    searchStations(query) {
        // This method is now replaced by the enhanced performSearch
        // Keeping for backward compatibility but it's no longer used
    }

    formatTime(timeObj) {
        if (!timeObj) return 'N/A';
        
        if (typeof timeObj === 'object' && timeObj.hour !== undefined) {
            return `${String(timeObj.hour).padStart(2, '0')}:${String(timeObj.minute).padStart(2, '0')}`;
        }
        
        if (typeof timeObj === 'string' && timeObj.includes('T')) {
            const date = new Date(timeObj);
            return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }
        
        return timeObj.toString();
    }

    showStationConnections(stationId, station) {
        const sidebar = document.getElementById('selectedStation');

        // Calculate travel times to all reachable stations
        const result = this.calculateDirectTravelTimes(stationId);
        const travelTimes = result.travelTimes;
        const trainDetails = result.trainDetails;

        // Find all trains that stop at this station
        const trainsAtStation = Object.entries(this.trains).filter(([trainId, train]) => {
            return train.stops && train.stops.some(stop =>
                stop.station_id && stop.station_id.toString() === stationId.toString()
            );
        });

        // Get reachable stations with travel times and train details
        const reachableStations = Object.entries(travelTimes)
            .filter(([targetId, time]) => targetId !== stationId && time < Infinity)
            .map(([targetId, time]) => ({
                stationId: targetId,
                station: this.stations[targetId],
                travelTime: time,
                trainDetails: trainDetails[targetId]
            }))
            .filter(item => item.station) // Only include stations that exist in our filtered data
            .sort((a, b) => a.travelTime - b.travelTime); // Sort by travel time

        // Update sidebar
        sidebar.innerHTML = `
            <h3>${station.name}</h3>
            <div class="station-info">
                <p><strong>Miasto:</strong> ${station.city || 'N/A'}</p>
                <p><strong>Osiągalnych stacji:</strong> ${reachableStations.length}</p>
                <p><strong>Pociągów dziennie:</strong> ${trainsAtStation.length}</p>
            </div>
            
            <h4>Najkrótsze czasy podróży</h4>
            <div id="connectionsList">
                ${this.generateTravelTimesList(reachableStations)}
            </div>
        `;
    }

    generateTravelTimesList(reachableStations) {
        return reachableStations.map(item => {
            const hours = Math.floor(item.travelTime / 60);
            const minutes = Math.floor(item.travelTime % 60);
            const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
            const train = item.trainDetails;

            let trainInfo = '';
            if (train && train.trainNumber) {
                trainInfo = ` • ${train.trainNumber} ${train.departureTime}`;
            }

            return `
                <div class="connection-item" onclick="app.highlightConnection('${item.stationId}')">
                    <div class="train-number">→ ${item.station.name}</div>
                    <div class="route-info">
                        ${item.station.city || 'N/A'}
                    </div>
                    <div class="time-info">
                        Najkrótszy czas: ${timeStr}${trainInfo}
                    </div>
                </div>
            `;
        }).join('');
    }

    highlightConnection(targetStationId) {
        // Update this to show travel time info instead of highlighting lines
        const travelTimes = this.calculateDirectTravelTimes(this.selectedStationId);
        const travelTime = travelTimes[targetStationId];

        if (travelTime !== Infinity) {
            const hours = Math.floor(travelTime / 60);
            const minutes = Math.floor(travelTime % 60);
            const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

            // Show travel time in a popup or sidebar
            const targetStation = this.stations[targetStationId];
            if (targetStation) {
                alert(`Najkrótszy czas podróży do ${targetStation.name}: ${timeStr}`);
            }
        } else {
            const targetStation = this.stations[targetStationId];
            if (targetStation) {
                alert(`Brak połączenia do ${targetStation.name}`);
            }
        }
    }
}

// Initialize the application when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new PolishRailwayMap();
});

// Make app globally available for onclick handlers
window.app = app;
