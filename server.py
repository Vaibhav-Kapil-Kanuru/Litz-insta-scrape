from fastapi import FastAPI, HTTPException, Request, Body, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
import os
import json
from scraper import InstaScraper
import asyncio
import time
from ai_processor import extract_attributes, extract_attributes_async
import requests
from typing import List

app = FastAPI()
scraper = InstaScraper()

# Ensure directories exist
os.makedirs("storage/instagram", exist_ok=True)
os.makedirs("storage/uploads", exist_ok=True)

class UploadMetadata(BaseModel):
    post_id: str
    image_path: str
    status: str = "pending"
    caption: str = ""
    ai_data: dict = {}
    timestamp: float

class ScrapeRequest(BaseModel):
    username: str
    limit: int = 10

class BulkPostRequest(BaseModel):
    post_ids: List[str]

class SigninRequest(BaseModel):
    emailOrUsername: str
    password: str

@app.post("/api/scrape")
async def scrape(req: ScrapeRequest):
    result = scraper.scrape_profile(req.username, limit=req.limit)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.post("/api/import-apify")
async def import_apify(items = Body(...)):
    # If it's a dict instead of a list (e.g. sometimes Apify sends wrapped data)
    if isinstance(items, dict):
        # Look for common keys where lists might be stored
        if "items" in items: items = items["items"]
        elif "data" in items: items = items["data"]
        else: items = [items] # Treat single object as a list
        
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="Expected a list of items.")

    async def progress_generator():
        queue = asyncio.Queue()

        def progress_cb(current, total, post_id):
            # Put progress data into the queue
            queue.put_nowait(json.dumps({
                "type": "progress",
                "current": current,
                "total": total,
                "post_id": post_id
            }))

        # Run the processing in a separate thread to not block the event loop
        loop = asyncio.get_event_loop()
        
        # This will run the blocking scraper code
        future = loop.run_in_executor(None, scraper.process_apify_json, items, progress_cb)
        
        while not future.done() or not queue.empty():
            try:
                # Wait for progress updates with a timeout
                data = await asyncio.wait_for(queue.get(), timeout=0.1)
                yield f"data: {data}\n\n"
            except asyncio.TimeoutError:
                if future.done() and queue.empty():
                    break
                continue

        # Final result
        result = future.result()
        yield f"data: {json.dumps({'type': 'complete', 'scraped_count': result['scraped_count']})}\n\n"

    return StreamingResponse(progress_generator(), media_type="text/event-stream")

@app.get("/api/history")
async def get_history():
    if os.path.exists("storage/metadata.json"):
        with open("storage/metadata.json", "r") as f:
            return json.load(f)
    return []

@app.delete("/api/folder/{username}")
async def delete_folder(username: str):
    success = scraper.delete_folder(username)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Folder deleted"}

@app.delete("/api/meme/{post_id}")
async def delete_meme(post_id: str):
    # 1. Try to find in scraped history
    scraped_path = "storage/metadata.json"
    if os.path.exists(scraped_path):
        with open(scraped_path, "r") as f:
            scraped_history = json.load(f)
        
        post_index = next((i for i, p in enumerate(scraped_history) if p['post_id'] == post_id), None)
        if post_index is not None:
            post = scraped_history.pop(post_index)
            # Delete image file
            img_path = post['image_path'].replace("/images/", "storage/instagram/")
            if os.path.exists(img_path):
                os.remove(img_path)
            
            with open(scraped_path, "w") as f:
                json.dump(scraped_history, f, indent=2)
            return {"message": "Meme deleted from archive"}

    # 2. Try to find in manual uploads
    manual_path = "storage/uploads_metadata.json"
    if os.path.exists(manual_path):
        with open(manual_path, "r") as f:
            manual_history = json.load(f)
        
        post_index = next((i for i, p in enumerate(manual_history) if p['post_id'] == post_id), None)
        if post_index is not None:
            post = manual_history.pop(post_index)
            # Delete image file
            img_path = post['image_path'].replace("/upload-images/", "storage/uploads/")
            if os.path.exists(img_path):
                os.remove(img_path)
            
            with open(manual_path, "w") as f:
                json.dump(manual_history, f, indent=2)
            return {"message": "Meme deleted from uploads"}

    raise HTTPException(status_code=404, detail="Meme not found")

