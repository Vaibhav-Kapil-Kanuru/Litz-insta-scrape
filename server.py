from fastapi import FastAPI, HTTPException, Request, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
import os
import json
from scraper import InstaScraper
import asyncio
from ai_processor import extract_attributes
import requests
from typing import List

app = FastAPI()
scraper = InstaScraper()

# Ensure directories exist
os.makedirs("storage/instagram", exist_ok=True)

class ScrapeRequest(BaseModel):
    username: str
    limit: int = 10

class BulkPostRequest(BaseModel):
    post_ids: List[str]

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

@app.post("/api/enrich")
async def enrich_memes(req: BulkPostRequest):
    print(f"Enriching memes: {req.post_ids}")
    history = []
    if os.path.exists("storage/metadata.json"):
        with open("storage/metadata.json", "r") as f:
            history = json.load(f)
    
    results = []
    updated = False
    
    for post_id in req.post_ids:
        post = next((h for h in history if h['post_id'] == post_id), None)
        if not post:
            results.append({"post_id": post_id, "status": "error", "message": "Post not found"})
            continue
            
        # Map /images/user/id.jpg to storage/instagram/user/id.jpg
        img_path = post['image_path'].replace("/images/", "storage/instagram/")
        if not os.path.exists(img_path):
             results.append({"post_id": post_id, "status": "error", "message": "Image file not found"})
             continue
             
        # Extract attributes using Gemini
        try:
            ai_data = extract_attributes(img_path, post.get('caption', ''))
            if "error" in ai_data:
                results.append({"post_id": post_id, "status": "error", "message": ai_data["error"]})
                continue
                
            post['ai_data'] = ai_data
            post['status'] = 'enriched'
            updated = True
            results.append({"post_id": post_id, "status": "success"})
        except Exception as e:
            results.append({"post_id": post_id, "status": "error", "message": str(e)})

    if updated:
        with open("storage/metadata.json", "w") as f:
            json.dump(history, f, indent=2)
            
    return results

@app.post("/api/annotate")
async def annotate_bulk(req: BulkPostRequest):
    print(f"Annotating memes: {req.post_ids}")
    history = []
    if os.path.exists("storage/metadata.json"):
        with open("storage/metadata.json", "r") as f:
            history = json.load(f)
            
    posts_to_upload = [h for h in history if h['post_id'] in req.post_ids and h.get('status') == 'enriched']
    
    if not posts_to_upload:
        raise HTTPException(status_code=400, detail="No enriched posts found to upload.")
    
    # Format data for the weird form-data structure
    # items[0]title, items[0]actors[0]name, etc.
    form_data = {}
    
    for i, post in enumerate(posts_to_upload):
        data = post['ai_data']
        # Simple fields
        form_data[f"items[{i}]title"] = data.get("title", "")
        form_data[f"items[{i}]releaseYear"] = data.get("releaseYear", "")
        form_data[f"items[{i}]genre"] = data.get("genre", "")
        form_data[f"items[{i}]director"] = data.get("director", "")
        form_data[f"items[{i}]emotionLabel"] = data.get("emotionLabel", "")
        form_data[f"items[{i}]emotionDescription"] = data.get("emotionDescription", "")
        form_data[f"items[{i}]memeReleaseYear"] = data.get("memeReleaseYear", "")
        form_data[f"items[{i}]imageSize"] = "1024,1024" # Default as per sample
        
        # Actors
        for j, actor in enumerate(data.get("actors", [])):
            form_data[f"items[{i}]actors[{j}]name"] = actor.get("name", "")
            form_data[f"items[{i}]actors[{j}]dob"] = actor.get("dob", "")
            form_data[f"items[{i}]actors[{j}]filmography"] = actor.get("filmography", "")
            
        # Dialogs
        for j, dialog in enumerate(data.get("dialogs", [])):
            form_data[f"items[{i}]dialogs[{j}]text"] = dialog.get("text", "")
            form_data[f"items[{i}]dialogs[{j}]actor"] = dialog.get("actor", "")
            
        # Tags
        for j, tag in enumerate(data.get("tags", [])):
            form_data[f"items[{i}]tags[{j}]name"] = tag.get("name", "")
            form_data[f"items[{i}]tags[{j}]category"] = tag.get("category", "")

    # Send to external API
    try:
        url = os.getenv("ANNOTATE_API_URL")
        response = requests.post(url, data=form_data)
        
        if response.status_code in [200, 201]:
            # Mark as completed
            for post in posts_to_upload:
                post['status'] = 'completed'
            
            with open("storage/metadata.json", "w") as f:
                json.dump(history, f, indent=2)
                
            return {"status": "success", "message": "Bulk upload successful", "api_response": response.text}
        else:
            return {"status": "error", "message": f"API returned {response.status_code}", "detail": response.text}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
