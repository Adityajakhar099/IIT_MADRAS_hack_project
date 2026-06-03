import re
import os
import logging
from typing import Dict, Any

# Configure logger
logger = logging.getLogger("challan_parser")
logger.setLevel(logging.INFO)

# Standard violations mapped to search keywords
VIOLATION_KEYWORDS = {
    "No Helmet": ["helmet", "without helmet", "no helmet", "safety helmet"],
    "No Seatbelt": ["seatbelt", "seat belt", "without seatbelt", "no seatbelt"],
    "Signal Jumping": ["signal jumping", "signal jump", "red light", "traffic signal", "jumping signal"],
    "Overspeeding": ["overspeeding", "speeding", "over speed", "speed limit", "excessive speed"],
    "Drunk Driving": ["drunk", "drunk driving", "alcohol", "drinking and driving", "intoxicated", "drink & drive"],
    "No Insurance": ["insurance", "without insurance", "no insurance", "uninsured"],
    "No License": ["license", "licence", "driving license", "no license", "without license", "dl "],
    "Dangerous Driving": ["dangerous driving", "dangerous", "reckless driving"],
    "Mobile Phone Usage": ["mobile", "phone", "mobile phone", "cellphone", "handheld device", "phone usage"],
    "Wrong Parking": ["parking", "wrong parking", "no parking", "illegal parking", "obstruction"],
    "Triple Riding": ["triple", "triple riding", "three riding", "3-riding"],
    "PUCC violation": ["puc", "pucc", "pollution", "pollution under control", "emission"],
    "Driving without registration": ["registration", "unregistered", "without registration", "without rc", "no rc"],
    "Illegal modification": ["modification", "modified", "illegal modification", "silencer modification"],
    "Rash driving": ["rash driving", "rash", "reckless"]
}

def parse_challan_details(text: str) -> Dict[str, str]:
    """
    Parses the OCR-extracted text using regex and keyword heuristics.
    
    Args:
        text: Raw OCR extracted text.
        
    Returns:
        Dict[str, str]: Structured challan details.
    """
    logger.info("Parsing challan text for structured details...")
    if not text:
        return {
            "vehicle_number": "Unknown",
            "violation": "Unknown",
            "fine_amount": "Not Found",
            "authority": "Unknown",
            "date": "Unknown",
            "location": "Unknown"
        }

    upper_text = text.upper()
    lines = text.split("\n")
    lower_lines = [l.lower() for l in lines]
    
    # 1. Extract Vehicle Number (standard Indian registration formats)
    vehicle_number = "Unknown"
    vehicle_patterns = [
        # Modern Delhi style with alphanumeric RTO codes (e.g. DL 3C AB 1234, DL-3C-AB-5678)
        r'\b([A-Z]{2}[ -]?[0-9]{1,2}[A-Z]?[ -]?[A-Z]{1,3}[ -]?[0-9]{4})\b',
        # Standard Modern (e.g. MH 12 AB 1234, MH-12-AB-1234)
        r'\b([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,3}[ -]?[0-9]{4})\b',
        # Older or commercial (e.g. MH 12 A 123, MH-12-A-123)
        r'\b([A-Z]{2}[ -]?[0-9]{2}[ -]?[A-Z]{1,2}[ -]?[0-9]{3,4})\b',
        # Simplified/Government (e.g. DL 12 1234, DL-12-1234)
        r'\b([A-Z]{2}[ -]?[0-9]{2}[ -]?[0-9]{4})\b'
    ]
    for pattern in vehicle_patterns:
        match = re.search(pattern, upper_text)
        if match:
            vehicle_number = match.group(1).strip()
            # Clean up spaces or hyphens to normalize format
            vehicle_number = re.sub(r'[- ]+', ' ', vehicle_number)
            break

    # 2. Extract Fine Amount
    fine_amount = "Not Found"
    # Look for currency indicators followed by numbers (e.g. Rs. 1000, INR 500, Rupees 2000)
    fine_match = re.search(r'(?:fine|penalty|amount|rs\.?|inr|rupees)\s*[:=-]?\s*(\d{3,6})\b', text, re.IGNORECASE)
    if not fine_match:
        # Fallback to direct currency symbols
        fine_match = re.search(r'(?:rs\.?|inr)\s*(\d{3,6})\b', text, re.IGNORECASE)
    if fine_match:
        fine_amount = fine_match.group(1).strip()

    # 3. Extract Violation
    violation = "Unknown"
    lower_text = text.lower()
    for std_violation, kw_list in VIOLATION_KEYWORDS.items():
        if any(kw in lower_text for kw in kw_list):
            violation = std_violation
            break
            
    # Fallback: if no standard violation keywords matched, look for a line mentioning "violation" or "offence"
    if violation == "Unknown":
        for line in lines:
            if any(k in line.lower() for k in ["violation", "offence", "offense"]):
                cleaned_line = re.sub(r'(?:violation|offence|offense)\s*[:=-]?\s*', '', line, flags=re.IGNORECASE)
                if len(cleaned_line.strip()) > 3:
                    violation = cleaned_line.strip()
                    break

    # 4. Extract Authority
    authority = "Unknown"
    if "traffic police" in lower_text:
        police_match = re.search(r'\b([A-Za-z\s]+Traffic Police)\b', text, re.IGNORECASE)
        authority = police_match.group(1).strip() if police_match else "Traffic Police"
    elif "rto" in lower_text or "regional transport" in lower_text:
        rto_match = re.search(r'\b([A-Za-z\s]+RTO)\b', text, re.IGNORECASE)
        authority = rto_match.group(1).strip() if rto_match else "RTO Department"
    elif "police" in lower_text:
        police_match = re.search(r'\b([A-Za-z\s]+Police)\b', text, re.IGNORECASE)
        authority = police_match.group(1).strip() if police_match else "Police Department"

    if authority != "Unknown":
        authority = authority.title()
        # Keep RTO in uppercase
        authority = re.sub(r'\bRto\b', 'RTO', authority)

    # 5. Extract Date
    date_found = "Unknown"
    date_match = re.search(r'\b(\d{2}[-/.]\d{2}[-/.]\d{4})\b', text)
    if not date_match:
        date_match = re.search(r'\b(\d{4}[-/.]\d{2}[-/.]\d{2})\b', text)
    if date_match:
        date_found = date_match.group(1).strip()

    # 6. Extract Location
    location = "Unknown"
    location_keywords = ["near", "at", "road", "chowk", "junction", "street", "crossing", "highway", "toll", "naka"]
    for line in lines:
        # Check if the line contains a location helper word
        words = line.lower().split()
        if any(kw in words for kw in location_keywords):
            location = line.strip()
            if len(location) > 100:
                location = location[:97] + "..."
            break

    logger.info(f"Parsed challan details successfully. Vehicle: {vehicle_number}, Violation: {violation}, Fine: {fine_amount}")
    return {
        "vehicle_number": vehicle_number,
        "violation": violation,
        "fine_amount": fine_amount,
        "authority": authority,
        "date": date_found,
        "location": location
    }

