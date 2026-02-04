import instaloader
import json
import os
import time
import requests
from datetime import datetime

def scrape_instagram_profile(username, max_posts=10):
    """
    Scrapes public image posts from an Instagram profile.
    Saves images to /instagram/{username}/{post_id}.jpg
    Saves metadata to /instagram/{username}/metadata.json
    """
    loader = instaloader.Instaloader(
        download_pictures=True,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
    )

    # Base directory
    base_dir = f"instagram/{username}"
    os.makedirs(base_dir, exist_ok=True)

    metadata_file = os.path.join(base_dir, "metadata.json")
    
    # Load existing metadata if any
    if os.path.exists(metadata_file):
        with open(metadata_file, 'r') as f:
            try:
                all_metadata = json.load(f)
            except json.JSONDecodeError:
                all_metadata = []
    else:
        all_metadata = []

    print(f"Starting scrape for profile: {username}")
    
    consecutive_errors = 0
    max_consecutive_errors = 3
    
    try:
        profile = instaloader.Profile.from_username(loader.context, username)
        
        count = 0
        for post in profile.get_posts():
            if count >= max_posts:
                break
                
            if consecutive_errors >= max_consecutive_errors:
                print(f"Stopping execution after {max_consecutive_errors} consecutive failures.")
                break

            # Requirements: Image posts only (skip videos/reels)
            if post.is_video:
                print(f"Skipping video/reel post: {post.shortcode}")
                continue

            post_id = post.shortcode
            image_filename = f"{post_id}.jpg"
            image_path = os.path.join(base_dir, image_filename)

            # Check if already processed
            if any(m['post_id'] == post_id for m in all_metadata) and os.path.exists(image_path):
                print(f"Post {post_id} already exists, skipping.")
                continue

            print(f"Processing post: {post_id}")

            # Extract metadata
            post_data = {
                "post_id": post_id,
                "post_url": f"https://www.instagram.com/p/{post_id}/",
                "caption": post.caption if post.caption else "",
                "image_path": image_path,
                "timestamp": post.date_utc.isoformat(),
                "scraped_at": datetime.utcnow().isoformat()
            }

            # Download image
            try:
                # Use a proper User-Agent to avoid immediate blocks
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
                response = requests.get(post.url, stream=True, timeout=10, headers=headers)
                if response.status_code == 200:
                    with open(image_path, 'wb') as f:
                        for chunk in response.iter_content(1024):
                            f.write(chunk)
                    
                    all_metadata.append(post_data)
                    count += 1
                    consecutive_errors = 0 # Reset error count on success
                    
                    # Store metadata after each successful download
                    with open(metadata_file, 'w') as f:
                        json.dump(all_metadata, f, indent=2)
                        
                    print(f"Successfully saved {post_id}. Waiting 5 seconds...")
                    time.sleep(5)
                else:
                    print(f"Failed to download image for {post_id}: HTTP {response.status_code}")
                    consecutive_errors += 1
            except Exception as e:
                print(f"Error downloading image {post_id}: {e}")
                consecutive_errors += 1
                time.sleep(10)

        print(f"Scrape completed. Total new images collected: {count}")

    except instaloader.exceptions.ProfileNotExistsException:
        print(f"Error: Profile {username} does not exist.")
    except instaloader.exceptions.QueryIterationException as e:
        print(f"Error: Instagram query failed. Likely rate limited or login required. Details: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 ig_scraper.py <username> [max_posts]")
        sys.exit(1)
    
    user = sys.argv[1].strip()
    # Handle full URLs
    if "instagram.com/" in user:
        user = user.split("instagram.com/")[1].split("/")[0]
        
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    scrape_instagram_profile(user, limit)
