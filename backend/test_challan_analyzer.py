import sys
import os
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from app.main import app
from app.services.challan_parser import parse_challan_details

def create_mock_challan_image(filename: str):
    """Generates a simple mock challan image using Pillow."""
    print(f"Generating mock challan image: {filename}")
    img = Image.new("RGB", (600, 250), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    
    # Write mock challan text blocks on the image
    d.text((20, 20), "MAHARASHTRA TRAFFIC POLICE DEPT", fill=(0, 0, 0))
    d.text((20, 50), "VEHICLE NO: MH 12 AB 1234", fill=(0, 0, 0))
    d.text((20, 80), "VIOLATION DETECTED: NO HELMET", fill=(0, 0, 0))
    d.text((20, 110), "CHALLAN FINE AMOUNT: RS 1000", fill=(0, 0, 0))
    d.text((20, 140), "DATE OF OFFENCE: 28-05-2026", fill=(0, 0, 0))
    d.text((20, 170), "LOCATION: NEAR KOTHRUD CHOWK", fill=(0, 0, 0))
    
    img.save(filename)
    print("Mock challan image created successfully.")

def test_heuristic_parser():
    print("\n--- Testing Heuristic Parser ---")
    mock_ocr_text = (
        "DELHI TRAFFIC POLICE E-CHALLAN\n"
        "CHALLAN NO: 987654321\n"
        "VEHICLE NO: DL-3C-AB-5678\n"
        "VIOLATION: OVER SPEEDING OVER LIMIT\n"
        "TOTAL PENALTY AMOUNT: INR 2000\n"
        "DATE: 25/05/2026\n"
        "LOCATION: AT OBLIGATORY ROAD JUNCTION NEAR METRO SECTOR 18"
    )
    
    result = parse_challan_details(mock_ocr_text)
    print(f"Parser output: {result}")
    
    assert result["vehicle_number"] == "DL 3C AB 5678", f"Got: {result['vehicle_number']}"
    assert result["violation"] == "Overspeeding", f"Got: {result['violation']}"
    assert result["fine_amount"] == "2000", f"Got: {result['fine_amount']}"
    assert "Delhi Traffic Police" in result["authority"], f"Got: {result['authority']}"
    assert result["date"] == "25/05/2026", f"Got: {result['date']}"
    assert "METRO SECTOR 18" in result["location"], f"Got: {result['location']}"
    print("PASS: Heuristic Parser test succeeded!")

def test_api_endpoint():
    print("\n--- Testing API Route /challan/analyze ---")
    client = TestClient(app)
    
    mock_filename = "temp_test_challan.png"
    create_mock_challan_image(mock_filename)
    
    try:
        with open(mock_filename, "rb") as f:
            response = client.post(
                "/challan/analyze",
                files={"file": (mock_filename, f, "image/png")}
            )
            
        print(f"API Response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got: {response.status_code}. Response: {response.text}"
        
        data = response.json()
        print(f"API Response JSON:\n{data}")
        
        # Verify JSON keys are present
        assert "vehicle_number" in data
        assert "violation" in data
        assert "fine_amount" in data
        assert "authority" in data
        assert "date" in data
        assert "location" in data
        assert "explanation" in data
        
        # Heuristics check (the exact text may depend on PaddleOCR recognition accuracy)
        # We assert that parsing output extracts the primary fields
        print("PASS: API endpoint test succeeded!")
        
    finally:
        # Cleanup mock image
        if os.path.exists(mock_filename):
            os.remove(mock_filename)
            print(f"Cleaned up local mock image: {mock_filename}")
            
    # Check that temp folder is empty
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "temp_uploads")
    if os.path.exists(temp_dir):
        files = os.listdir(temp_dir)
        print(f"Temporary uploads folder files: {files}")
        assert len(files) == 0, f"Expected temp folder to be empty, found: {files}"
        print("PASS: Temp folder cleanup verification succeeded!")

def run_tests():
    try:
        test_heuristic_parser()
        test_api_endpoint()
        print("\nAll Challan Analyzer validation tests passed successfully!")
        sys.exit(0)
    except Exception as e:
        print(f"\nTest failed! Reason: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