@app.post("/api/auth/signin")
async def signin(req: SigninRequest):
    url = os.getenv("SUPABASE_SIGNIN_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    
    try:
        headers = {
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "emailOrUsername": req.emailOrUsername,
            "password": req.password
        }
        print(f"DEBUG: Proxied Supabase Sign-in - URL: {url}")
        print(f"DEBUG: Proxied Supabase Sign-in - Headers: {headers}")
        print(f"DEBUG: Proxied Supabase Sign-in - Body: {payload}")
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            return response.json() # Returns {access_token, user, etc}
        else:
            raise HTTPException(status_code=response.status_code, detail=response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/enrich")
async def enrich_memes(req: BulkPostRequest):
    print(f"Enriching memes in parallel: {req.post_ids}")
    history = []
    if os.path.exists("storage/metadata.json"):
        with open("storage/metadata.json", "r") as f:
            history = json.load(f)
    
    semaphore = asyncio.Semaphore(20) # Process 20 at a time
    
    async def enrich_single(post_id):
        async with semaphore:
            start = time.time()
            print(f"[{post_id}] Started at {start}")
            post = next((h for h in history if h['post_id'] == post_id), None)
            if not post:
                return {"post_id": post_id, "status": "error", "message": "Post not found"}
                
            img_path = post['image_path'].replace("/images/", "storage/instagram/")
            if not os.path.exists(img_path):
                 return {"post_id": post_id, "status": "error", "message": "Image file not found"}
                 
            try:
                ai_data = await extract_attributes_async(img_path, post.get('caption', ''))
                
                if "error" in ai_data:
                    return {"post_id": post_id, "status": "error", "message": ai_data["error"]}
                    
                post['ai_data'] = ai_data
                post['status'] = 'enriched'
                print(f"[{post_id}] Finished in {time.time() - start:.2f}s")
                return {"post_id": post_id, "status": "success"}
            except Exception as e:
                print(f"[{post_id}] Failed in {time.time() - start:.2f}s: {e}")
                return {"post_id": post_id, "status": "error", "message": str(e)}

    # Run all tasks in parallel
    results = await asyncio.gather(*(enrich_single(pid) for pid in req.post_ids))
    
    # Save history if any were successful
    if any(r['status'] == 'success' for r in results):
        with open("storage/metadata.json", "w") as f:
            json.dump(history, f, indent=2)
            
    return results

def get_supabase_token():
    url = os.getenv("SUPABASE_SIGNIN_URL")
    user = os.getenv("SUPABASE_USER")
    password = os.getenv("SUPABASE_PASSWORD")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    
    if not user or not password or user == "YOUR_EMAIL_OR_USERNAME":
        print("Warning: Supabase credentials not set in .env")
        return None

    try:
        payload = {
            "emailOrUsername": user,
            "password": password
        }
        headers = {
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json"
        }
        print(f"DEBUG: Supabase Auth Request (System) - URL: {url}")
        print(f"DEBUG: Supabase Auth Request (System) - Headers: {headers}")
        print(f"DEBUG: Supabase Auth Request (System) - Body: {payload}")
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            return response.json().get("access_token")
        else:
            print(f"Supabase login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error getting Supabase token: {e}")
        return None

def is_unknown(text):
    if not text:
        return True
    text_lower = str(text).lower()
    forbidden = ["unknown", "uncredited", "n/a", "not available", "character unknown"]
    return any(f in text_lower for f in forbidden)

@app.post("/api/annotate")
async def annotate_bulk(req: BulkPostRequest, request: Request):
    print(f"Annotating memes: {req.post_ids}")
    # Load both scraped and manual metadata
    scraped_history = []
    if os.path.exists("storage/metadata.json"):
        with open("storage/metadata.json", "r") as f:
            scraped_history = json.load(f)
            
    manual_history = []
    if os.path.exists("storage/uploads_metadata.json"):
        with open("storage/uploads_metadata.json", "r") as f:
            manual_history = json.load(f)
            
    all_history = scraped_history + manual_history
    posts_to_upload = [h for h in all_history if h['post_id'] in req.post_ids and h.get('status') == 'enriched']
    
    if not posts_to_upload:
        raise HTTPException(status_code=400, detail="No enriched posts found to upload.")
    
    # Token Extraction Logic
    token = None
    
    # 1. Check Authorization header (Bearer)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        print("DEBUG: Token extracted from Authorization header")
    
    # 3. Check X-Supabase-Auth header (Backward compatibility)
    if not token:
        token = request.headers.get("X-Supabase-Auth")
        if token:
            print("DEBUG: Token extracted from X-Supabase-Auth header")
            
    # 4. Fallback to system token
    if not token:
        print("DEBUG: No user token found in headers, falling back to system token")
        token = get_supabase_token()
        
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")

    anon_key = os.getenv("SUPABASE_ANON_KEY")
    
    # Format data for the weird form-data structure
    form_data = {}
    files = {}
    file_handles = []

    try:
        import mimetypes
        import io
        from PIL import Image
        
        for i, post in enumerate(posts_to_upload):
            data = post.get('ai_data', {})
            # Filter actors
            valid_actors = [a for a in data.get("actors", []) if not is_unknown(a.get("name"))]
            
            # Skip item if no valid actors or title is unknown
            if not valid_actors or is_unknown(data.get("title")):
                print(f"DEBUG: Skipping item {i} ({post['post_id']}) - Unknown actors or title")
                continue

            # Standard flat notation required by the API
            form_data[f"items[{i}]title"] = data.get("title", "")
            form_data[f"items[{i}]releaseYear"] = str(data.get("releaseYear", ""))
            form_data[f"items[{i}]genre"] = data.get("genre", "")
            form_data[f"items[{i}]director"] = data.get("director", "")
            form_data[f"items[{i}]emotionLabel"] = data.get("emotionLabel", "")
            form_data[f"items[{i}]emotionDescription"] = data.get("emotionDescription", "")
            form_data[f"items[{i}]memeReleaseYear"] = str(data.get("memeReleaseYear", ""))
            form_data[f"items[{i}]imageSize"] = "1024,1024"
            form_data[f"items[{i}]status"] = "approved"
            
            # File Upload with Format Compatibility Fix
            img_path = post['image_path']
            if img_path.startswith("/images/"):
                img_path = img_path.replace("/images/", "storage/instagram/")
            else:
                img_path = img_path.replace("/upload-images/", "storage/uploads/")

            if os.path.exists(img_path):
                try:
                    with Image.open(img_path) as img:
                        # Determine actual format
                        actual_format = img.format.lower() if img.format else "unknown"
                        
                        # Allowed by API: jpeg, png, gif
                        allowed_formats = ['jpeg', 'jpg', 'png', 'gif']
                        
                        # We also force conversion if it's named .webp even if internal data is jpeg
                        # because some APIs reject .webp extensions regardless of content
                        if actual_format in allowed_formats and not img_path.lower().endswith('.webp'):
                            # File is fine as is
                            f_handle = open(img_path, 'rb')
                            file_handles.append(f_handle)
                            mime = f"image/{actual_format if actual_format != 'jpg' else 'jpeg'}"
                            files[f"items[{i}]media"] = (os.path.basename(img_path), f_handle, mime)
                            print(f"DEBUG: Item {i} - Sending original {actual_format} file", flush=True)
                        else:
                            # Convert to JPEG for better compatibility
                            img = img.convert("RGB")
                            buffer = io.BytesIO()
                            img.save(buffer, format="JPEG", quality=90)
                            buffer.seek(0)
                            
                            new_filename = os.path.splitext(os.path.basename(img_path))[0] + ".jpg"
                            files[f"items[{i}]media"] = (new_filename, buffer, "image/jpeg")
                            print(f"DEBUG: Item {i} - Converted {actual_format} (or WebP) to JPEG", flush=True)
                            
                except Exception as img_err:
                    print(f"DEBUG: Error processing image {img_path}: {img_err}", flush=True)
            else:
                print(f"DEBUG: Item {i} - File NOT FOUND: {img_path}", flush=True)
            
            # Actors (using filtered valid_actors)
            for j, actor in enumerate(valid_actors):
                form_data[f"items[{i}]actors[{j}]name"] = actor.get("name", "")
                form_data[f"items[{i}]actors[{j}]dob"] = actor.get("dob", "")
                form_data[f"items[{i}]actors[{j}]filmography"] = " • ".join(actor.get("filmography", [])) if isinstance(actor.get("filmography"), list) else actor.get("filmography", "")
                
            # Dialogs (filter unknown actors)
            valid_dialogs = [d for d in data.get("dialogs", []) if not is_unknown(d.get("actor"))]
            for j, dialog in enumerate(valid_dialogs):
                form_data[f"items[{i}]dialogs[{j}]text"] = dialog.get("text", "")
                form_data[f"items[{i}]dialogs[{j}]actor"] = dialog.get("actor", "")
                
            # Tags
            for j, tag in enumerate(data.get("tags", [])):
                form_data[f"items[{i}]tags[{j}]name"] = tag.get("name", "")
                form_data[f"items[{i}]tags[{j}]category"] = tag.get("category", "")

        # Send to external API
        url = os.getenv("ANNOTATE_API_URL")
        headers = {
            "Authorization": f"Bearer {token}"
        }
        
        print(f"DEBUG: Annotate Request - URL: {url}", flush=True)
        print(f"DEBUG: Annotate Request - Headers (Actual): {headers}", flush=True)
        print(f"DEBUG: Annotate Request - Form Data Keys: {list(form_data.keys())}", flush=True)
        print(f"DEBUG: Annotate Request - Files Keys: {list(files.keys())}", flush=True)
        
        response = requests.post(url, data=form_data, files=files, headers=headers)
        print(f"DEBUG: Annotate Response - Status: {response.status_code}", flush=True)
        print(f"DEBUG: Annotate Response - Body: {response.text}", flush=True)
        
        if response.status_code in [200, 201]:
            # Try to parse response for granular success tracking
            success_indices = set()
            try:
                resp_data = response.json()
                if resp_data.get("status") == "Success" and "data" in resp_data:
                    results = resp_data["data"].get("results", [])
                    success_indices = {item["index"] for item in results if "index" in item}
            except Exception as e:
                print(f"Warning: Could not parse granular success from API: {e}")
                # Fallback: if we can't parse but status is 200, assume all OK unless told otherwise
                # But safer to assume none if we're expecting partials
                success_indices = set(range(len(posts_to_upload)))

            # Mark as completed in both histories (only if successful)
            updated_scraped = False
            updated_manual = False
            
            for i, post in enumerate(posts_to_upload):
                if i in success_indices:
                    post['status'] = 'completed'
                    if post['post_id'].startswith("up_"):
                        updated_manual = True
                    else:
                        updated_scraped = True
            
            if updated_scraped:
                if os.path.exists("storage/metadata.json"):
                    with open("storage/metadata.json", "w") as f:
                        json.dump(scraped_history, f, indent=2)
            
            if updated_manual:
                if os.path.exists("storage/uploads_metadata.json"):
                    with open("storage/uploads_metadata.json", "w") as f:
                        json.dump(manual_history, f, indent=2)
                
            return {"status": "success", "message": "Bulk upload processed", "api_response": response.text}
        else:
            return {"status": "error", "message": f"API returned {response.status_code}", "detail": response.text}
            
    except Exception as e:
        print(f"Error in annotate_bulk: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Crucial: close all file handles
        for fh in file_handles:
            fh.close()

# File Upload for Manual Images
@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    post_id = f"up_{int(time.time() * 1000)}"
    file_extension = os.path.splitext(file.filename)[1]
    if not file_extension:
        file_extension = ".jpg"
        
    filename = f"{post_id}{file_extension}"
    save_path = os.path.join("storage/uploads", filename)
    
    with open(save_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
        
    # Update manual metadata
    uploads = []
    metadata_path = "storage/uploads_metadata.json"
    if os.path.exists(metadata_path):
        with open(metadata_path, "r") as f:
            uploads = json.load(f)
            
    new_upload = {
        "post_id": post_id,
        "username": "Manual Upload",
        "image_path": f"/upload-images/{filename}",
        "status": "pending",
        "caption": "",
        "ai_data": {},
        "timestamp": time.time()
    }
    uploads.append(new_upload)
    
    with open(metadata_path, "w") as f:
        json.dump(uploads, f, indent=2)
        
    return new_upload

@app.get("/api/uploads/history")
async def get_uploads_history():
    metadata_path = "storage/uploads_metadata.json"
    if os.path.exists(metadata_path):
        with open(metadata_path, "r") as f:
            return json.load(f)
    return []

@app.post("/api/uploads/enrich")
async def enrich_uploads(req: BulkPostRequest):
    metadata_path = "storage/uploads_metadata.json"
    uploads = []
    if os.path.exists(metadata_path):
        with open(metadata_path, "r") as f:
            uploads = json.load(f)
            
    semaphore = asyncio.Semaphore(10)
    
    async def enrich_single_upload(post_id):
        async with semaphore:
            upload = next((u for u in uploads if u['post_id'] == post_id), None)
            if not upload:
                return {"post_id": post_id, "status": "error", "message": "Upload not found"}
            
            img_path = upload['image_path'].replace("/upload-images/", "storage/uploads/")
            try:
                ai_data = await extract_attributes_async(img_path, upload.get('caption', ''))
                if "error" in ai_data:
                    return {"post_id": post_id, "status": "error", "message": ai_data["error"]}
                
                upload['ai_data'] = ai_data
                upload['status'] = 'enriched'
                return {"post_id": post_id, "status": "success"}
            except Exception as e:
                return {"post_id": post_id, "status": "error", "message": str(e)}

    results = await asyncio.gather(*(enrich_single_upload(pid) for pid in req.post_ids))
    
    if any(r['status'] == 'success' for r in results):
        with open(metadata_path, "w") as f:
            json.dump(uploads, f, indent=2)
            
    return results

# Serve uploaded images
app.mount("/upload-images", StaticFiles(directory="storage/uploads"), name="upload_images")

# Serve images from storage/instagram
app.mount("/images", StaticFiles(directory="storage/instagram"), name="images")

# Serve frontend
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("static/index.html", "r") as f:
        return f.read()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
