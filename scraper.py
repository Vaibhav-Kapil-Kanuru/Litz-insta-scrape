
import instaloader
import os
import json
import time
from datetime import datetime
import requests
import shutil

class InstaScraper:
    def __init__(self, storage_path="storage"):
        self.L = instaloader.Instaloader(
            download_pictures=True,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            dirname_pattern=os.path.join(storage_path, "instagram", "{profile}"),
            filename_pattern="{shortcode}"
        )
        self.storage_path = storage_path
        self.metadata_file = os.path.join(storage_path, "metadata.json")
        
        # Ensure base directories exist
        os.makedirs(os.path.join(self.storage_path, "instagram"), exist_ok=True)

    def _get_history(self):
        if os.path.exists(self.metadata_file):
            try:
                with open(self.metadata_file, 'r') as f:
                    return json.load(f)
            except:
                return []
        return []

    def _save_history(self, history):
        with open(self.metadata_file, 'w') as f:
            json.dump(history, f, indent=2)

    def scrape_profile(self, username, limit=10):
        print(f"Starting Instaloader scrape for @{username} (limit: {limit})")
        try:
            profile = instaloader.Profile.from_username(self.L.context, username)
        except Exception as e:
            print(f"Instaloader Error: {e}")
            return {"error": str(e)}

        history = self._get_history()
        scraped_posts = []

        count = 0
        for post in profile.get_posts():
            if count >= limit:
                break

            # Filter for images only
            if post.is_video:
                continue

            post_id = post.shortcode
            post_url = f"https://www.instagram.com/p/{post_id}/"
            
            # Check if already scraped
            if any(h['post_id'] == post_id for h in history):
                continue

            # Download post
            try:
                self.L.download_post(post, target=username)
                
                # Cleanup: Instaloader downloads .json.xz and .txt files too. Delete them.
                profile_dir = os.path.join(self.storage_path, "instagram", username)
                for file in os.listdir(profile_dir):
                    if not file.endswith(".jpg") and not file.endswith(".jpeg") and not file.endswith(".png"):
                        try:
                            os.remove(os.path.join(profile_dir, file))
                        except:
                            pass

                metadata = {
                    "post_id": post_id,
                    "post_url": post_url,
                    "caption": post.caption or "No description",
                    "image_path": f"/images/{username}/{post_id}.jpg",
                    "timestamp": post.date.isoformat(),
                    "scraped_at": datetime.now().isoformat(),
                    "username": username,
                    "status": "pending"
                }
                
                history.append(metadata)
                scraped_posts.append(metadata)
                count += 1
                print(f"Saved: {post_id}")
                
                # Rate limiting
                time.sleep(2)
                
            except Exception as e:
                print(f"Error downloading {post_id}: {e}")
                continue

        self._save_history(history)
        return {"scraped_count": len(scraped_posts), "posts": scraped_posts}

    def delete_post(self, post_id):
        history = self._get_history()
        post_to_delete = next((h for h in history if h['post_id'] == post_id), None)
        
        if post_to_delete:
            # Delete physical file
            # image_path is e.g., /images/username/postid.jpg
            # We need to map it to storage/instagram/username/postid.jpg
            parts = post_to_delete['image_path'].split('/')
            if len(parts) >= 4:
                username = parts[2]
                filename = parts[3]
                full_path = os.path.join(self.storage_path, "instagram", username, filename)
                
                if os.path.exists(full_path):
                    try:
                        os.remove(full_path)
                    except:
                        pass
            
            # Remove from history
            new_history = [h for h in history if h['post_id'] != post_id]
            self._save_history(new_history)
            return True
        return False

    def delete_folder(self, username):
        history = self._get_history()
        
        # Delete directory
        profile_dir = os.path.join(self.storage_path, "instagram", username)
        if os.path.exists(profile_dir):
            try:
                shutil.rmtree(profile_dir)
            except:
                pass
        
        # Remove all posts for this user from history
        new_history = [h for h in history if h['username'] != username]
        self._save_history(new_history)
        return True

    def process_apify_json(self, items, progress_callback=None):
        """Processes a list of items from an Apify Instagram Scraper export."""
        history = self._get_history()
        scraped_posts = []
        total = len(items)
        
        print(f"Processing {total} items from Apify JSON...")
        
        for index, item in enumerate(items):
            post_id = item.get("shortCode")
            
            # Update progress
            if progress_callback:
                progress_callback(index + 1, total, post_id or "scanning")

            if not post_id:
                continue
                
            # Check if already scraped
            if any(h['post_id'] == post_id for h in history):
                continue

            username = item.get("ownerUsername") or "unknown"
            image_url = item.get("displayUrl")
            if not image_url:
                continue

            # Ensure directory exists
            profile_dir = os.path.join(self.storage_path, "instagram", username)
            os.makedirs(profile_dir, exist_ok=True)

            # Download image
            try:
                # Use headers to avoid being blocked by CDN
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
                
                # Determine extension from URL or fallback to jpg
                ext = ".jpg"
                if ".webp" in image_url.lower(): ext = ".webp"
                elif ".png" in image_url.lower(): ext = ".png"
                
                img_filename = f"{post_id}{ext}"
                img_path = os.path.join(profile_dir, img_filename)
                
                response = requests.get(image_url, headers=headers, timeout=20, stream=True)
                if response.status_code == 200:
                    with open(img_path, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            f.write(chunk)
                    
                    metadata = {
                        "post_id": post_id,
                        "post_url": item.get("url") or f"https://www.instagram.com/p/{post_id}/",
                        "caption": item.get("caption", "No description"),
                        "image_path": f"/images/{username}/{img_filename}",
                        "timestamp": item.get("timestamp") or datetime.now().isoformat(),
                        "scraped_at": datetime.now().isoformat(),
                        "username": username,
                        "status": "pending"
                    }
                    
                    history.append(metadata)
                    scraped_posts.append(metadata)
                    print(f"Processed from JSON: {post_id}")
                else:
                    print(f"Failed to download image for {post_id}: HTTP {response.status_code}")
            except Exception as e:
                print(f"Error processing {post_id}: {e}")

        self._save_history(history)
        return {"scraped_count": len(scraped_posts), "posts": scraped_posts}

if __name__ == "__main__":
    scraper = InstaScraper()
    # print(scraper.scrape_profile("nasa", limit=2))
