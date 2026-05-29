import sys
from fastapi.testclient import TestClient
from app.main import app

def run_api_tests():
    print("Starting API route validation tests...\n")
    client = TestClient(app)
    tests_passed = 0
    tests_failed = 0

    # Test 1: POST /fine/calculate success
    try:
        response = client.post(
            "/fine/calculate",
            json={
                "state": "Rajasthan",
                "vehicle_type": "Bike",
                "violation": "No Helmet",
                "repeat_offense": False
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["state"] == "Rajasthan"
        assert data["vehicle_type"] == "Bike"
        assert data["violation"] == "No Helmet"
        assert data["fine"] == 1000
        assert data["repeat_offense"] is False
        assert data["license_suspension"] == "3 months"
        assert data["law_section"] == "129/194(D)"
        print("PASS: Test 1 (API calculate fine success)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 1. Reason: {e}")
        tests_failed += 1

    # Test 2: Repeat offense
    try:
        response = client.post(
            "/fine/calculate",
            json={
                "state": "Rajasthan",
                "vehicle_type": "Bike",
                "violation": "No Helmet",
                "repeat_offense": True
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["fine"] == 2000
        assert data["repeat_offense"] is True
        print("PASS: Test 2 (API repeat fine success)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 2. Reason: {e}")
        tests_failed += 1

    # Test 3: Fuzzy matching & Normalization
    try:
        response = client.post(
            "/fine/calculate",
            json={
                "state": "rajasthan",
                "vehicle_type": "motorcycle",
                "violation": "helmet",
                "repeat_offense": False
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["vehicle_type"] == "Bike"
        assert data["violation"] == "No Helmet"
        print("PASS: Test 3 (API fuzzy matching and normalization)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 3. Reason: {e}")
        tests_failed += 1

    # Test 4: Unsupported state
    try:
        response = client.post(
            "/fine/calculate",
            json={
                "state": "Gujarat",
                "vehicle_type": "Bike",
                "violation": "No Helmet",
                "repeat_offense": False
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "not supported" in data["detail"]
        print("PASS: Test 4 (API handles unsupported state with 400)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 4. Reason: {e}")
        tests_failed += 1

    # Test 5: Unknown violation
    try:
        response = client.post(
            "/fine/calculate",
            json={
                "state": "Rajasthan",
                "vehicle_type": "Bike",
                "violation": "Speeding excessively",
                "repeat_offense": False
            }
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "Unknown violation" in data["detail"]
        print("PASS: Test 5 (API handles unknown violation with 404)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 5. Reason: {e}")
        tests_failed += 1

    # Test 6: Invalid vehicle type
    try:
        response = client.post(
            "/fine/calculate",
            json={
                "state": "Rajasthan",
                "vehicle_type": "aeroplane",
                "violation": "No Helmet",
                "repeat_offense": False
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "invalid" in data["detail"]
        print("PASS: Test 6 (API handles invalid vehicle type with 400)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 6. Reason: {e}")
        tests_failed += 1

    # Test 7: Empty field validation (Pydantic validation)
    try:
        response = client.post(
            "/fine/calculate",
            json={
                "state": "",
                "vehicle_type": "Bike",
                "violation": "No Helmet",
                "repeat_offense": False
            }
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("PASS: Test 7 (API Pydantic validation for empty state fails with 422)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 7. Reason: {e}")
        tests_failed += 1

    print(f"\nAPI Tests execution finished: {tests_passed} passed, {tests_failed} failed.")
    if tests_failed > 0:
        sys.exit(1)
    else:
        print("All API route tests passed successfully!")
        sys.exit(0)

if __name__ == "__main__":
    run_api_tests()
