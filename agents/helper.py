import json
from typing import List

def _scavenge_json_objects(self, text: str) -> List[dict]:
        """
        Scavenges valid JSON objects from a messy string buffer.
        Handles: {"a":1}{"b":2} (concatenated) and text wrappers.
        """
        valid_objects = []
        text = text.strip()
        
        # Method: Brace Counting to separate objects
        stack = 0
        start_index = -1
        
        for i, char in enumerate(text):
            if char == '{':
                if stack == 0: start_index = i
                stack += 1
            elif char == '}':
                stack -= 1
                if stack == 0 and start_index != -1:
                    candidate = text[start_index : i+1]
                    try:
                        valid_objects.append(json.loads(candidate))
                        start_index = -1 # Reset
                    except json.JSONDecodeError:
                        pass
        return valid_objects