# Instagram Public Profile Scraper

A lightweight Python script to collect image posts and metadata from public Instagram profiles without login or authentication.

## Features
- **Public Only**: Extracts data from public profiles without needing an account.
- **Image Filtering**: Automatically ignores videos, reels, and stories.
- **Detailed Metadata**: Saves post ID, URL, caption, timestamp, and local path.
- **Robustness**: Includes rate limiting (5s delay) and auto-stop on repeated failures.
- **Storage**: Organized structure: `/instagram/{username}/{post_id}.jpg`.

## Setup
1. Ensure you have Python 3.9+ installed.
2. Install dependencies:
   ```bash
   pip install instaloader requests
   ```

## Usage
Run the script with a username or full URL:
```bash
python3 ig_scraper.py <username_or_url> [max_posts]
```

### Examples:
```bash
# Scrapes the last 10 image posts from NASA
python3 ig_scraper.py nasa

# Scrapes the last 20 image posts from a specific URL
python3 ig_scraper.py https://www.instagram.com/natgeo/ 20
```

## Output Structure
```
/instagram/
  /{username}/
    /{post_id}.jpg
    /metadata.json
```

## Constraints
- Single profile per run.
- Rate limited (5 seconds between downloads).
- Stops execution after 3 consecutive failures.
# Litz-insta-scrape
