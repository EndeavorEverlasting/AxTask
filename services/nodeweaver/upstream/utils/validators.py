"""Input validation utilities for NodeWeaver API"""
from config import Config
from utils.classification_profiles import extract_task_text

def validate_classification_input(data):
    """Validate classification request input"""
    if not isinstance(data, dict):
        return "Input must be a JSON object"
    
    if 'text' in data and not isinstance(data['text'], str):
        return "Field 'text' must be a string"

    text = extract_task_text(data)
    if not text:
        return "Missing required text input. Provide 'text' or AxTask fields like 'activity'/'notes'."
    
    if len(text) > Config.MAX_INPUT_LENGTH:
        return f"Text too long. Maximum length is {Config.MAX_INPUT_LENGTH} characters"
    
    # Validate metadata if provided
    if 'metadata' in data:
        if not isinstance(data['metadata'], dict):
            return "Field 'metadata' must be an object"
    
    return None  # No validation errors

def validate_topic_input(data):
    """Validate topic creation input"""
    if not isinstance(data, dict):
        return "Input must be a JSON object"
    
    if 'label' not in data:
        return "Missing required field: label"
    
    label = data['label']
    if not isinstance(label, str):
        return "Field 'label' must be a string"
    
    if not label.strip():
        return "Field 'label' cannot be empty"
    
    if len(label) > 200:
        return "Label too long. Maximum length is 200 characters"
    
    # Validate category if provided
    if 'category' in data:
        category = data['category']
        if not isinstance(category, str):
            return "Field 'category' must be a string"

        valid_categories = {value.lower() for value in (Config.DEFAULT_CATEGORIES + Config.AXTASK_CATEGORIES)}
        if category and category.lower() not in valid_categories:
            allowed = ', '.join(Config.DEFAULT_CATEGORIES + Config.AXTASK_CATEGORIES)
            return f"Invalid category. Must be one of: {allowed}"
    
    return None  # No validation errors