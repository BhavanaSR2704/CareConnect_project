# Tiptur Health Care Hub (Enhanced Edition)

A full-stack Flask healthcare directory for Tiptur and Gubbi, upgraded with an **Offline GPS-based Nearby Hospital Finder**, an **AI Conversational Voice Assistant (ChatGPT Voice style)**, and **Hackathon Demo Mode**.

Existing hospital pages, routes, database tables, and dark glassmorphic styling have been 100% preserved.

---

## 🚀 Key Features

### 1. Offline GPS-Based Nearby Hospital Finder
- **Real Device GPS:** Accurately reads user latitude/longitude via browser Geolocation API.
- **Pure Offline Distance Engine:** Computes real-time distances to all 19 Tiptur facilities using client-side **Haversine formula math**—0 network requests required.
- **Nearest-First Sorting:** Instantly sorts hospitals from closest to farthest, with direct `tel:` dialing buttons and nearest-facility badges.
- **Offline Proximity Radar Map:** Interactive SVG cardinal radar showing relative hospital positions even without Google Maps connection.
- **PWA Service Worker:** Caches application shell, CSS, JavaScript, and hospital database for seamless dead-zone availability.

### 2. Conversational Voice Assistant (ChatGPT-Like Voice)
- **Animated Glowing Voice Orb:** Full-screen modal with multi-state particle orb (Listening, Thinking, Speaking).
- **Bilingual Interaction:** Supports **English** (`en-IN`) and **Kannada** (`kn-IN`).
- **Secure Server-Side AI:** Flask backend connects to Gemini (`gemini-3.8-flash` with resilient fallback) with zero API keys exposed in frontend code.
- **Visual Card Overlays:** Displays hospital information and instant call buttons while speaking the response.
- **Offline Voice Intent Fallback:** Answers essential emergency commands locally from cache when internet is down.

### 3. Hackathon Demo Mode
- Allows toggling between:
  1. **Actual Device GPS Location** (live coordinates & accuracy)
  2. **Tiptur Town Centre (Demo Mode)**
  3. **Gubbi Town Centre (Hackathon Mode)**
- Includes a separate verified Gubbi hospital dataset (Gubbi Taluk Hospital, PHC Gubbi, Sri Siddhartha Rural Clinic).
- Live Online/Offline status indicator badge.

---

## 💻 Run in VS Code (Windows / Mac / Linux)

1. Open this folder in VS Code.
2. Open Terminal (`Ctrl + ~` or Terminal → New Terminal).
3. Create and activate a virtual environment:
   ```bash
   # Windows PowerShell
   py -m venv .venv
   .venv\Scripts\Activate.ps1

   # Linux / macOS
   python3 -m venv .venv
   source .venv/bin/activate
   ```
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Set your optional Gemini API Key in your environment (for advanced AI conversation):
   ```bash
   # Windows PowerShell
   $env:GEMINI_API_KEY="your_api_key_here"

   # Linux / macOS
   export GEMINI_API_KEY="your_api_key_here"
   ```
6. Start the website:
   ```bash
   python app.py
   ```
7. Open **http://127.0.0.1:5000** in your browser.
8. Register an account, log in, and explore the dashboard!

---

## 🛡️ Medical Disclaimer
This platform is an informational directory for Tiptur and surrounding taluks. In life-threatening emergencies, immediately dial **112** (National Emergency) or **108** (Ambulance).
