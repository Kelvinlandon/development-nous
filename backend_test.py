#!/usr/bin/env python3
"""
SafetyPaws Backend API Test Suite
Tests all backend functionality including SMTP email features
"""

import requests
import json
import base64
from datetime import datetime
import os
import sys

# Get backend URL from frontend .env
BACKEND_URL = "https://safetypaws-reports.preview.emergentagent.com/api"

def print_test_header(test_name):
    print(f"\n{'='*60}")
    print(f"🧪 {test_name}")
    print(f"{'='*60}")

def print_result(success, message, details=None):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if details:
        print(f"   Details: {details}")

def test_root_endpoint():
    """Test GET /api/ - Root endpoint should return version info"""
    print_test_header("Root Endpoint Test")
    try:
        response = requests.get(f"{BACKEND_URL}/", timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if "message" in data and "version" in data:
                print_result(True, f"Root endpoint working: {data}")
                return True
            else:
                print_result(False, "Root endpoint missing required fields", data)
                return False
        else:
            print_result(False, f"Root endpoint failed with status {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result(False, f"Root endpoint request failed: {str(e)}")
        return False

def test_settings_get():
    """Test GET /api/settings - Should return settings with smtp_host defaulting to smtp.gmail.com"""
    print_test_header("Settings GET Test")
    try:
        response = requests.get(f"{BACKEND_URL}/settings", timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ['smtp_host', 'smtp_port', 'smtp_enabled', 'default_recipient_email']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print_result(False, f"Settings missing fields: {missing_fields}", data)
                return False, data
            
            # Check default smtp_host
            if data.get('smtp_host') == 'smtp.gmail.com':
                print_result(True, f"Settings endpoint working with correct defaults")
                print(f"   SMTP Host: {data['smtp_host']}")
                print(f"   SMTP Port: {data['smtp_port']}")
                print(f"   SMTP Enabled: {data['smtp_enabled']}")
                return True, data
            else:
                print_result(False, f"SMTP host not set to gmail default: {data.get('smtp_host')}", data)
                return False, data
        else:
            print_result(False, f"Settings GET failed with status {response.status_code}", response.text)
            return False, None
    except Exception as e:
        print_result(False, f"Settings GET request failed: {str(e)}")
        return False, None

def test_settings_update():
    """Test PUT /api/settings - Update settings with SMTP config"""
    print_test_header("Settings UPDATE Test")
    try:
        # First get current settings
        get_response = requests.get(f"{BACKEND_URL}/settings", timeout=30)
        if get_response.status_code != 200:
            print_result(False, "Cannot get current settings for update test")
            return False
        
        # Update with test SMTP config
        update_data = {
            "smtp_enabled": True,
            "smtp_host": "smtp.gmail.com",
            "smtp_port": 587,
            "smtp_use_tls": True,
            "smtp_username": "test@gmail.com",
            "smtp_password": "test_password"
        }
        
        response = requests.put(
            f"{BACKEND_URL}/settings", 
            json=update_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify the update worked
            if (data.get('smtp_enabled') == True and 
                data.get('smtp_host') == 'smtp.gmail.com' and 
                data.get('smtp_port') == 587):
                print_result(True, "Settings update successful")
                print(f"   SMTP Enabled: {data['smtp_enabled']}")
                print(f"   SMTP Host: {data['smtp_host']}")
                print(f"   SMTP Port: {data['smtp_port']}")
                return True
            else:
                print_result(False, "Settings update didn't persist correctly", data)
                return False
        else:
            print_result(False, f"Settings UPDATE failed with status {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result(False, f"Settings UPDATE request failed: {str(e)}")
        return False

def test_create_report():
    """Test POST /api/reports - Create a test report"""
    print_test_header("Create Report Test")
    try:
        # Create test report data
        report_data = {
            "staff_members": "John Doe, Jane Smith",
            "date": "2026-02-01",
            "job_no_name": "TEST-001 - SafetyPaws Test Job",
            "site_arrival_time": "09:00",
            "site_departure_time": "17:00",
            "site_description": "Test construction site for API testing",
            "weather_conditions": "Clear and sunny",
            "contractor_responsible": "ABC Construction Ltd",
            "risks_hazards_incidents": "No incidents reported during testing",
            "toolbox_talk_required": False,
            "toolbox_talk_notes": "",
            "checklist_comments": "All safety checks completed successfully",
            "safety_checklist": [
                {"question": "Is PPE (hard hat, high-vis, boots) worn?", "answer": "yes", "notes": "All staff properly equipped"},
                {"question": "Are hazard zones clearly marked?", "answer": "yes", "notes": "Barriers and signs in place"},
                {"question": "Is first aid kit accessible?", "answer": "yes", "notes": "Located in site office"},
                {"question": "Are emergency procedures understood?", "answer": "yes", "notes": "Briefed during site induction"}
            ],
            "electrical_equipment_list": "Drill, angle grinder, extension leads",
            "staff_print_name": "John Doe",
            "signature_data": "John Doe (Digital Signature Test)",
            "signature_type": "typed",
            "declaration_date": "2026-02-01",
            "site_photos": []
        }
        
        response = requests.post(
            f"{BACKEND_URL}/reports",
            json=report_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if 'id' in data and data.get('job_no_name') == report_data['job_no_name']:
                print_result(True, f"Report created successfully with ID: {data['id']}")
                print(f"   Job: {data['job_no_name']}")
                print(f"   Staff: {data['staff_members']}")
                print(f"   Date: {data['date']}")
                print(f"   Checklist items: {len(data.get('safety_checklist', []))}")
                return True, data['id']
            else:
                print_result(False, "Report created but missing required fields", data)
                return False, None
        else:
            print_result(False, f"Report creation failed with status {response.status_code}", response.text)
            return False, None
    except Exception as e:
        print_result(False, f"Report creation request failed: {str(e)}")
        return False, None

def test_pdf_generation(report_id):
    """Test GET /api/reports/{id}/pdf - Verify PDF generation"""
    print_test_header("PDF Generation Test")
    try:
        response = requests.get(f"{BACKEND_URL}/reports/{report_id}/pdf", timeout=60)
        
        if response.status_code == 200:
            data = response.json()
            if 'pdf_base64' in data and 'filename' in data:
                # Verify it's valid base64
                try:
                    pdf_bytes = base64.b64decode(data['pdf_base64'])
                    if pdf_bytes.startswith(b'%PDF'):
                        print_result(True, f"PDF generated successfully: {data['filename']}")
                        print(f"   PDF size: {len(pdf_bytes)} bytes")
                        print(f"   Filename: {data['filename']}")
                        return True
                    else:
                        print_result(False, "PDF content doesn't appear to be valid PDF", "Missing PDF header")
                        return False
                except Exception as decode_error:
                    print_result(False, "PDF base64 decoding failed", str(decode_error))
                    return False
            else:
                print_result(False, "PDF response missing required fields", data)
                return False
        else:
            print_result(False, f"PDF generation failed with status {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result(False, f"PDF generation request failed: {str(e)}")
        return False

def test_email_send_mock(report_id):
    """Test POST /api/reports/{id}/email - Send email (should be mocked when SMTP disabled)"""
    print_test_header("Email Send Test (Mock)")
    try:
        # First ensure SMTP is disabled to trigger mock mode
        disable_smtp_data = {
            "smtp_enabled": False,
            "smtp_username": "",
            "smtp_password": ""
        }
        
        requests.put(
            f"{BACKEND_URL}/settings",
            json=disable_smtp_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        # Test default recipient (no recipient specified)
        email_data = {"report_id": report_id}
        
        response = requests.post(
            f"{BACKEND_URL}/reports/{report_id}/email",
            json=email_data,
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify response structure
            required_fields = ['success', 'message', 'mocked', 'recipient']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print_result(False, f"Email response missing fields: {missing_fields}", data)
                return False
            
            if data.get('success') == True and data.get('mocked') == True:
                print_result(True, f"Mock email sent successfully")
                print(f"   Recipient: {data['recipient']}")
                print(f"   Message: {data['message']}")
                print(f"   Mocked: {data['mocked']}")
                return True
            else:
                print_result(False, f"Expected mock email but got: success={data.get('success')}, mocked={data.get('mocked')}", data)
                return False
        else:
            print_result(False, f"Email sending failed with status {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result(False, f"Email sending request failed: {str(e)}")
        return False

def test_smtp_error_handling(report_id):
    """Test SMTP error handling with invalid credentials"""
    print_test_header("SMTP Error Handling Test")
    try:
        # Enable SMTP with invalid credentials to test error handling
        enable_smtp_data = {
            "smtp_enabled": True,
            "smtp_host": "smtp.gmail.com",
            "smtp_port": 587,
            "smtp_username": "invalid@example.com",
            "smtp_password": "invalid_password"
        }
        
        requests.put(
            f"{BACKEND_URL}/settings",
            json=enable_smtp_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        # Test email sending with invalid SMTP credentials
        email_data = {
            "report_id": report_id,
            "recipient_email": "test-recipient@example.com"
        }
        
        response = requests.post(
            f"{BACKEND_URL}/reports/{report_id}/email",
            json=email_data,
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        
        if response.status_code == 400:
            data = response.json()
            error_message = data.get('detail', '')
            
            if 'SMTP authentication failed' in error_message:
                print_result(True, f"SMTP error handling working correctly")
                print(f"   Error message: {error_message}")
                return True
            else:
                print_result(False, f"Wrong error message for SMTP failure", data)
                return False
        else:
            print_result(False, f"Expected 400 error but got {response.status_code}", response.text if response.status_code != 200 else response.json())
            return False
    except Exception as e:
        print_result(False, f"SMTP error handling test failed: {str(e)}")
        return False

def test_reports_list(expected_report_id):
    """Test GET /api/reports - List reports should include the new report"""
    print_test_header("Reports List Test")
    try:
        response = requests.get(f"{BACKEND_URL}/reports", timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            if isinstance(data, list):
                # Find our test report
                test_report = None
                for report in data:
                    if report.get('id') == expected_report_id:
                        test_report = report
                        break
                
                if test_report:
                    print_result(True, f"Reports list includes our test report")
                    print(f"   Total reports: {len(data)}")
                    print(f"   Test report ID: {test_report['id']}")
                    print(f"   Test report job: {test_report['job_no_name']}")
                    return True
                else:
                    print_result(False, f"Test report not found in list (ID: {expected_report_id})")
                    print(f"   Found {len(data)} reports")
                    return False
            else:
                print_result(False, "Reports list is not an array", data)
                return False
        else:
            print_result(False, f"Reports list failed with status {response.status_code}", response.text)
            return False
    except Exception as e:
        print_result(False, f"Reports list request failed: {str(e)}")
        return False

def run_all_tests():
    """Run all backend API tests"""
    print("🚀 Starting SafetyPaws Backend API Tests")
    print(f"Backend URL: {BACKEND_URL}")
    
    test_results = []
    report_id = None
    
    # Test 1: Root endpoint
    test_results.append(test_root_endpoint())
    
    # Test 2: Settings GET
    settings_success, settings_data = test_settings_get()
    test_results.append(settings_success)
    
    # Test 3: Settings UPDATE
    test_results.append(test_settings_update())
    
    # Test 4: Create report
    create_success, report_id = test_create_report()
    test_results.append(create_success)
    
    if report_id:
        # Test 5: PDF generation
        test_results.append(test_pdf_generation(report_id))
        
        # Test 6: Email sending (mock)
        test_results.append(test_email_send_mock(report_id))
        
        # Test 7: SMTP error handling
        test_results.append(test_smtp_error_handling(report_id))
        
        # Test 8: Reports list
        test_results.append(test_reports_list(report_id))
    else:
        print("\n⚠️  Skipping report-dependent tests (report creation failed)")
        test_results.extend([False] * 4)  # Add failures for skipped tests
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 TEST SUMMARY")
    print(f"{'='*60}")
    
    passed = sum(test_results)
    total = len(test_results)
    
    test_names = [
        "Root Endpoint",
        "Settings GET", 
        "Settings UPDATE",
        "Create Report",
        "PDF Generation",
        "Email Send (Mock)",
        "SMTP Error Handling", 
        "Reports List"
    ]
    
    for i, (name, result) in enumerate(zip(test_names, test_results)):
        status = "✅" if result else "❌"
        print(f"{status} {name}")
    
    success_rate = (passed / total) * 100
    print(f"\nOverall: {passed}/{total} tests passed ({success_rate:.1f}%)")
    
    if passed == total:
        print("🎉 All tests PASSED!")
    else:
        print("⚠️  Some tests FAILED - check details above")
    
    return test_results

if __name__ == "__main__":
    try:
        results = run_all_tests()
        sys.exit(0 if all(results) else 1)
    except KeyboardInterrupt:
        print("\n\n🛑 Testing interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n💥 Testing failed with error: {str(e)}")
        sys.exit(1)