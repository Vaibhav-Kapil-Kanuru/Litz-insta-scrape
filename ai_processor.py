import os
import json
import google.generativeai as genai
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

model = genai.GenerativeModel('gemini-2.0-flash')

PROMPT = """
You are an expert at identifying memes from movies and TV shows. 
Analyze the provided image and caption. 
Extract the following information in a valid JSON format.

Required Fields:
1. title: The name of the movie or TV show.
2. releaseYear: Year the movie/show was released.
3. genre: Main genre of the movie/show.
4. director: Name of the director.
5. emotionLabel: A single primary emotion shown in the meme (e.g., Tension, Joy, Anger).
6. emotionDescription: A brief description of the emotion and why it's appropriate.
7. relatedEmotions: A list of 2-3 similar or related emotions for better search results.
8. memeReleaseYear: Approximately when this meme became popular.
9. actors: A list of main actors in the scene. Each actor object should have:
   - name: Actor name.
   - dob: Date of birth (YYYY-MM-DD) if known.
   - filmography: 3-4 other famous works.
10. dialogs: A list of key dialogs from the scene. Each dialog object should have:
    - text: The dialog text.
    - actor: Who said it.
11. tags: A list of 5-10 descriptive tags. Each tag object should have:
    - name: Tag name (e.g., Villian, Chaos, Interrogation).
    - category: One of [character, concept, situation, context].

IMPORTANT: 
- Be specific and accurate. 
- If information is missing, use your internal knowledge about the movie/scene.
- Ensure the output is ONLY the JSON object, NO markdown formatting (like ```json), no extra text.
"""

def extract_attributes(image_path, caption):
    try:
        if not os.path.exists(image_path):
            return {"error": f"File not found: {image_path}"}

        img = Image.open(image_path)
        
        # We need to make sure the relative path is correct for the script
        # The image_path is usually /images/username/postid.jpg
        # But locally it's storage/instagram/username/postid.jpg
        
        response = model.generate_content([PROMPT + f"\\n\\nCaption: {caption}", img])
        
        text = response.text.strip()
        
        # Handle cases where Gemini might still use code blocks
        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
            
        return json.loads(text)
    except Exception as e:
        print(f"Error in extract_attributes: {e}")
        return {"error": str(e)}

async def extract_attributes_async(image_path, caption):
    try:
        if not os.path.exists(image_path):
            return {"error": f"File not found: {image_path}"}

        img = Image.open(image_path)
        
        response = await model.generate_content_async([PROMPT + f"\n\nCaption: {caption}", img])
        
        text = response.text.strip()
        
        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
            
        return json.loads(text)
    except Exception as e:
        print(f"Error in extract_attributes_async: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    # Test with a local file if needed
    # print(extract_attributes("storage/instagram/nasa/DUPCTnSjq9q.jpg", "caption here"))
    pass
