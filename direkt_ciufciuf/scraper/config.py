# Configuration file for the scraper
SCRAPER_CONFIG = {
    "max_requests_per_minute": 60,
    "delay_between_requests": 1.0,
    "max_distance_km": 800,  # Maximum reasonable train distance in Poland
    "output_dir": "data",
    "log_level": "INFO",
    "resume_on_error": True,
    "batch_size": 50,  # Number of stations to process before saving partial data
}

# API Configuration
API_CONFIG = {
    "timeout": 30,
    "retry_attempts": 3,
    "retry_delay": 5,
}

# Data validation rules
VALIDATION_RULES = {
    "min_station_name_length": 2,
    "required_coordinates": True,
    "min_connection_duration": 1,  # minutes
    "max_connection_duration": 1440,  # 24 hours in minutes
}
