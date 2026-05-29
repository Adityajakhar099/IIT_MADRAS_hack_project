import sys
from app.services.fine_engine import calculate_fine

def run_tests():
    print("Starting Fine Engine validation tests...\n")
    tests_passed = 0
    tests_failed = 0

    # Test 1: Basic matching
    try:
        res = calculate_fine("Rajasthan", "Bike", "No Helmet", False)
        assert res["fine"] == 1000
        assert res["repeat_offense"] is False
        assert res["license_suspension"] == "3 months"
        assert res["law_section"] == "129/194(D)"
        print("PASS: Test 1 (Basic fine calculation for Rajasthan Bike No Helmet)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 1. Reason: {e}")
        tests_failed += 1

    # Test 2: Repeat offense
    try:
        res = calculate_fine("Rajasthan", "Bike", "No Helmet", True)
        assert res["fine"] == 2000
        assert res["repeat_offense"] is True
        print("PASS: Test 2 (Repeat fine calculation for Rajasthan Bike No Helmet)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 2. Reason: {e}")
        tests_failed += 1

    # Test 3: Normalization of vehicle type
    try:
        res = calculate_fine("Rajasthan", "motorcycle", "No Helmet", False)
        assert res["vehicle_type"] == "Bike"
        print("PASS: Test 3 (Vehicle type normalization: motorcycle -> Bike)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 3. Reason: {e}")
        tests_failed += 1

    # Test 4: Case insensitivity
    try:
        res = calculate_fine("rajasthan", "bike", "no helmet", False)
        assert res["state"] == "Rajasthan"
        assert res["violation"] == "No Helmet"
        print("PASS: Test 4 (Case-insensitve match for state, vehicle and violation)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 4. Reason: {e}")
        tests_failed += 1

    # Test 5: Fuzzy matching for violations
    try:
        res = calculate_fine("Rajasthan", "Bike", "helmet", False)
        assert res["violation"] == "No Helmet"
        print("PASS: Test 5 (Fuzzy match: 'helmet' -> 'No Helmet')")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 5. Reason: {e}")
        tests_failed += 1

    # Test 6: Another fuzzy matching test
    try:
        res = calculate_fine("Rajasthan", "Car", "seatbelt", False)
        assert res["violation"] == "No Seatbelt"
        print("PASS: Test 6 (Fuzzy match: 'seatbelt' -> 'No Seatbelt')")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 6. Reason: {e}")
        tests_failed += 1

    # Test 7: State verification (Maharashtra)
    try:
        res = calculate_fine("Maharashtra", "Car", "No Seatbelt", False)
        assert res["state"] == "Maharashtra"
        assert res["fine"] == 1000
        print("PASS: Test 7 (Maharashtra state rules load and calculation)")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 7. Reason: {e}")
        tests_failed += 1

    # Test 8: Invalid state error handling
    try:
        calculate_fine("Gujarat", "Bike", "No Helmet", False)
        print("FAIL: Test 8 (Expected ValueError for unsupported state, but succeeded)")
        tests_failed += 1
    except ValueError as e:
        assert "not supported" in str(e)
        print(f"PASS: Test 8 (Expected exception for unsupported state: '{e}')")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 8. Unexpected exception: {e}")
        tests_failed += 1

    # Test 9: Unknown violation error handling
    try:
        calculate_fine("Rajasthan", "Bike", "Flying too low", False)
        print("FAIL: Test 9 (Expected ValueError for unknown violation, but succeeded)")
        tests_failed += 1
    except ValueError as e:
        assert "Unknown violation" in str(e)
        print(f"PASS: Test 9 (Expected exception for unknown violation: '{e}')")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 9. Unexpected exception: {e}")
        tests_failed += 1

    # Test 10: Vehicle applicability mismatch error handling
    try:
        calculate_fine("Rajasthan", "Car", "No Helmet", False)
        print("FAIL: Test 10 (Expected ValueError for mismatch, but succeeded)")
        tests_failed += 1
    except ValueError as e:
        assert "not applicable to vehicle type" in str(e)
        print(f"PASS: Test 10 (Expected exception for vehicle/violation mismatch: '{e}')")
        tests_passed += 1
    except Exception as e:
        print(f"FAIL: Test 10. Unexpected exception: {e}")
        tests_failed += 1

    print(f"\nTests execution finished: {tests_passed} passed, {tests_failed} failed.")
    if tests_failed > 0:
        sys.exit(1)
    else:
        print("All engine logic tests passed successfully!")
        sys.exit(0)

if __name__ == "__main__":
    run_tests()
