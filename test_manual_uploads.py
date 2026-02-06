
import requests
import os
import json

BASE_URL = "http://localhost:8000"

def test_manual_flow():
    # 1. Check history
    print("Checking manual history...")
    resp = requests.get(f"{BASE_URL}/api/uploads/history")
    print(f"History: {resp.json()}")

    # 2. Upload an image (creating a dummy one first)
    print("\nCreating dummy image...")
    from PIL import Image
    img = Image.new('RGB', (100, 100), color = 'red')
    img.save('test_upload.jpg')

    print("Uploading image...")
    with open('test_upload.jpg', 'rb') as f:
        resp = requests.post(f"{BASE_URL}/api/upload", files={'file': f})
    
    upload_data = resp.json()
    print(f"Upload Result: {upload_data}")
    post_id = upload_data['post_id']

    # 3. Check history again
    print("\nChecking history again...")
    resp = requests.get(f"{BASE_URL}/api/uploads/history")
    print(f"New History count: {len(resp.json())}")

    # 4. Enrich
    print(f"\nEnriching post {post_id}...")
    resp = requests.post(f"{BASE_URL}/api/uploads/enrich", json={"post_ids": [post_id]})
    print(f"Enrich Result: {resp.json()}")

    # 5. Clean up
    os.remove('test_upload.jpg')

if __name__ == "__main__":
    try:
        test_manual_flow()
    except Exception as e:
        print(f"Error: {e}")
        print("Make sure the server is running on http://localhost:8000")
