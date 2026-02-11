import requests
import json
import os

BASE_URL = "http://localhost:8000"

def test_status_update():
    # 1. Get current history to find some post IDs
    response = requests.get(f"{BASE_URL}/api/history")
    if response.status_code != 200:
        print("Failed to get history")
        return
    
    history = response.json()
    if not history:
        print("History is empty, cannot test status update")
        return
        
    post_ids = [p['post_id'] for p in history[:2]]
    print(f"Testing status update for: {post_ids}")
    
    # 2. Update status to 'enriched'
    payload = {
        "post_ids": post_ids,
        "status": "enriched"
    }
    response = requests.post(f"{BASE_URL}/api/memes/update-status", json=payload)
    print(f"Update Status Response: {response.status_code} - {response.text}")
    
    if response.status_code == 200:
        # 3. Verify in history
        response = requests.get(f"{BASE_URL}/api/history")
        new_history = response.json()
        for pid in post_ids:
            post = next((p for p in new_history if p['post_id'] == pid), None)
            if post and post.get('status') == 'enriched':
                print(f"SUCCESS: Post {pid} status is now 'enriched'")
            else:
                print(f"FAILURE: Post {pid} status is {post.get('status') if post else 'MISSING'}")
                
        # 4. Revert to 'pending'
        payload['status'] = 'pending'
        response = requests.post(f"{BASE_URL}/api/memes/update-status", json=payload)
        print(f"Revert Status Response: {response.status_code} - {response.text}")
    else:
        print(f"ERROR: Backend returned {response.status_code}. Detail: {response.text}")
        if response.status_code == 404:
            print("Check if the post IDs exist in the metadata.")

if __name__ == "__main__":
    test_status_update()
