import os
import json
import logging
import difflib
from typing import List, Dict, Any

# Configure logger
logger = logging.getLogger("fine_engine")
logger.setLevel(logging.INFO)

# Define valid states and their matching file names
SUPPORTED_STATES = {
    "rajasthan": "rajasthan_fines.json",
    "maharashtra": "maharashtra_fines.json"
}

# Define vehicle type mapping for normalization
VEHICLE_NORMALIZATION = {
    # Bike mappings
    "bike": "Bike",
    "two-wheeler": "Bike",
    "2-wheeler": "Bike",
    "motorcycle": "Bike",
    "scooter": "Bike",
    
    # Car mappings
    "car": "Car",
    "four-wheeler": "Car",
    "4-wheeler": "Car",
    "lmv": "Car",
    "auto": "Car",
    "jeep": "Car",
    "suv": "Car",
    
    # Heavy Vehicle mappings
    "truck": "Heavy Vehicle",
    "bus": "Heavy Vehicle",
    "heavy vehicle": "Heavy Vehicle",
    "hmv": "Heavy Vehicle"
}

def load_fine_rules(state: str) -> List[Dict[str, Any]]:
    """
    Dynamically loads the traffic fine rules for a specific state.
    
    Args:
        state: The name of the state (e.g. 'Rajasthan', 'Maharashtra').
        
    Returns:
        List[Dict[str, Any]]: List of rules for the state.
        
    Raises:
        ValueError: If state is empty or unsupported.
        FileNotFoundError: If the JSON rule file does not exist.
        json.JSONDecodeError: If the JSON file is malformed.
    """
    if not state or not isinstance(state, str):
        logger.error("State parameter is empty or invalid.")
        raise ValueError("State must be a non-empty string.")
        
    state_key = state.strip().lower()
    if state_key not in SUPPORTED_STATES:
        logger.error(f"Unsupported state requested: {state}")
        raise ValueError(f"State '{state}' is not supported. Supported states are: {', '.join(s.capitalize() for s in SUPPORTED_STATES.keys())}")
        
    filename = SUPPORTED_STATES[state_key]
    # Dynamically find the file path relative to this script
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    file_path = os.path.join(base_dir, "data", "fines", filename)
    
    if not os.path.exists(file_path):
        logger.error(f"Rules file not found at: {file_path}")
        raise FileNotFoundError(f"Rules database for state '{state}' was not found.")
        
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            rules = json.load(f)
            logger.info(f"Successfully loaded {len(rules)} rules for state {state_key}.")
            return rules
    except json.JSONDecodeError as e:
        logger.error(f"Malformed JSON rule file at {file_path}: {str(e)}")
        raise ValueError(f"Rules database for state '{state}' is malformed or invalid.")

def normalize_vehicle_type(vehicle_type: str) -> str:
    """
    Normalizes a vehicle type string into a standard category.
    
    Args:
        vehicle_type: The input vehicle type string.
        
    Returns:
        str: Normalized category ('Bike', 'Car', or 'Heavy Vehicle').
        
    Raises:
        ValueError: If vehicle_type is invalid or unrecognized.
    """
    if not vehicle_type or not isinstance(vehicle_type, str):
        logger.error("Vehicle type parameter is empty or invalid.")
        raise ValueError("Vehicle type must be a non-empty string.")
        
    vt_key = vehicle_type.strip().lower()
    if vt_key in VEHICLE_NORMALIZATION:
        normalized = VEHICLE_NORMALIZATION[vt_key]
        logger.debug(f"Normalized vehicle type '{vehicle_type}' to '{normalized}'.")
        return normalized
        
    logger.error(f"Invalid vehicle type: {vehicle_type}")
    raise ValueError(f"Vehicle type '{vehicle_type}' is invalid. Supported categories are Bike, Car, Heavy Vehicle.")

def calculate_fine(
    state: str,
    vehicle_type: str,
    violation: str,
    repeat_offense: bool = False
) -> Dict[str, Any]:
    """
    Finds the exact fine amount and details for a given violation.
    
    Args:
        state: State where the violation occurred.
        vehicle_type: Type of vehicle.
        violation: The traffic violation.
        repeat_offense: True if this is a repeat offense, otherwise False.
        
    Returns:
        Dict[str, Any]: Exact structured response containing law section, fine and suspension status.
        
    Raises:
        ValueError: For any invalid validation or unknown violations/states.
    """
    if not violation or not isinstance(violation, str):
        logger.error("Violation parameter is empty or invalid.")
        raise ValueError("Violation must be a non-empty string.")
        
    if not isinstance(repeat_offense, bool):
        logger.error("repeat_offense must be a boolean value.")
        raise ValueError("repeat_offense must be a boolean.")

    # 1. Load the rules (validates state name and file existence)
    rules = load_fine_rules(state)
    
    # 2. Normalize the vehicle type (validates vehicle type)
    normalized_vehicle = normalize_vehicle_type(vehicle_type)
    
    # 3. Match the violation name case-insensitively or via fuzzy matching
    all_violations = list({r["violation"] for r in rules})
    query_violation = violation.strip().lower()
    
    # Check exact case-insensitive match first
    matched_violation = None
    for v in all_violations:
        if v.lower() == query_violation:
            matched_violation = v
            break
            
    # Try fuzzy matching using difflib if no exact match is found
    if not matched_violation:
        v_map = {v.lower(): v for v in all_violations}
        close_matches = difflib.get_close_matches(query_violation, list(v_map.keys()), n=1, cutoff=0.6)
        if close_matches:
            matched_violation = v_map[close_matches[0]]
            logger.info(f"Fuzzy matched violation '{violation}' to '{matched_violation}'.")
            
    if not matched_violation:
        logger.error(f"Unknown violation requested: {violation}")
        raise ValueError(f"Unknown violation: '{violation}'.")
        
    # 4. Check if the violation applies to this vehicle type
    violation_rules = [r for r in rules if r["violation"] == matched_violation]
    
    matched_rule = None
    for r in violation_rules:
        rule_vt = r["vehicle_type"].lower()
        if rule_vt in ["all", "any"] or rule_vt == normalized_vehicle.lower():
            matched_rule = r
            break
            
    if not matched_rule:
        logger.error(f"Violation '{matched_violation}' is not applicable to vehicle type '{normalized_vehicle}'.")
        raise ValueError(f"Violation '{matched_violation}' is not applicable to vehicle type '{normalized_vehicle}'.")
        
    # 5. Extract fine and build response
    fine_amount = matched_rule["repeat_fine"] if repeat_offense else matched_rule["fine"]
    
    response = {
        "state": matched_rule["state"],
        "vehicle_type": normalized_vehicle,
        "violation": matched_rule["violation"],
        "law_section": matched_rule["law_section"],
        "fine": fine_amount,
        "repeat_offense": repeat_offense,
        "license_suspension": matched_rule["license_suspension"]
    }
    
    logger.info(f"Calculated fine of {fine_amount} for {matched_rule['violation']} (state: {state}, repeat: {repeat_offense}).")
    return response
