
def is_unknown(text):
    if not text:
        return True
    text_lower = str(text).lower()
    forbidden = ["unknown", "uncredited", "n/a", "not available", "character unknown"]
    return any(f in text_lower for f in forbidden)

def test_filter():
    test_cases = [
        ("Brad Pitt", False),
        ("Unknown", True),
        ("Uncredited Actor", True),
        ("N/A", True),
        ("character unknown", True),
        ("Not Available", True),
        ("", True),
        (None, True),
        ("Main Character (Uncredited)", True),
        ("The Unknown Soldier", True) # This might be a false positive if it's a real name but rare
    ]
    
    print("Testing is_unknown function:")
    for text, expected in test_cases:
        result = is_unknown(text)
        status = "PASSED" if result == expected else "FAILED"
        print(f"  '{text}' -> {result} (Expected: {expected}) [{status}]")

    # Mock item structure
    data = {
        "title": "Fight Club",
        "actors": [
            {"name": "Brad Pitt"},
            {"name": "Unknown"}
        ],
        "dialogs": [
            {"actor": "Brad Pitt", "text": "First rule..."},
            {"actor": "Unknown", "text": "..."}
        ]
    }

    print("\nTesting item filtering logic:")
    valid_actors = [a for a in data.get("actors", []) if not is_unknown(a.get("name"))]
    valid_dialogs = [d for d in data.get("dialogs", []) if not is_unknown(d.get("actor"))]

    print(f"  Title: {data['title']}")
    print(f"  Filter result: {'SKIP' if not valid_actors or is_unknown(data.get('title')) else 'KEEP'}")
    print(f"  Valid Actors: {[a['name'] for a in valid_actors]}")
    print(f"  Valid Dialogs: {[d['actor'] for d in valid_dialogs]}")

    # Case 2: Unknown Title
    data2 = {"title": "Unknown Movie", "actors": [{"name": "Actor"}]}
    print(f"\nTesting Unknown Title:")
    valid_actors2 = [a for a in data2.get("actors", []) if not is_unknown(a.get("name"))]
    print(f"  Title: {data2['title']}")
    print(f"  Filter result: {'SKIP' if not valid_actors2 or is_unknown(data2.get('title')) else 'KEEP'}")

    # Case 3: No valid actors
    data3 = {"title": "Movie", "actors": [{"name": "Unknown"}]}
    print(f"\nTesting No Valid Actors:")
    valid_actors3 = [a for a in data3.get("actors", []) if not is_unknown(a.get("name"))]
    print(f"  Title: {data3['title']}")
    print(f"  Filter result: {'SKIP' if not valid_actors3 or is_unknown(data3.get('title')) else 'KEEP'}")

if __name__ == "__main__":
    test_filter()
