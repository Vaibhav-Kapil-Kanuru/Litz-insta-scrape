from fastapi import FastAPI, HTTPException, Request, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
import os
import json
from scraper import InstaScraper
import asyncio

app = FastAPI()
scraper = InstaScraper()

# Ensure directories exist
os.makedirs("storage/instagram", exist_ok=True)

class ScrapeRequest(BaseModel):
    username: str
    limit: int = 10

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
