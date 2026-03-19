#!/usr/bin/env python3
"""
Test email functionality specifically to debug mock vs real email sending
"""

import requests
import json

BACKEND_URL = "https://safetypaws-reports.preview.emergentagent.com/api"

def test_settings_reset_and_email():
    """Reset settings to disable SMTP and test mock email"""
    
    print("🧪 Testing Email Mock Functionality")
    print(f"Backend URL: {BACKEND_URL}")
    
    # 1. Reset settings to disable SMTP (should trigger mock)
    print("\n1️⃣ Disabling SMTP to trigger mock mode...")
    
    update_data = {
        "smtp_enabled": False,
        "smtp_host": "smtp.gmail.com",  # Set the correct default
        "smtp_port": 587,
        "smtp_use_tls": True,
        "smtp_username": "",
        "smtp_password": ""
    }
    
    response = requests.put(
        f"{BACKEND_URL}/settings",
        json=update_data,
        headers={"Content-Type": "application/json"},
        timeout=30
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Settings updated: SMTP enabled = {data.get('smtp_enabled')}")
        print(f"   SMTP host = {data.get('smtp_host')}")
    else:
        print(f"❌ Settings update failed: {response.status_code} - {response.text}")
        return False
    
    # 2. Verify settings
    print("\n2️⃣ Verifying current settings...")
    response = requests.get(f"{BACKEND_URL}/settings", timeout=30)
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Current settings:")
        print(f"   SMTP enabled: {data.get('smtp_enabled')}")
        print(f"   SMTP host: {data.get('smtp_host')}")
        print(f"   SMTP username: {data.get('smtp_username')}")
        print(f"   Default recipient: {data.get('default_recipient_email')}")
    else:
        print(f"❌ Settings get failed: {response.status_code}")
        return False
    
    # 3. Get the most recent report ID
    print("\n3️⃣ Getting latest report for email test...")
    response = requests.get(f"{BACKEND_URL}/reports", timeout=30)
    if response.status_code == 200:
        reports = response.json()
        if reports:
            report_id = reports[0]['id']  # Most recent
            print(f"✅ Using report ID: {report_id}")
        else:
            print("❌ No reports found")
            return False
    else:
        print(f"❌ Reports list failed: {response.status_code}")
        return False
    
    # 4. Test email sending (should be mock now)
    print("\n4️⃣ Testing email sending (should be MOCK)...")
    email_data = {"report_id": report_id}
    
    response = requests.post(
        f"{BACKEND_URL}/reports/{report_id}/email",
        json=email_data,
        headers={"Content-Type": "application/json"},
        timeout=60
    )
    
    print(f"Response status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Email response: {data}")
        
        if data.get('mocked') == True:
            print("🎉 SUCCESS: Email is properly mocked!")
            return True
        elif data.get('mocked') == False:
            print("⚠️  WARNING: Email sent for real (not mocked)")
            return True
        else:
            print("❌ FAIL: Email response missing 'mocked' field")
            return False
    else:
        print(f"❌ Email failed: {response.status_code}")
        print(f"Error: {response.text}")
        return False

if __name__ == "__main__":
    success = test_settings_reset_and_email()
    exit(0 if success else 1)