def generate_challan_explanation(parsed_data: Dict[str, str]) -> str:
    """
    Queries Gemini API to generate a citizen-friendly explanation of the violation and consequences.
    
    Args:
        parsed_data: Dictionary of parsed challan parameters.
        
    Returns:
        str: Citizen-friendly explanation.
    """
    logger.info("Initializing Gemini API connection for explanation...")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        try:
            from dotenv import load_dotenv
            load_dotenv()
            api_key = os.getenv("GEMINI_API_KEY")
        except Exception as dotenv_err:
            logger.warning(f"Could not load dotenv: {dotenv_err}")
            
    if not api_key:
        logger.error("GEMINI_API_KEY not found in environment.")
        return "Explanation could not be generated because GEMINI_API_KEY is missing."

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        
        system_instruction = (
            "You are a helpful, professional traffic compliance legal advisor. "
            "Your task is to take the extracted challan information and explain it "
            "to a citizen in simple, citizen-friendly language. "
            "Explain the violation, the legal section involved, the fine details, "
            "consequences (like suspensions/court requirements), and why this rule "
            "exists for road safety. Keep it concise, professional, and easy to read."
        )
        
        # Determine appropriate model name
        model_name = "gemini-1.5-flash"
        try:
            available_models = [m.name for m in genai.list_models()]
            available_names = [name.replace("models/", "") for name in available_models]
            if model_name not in available_names:
                for candidate in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]:
                    if candidate in available_names:
                        model_name = candidate
                        break
        except Exception:
            pass
            
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction
        )
        
        prompt = (
            f"Please explain this traffic challan to the citizen:\n"
            f"- Vehicle Number: {parsed_data.get('vehicle_number')}\n"
            f"- Violation: {parsed_data.get('violation')}\n"
            f"- Fine Amount: {parsed_data.get('fine_amount')}\n"
            f"- Authority: {parsed_data.get('authority')}\n"
            f"- Date: {parsed_data.get('date')}\n"
            f"- Location: {parsed_data.get('location')}\n\n"
            f"Provide a clear, helpful, and citizen-friendly summary: "
            f"1. Explain what the violation is and what it means.\n"
            f"2. Mention the legal consequences (paying the fine, potential suspension, or court actions).\n"
            f"3. Highlight the safety importance of this rule.\n"
            f"Keep the language simple, polite, and direct. Avoid repeating the prompt text. Use list formatting or bullet points if needed."
        )
        
        response = model.generate_content(prompt)
        explanation = response.text.strip()
        logger.info("Challan explanation generated successfully.")
        return explanation
        
    except Exception as e:
        logger.error(f"Gemini explanation generation failed: {e}")
        return f"Could not generate explanation due to an internal AI model error: {str(e)}"
