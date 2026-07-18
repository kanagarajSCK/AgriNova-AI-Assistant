# AgriNova AI — Professional Agricultural Advisor

AgriNova AI is a highly performant, full-stack, voice-enabled agricultural assistant designed to support farmers by overcoming language, literacy, and technological barriers. Developed by **Kanagaraj S**, AgriNova AI democratizes access to expert agronomic advice, pest diagnostics, and soil management by offering voice-first interactions and automated translation in regional Indian languages (Tamil, Hindi, Telugu, Kannada, Malayalam, and English).

---

## 1. Project Overview

Smallholder and regional farmers frequently struggle with access to timely agronomic support, crop disease identification, and literacy-locked text interfaces. AgriNova AI resolves these challenges by providing a comprehensive, inclusive portal where users can speak their queries naturally, upload photos of infected crops, and receive verbal, context-aware instructions in their native language.

---

## 2. Features

*   **Intelligent Agricultural Advisory:** Expert advisory model outputs recommendations customized for fertilizer application, pest eradication, soil rehabilitation, and seasonal crop selection.
*   **Multilingual Voice Interface:** Voice-to-voice interaction cycle where farmers speak in their local languages and receive clear vocal readbacks of advisors' recommendations.
*   **Computer Vision Diagnostic Panel:** Users upload photographs of damaged foliage or roots for immediate inspection by the vision model, which details pathogen identification and remedy instructions.
*   **Conversational Memory Engine:** Seamless multi-turn dialog memory backed by Redis, allowing complex troubleshooting paths (e.g., following up on a pesticide question with specific dosage queries).
*   **Smart Auto-Detect Translation:** Automatic inference of spoken and written regional dialects, switching translation tracks without requiring manual language toggling.
*   **Adaptive Light & Dark Modes:** Employs CSS custom properties to switch between eye-safe Dark Theme and High-Contrast Light Theme, enhancing outdoor display readability under direct sunlight.
*   **Progressive Web App (PWA) Support:** Includes a web app manifest for standalone mobile display and offline-ready assets.

---

## 3. AI Models and Technologies

The application leverages state-of-the-art AI models and services to perform high-speed, accurate inferencing:

*   **Primary Advisory Model (LLM):** `openai/gpt-oss-120b` via **Groq** (Handles expert reasoning regarding soil health, fertilizer ratios, crop rotation, and regional weather mitigation).
*   **Vision Advisory Model (VLM):** `gemini-2.5-flash` via **Google Gemini API** (Analyzes user-uploaded plant and leaf photographs to detect visual crop damage, nutritional deficiencies, and pest infestations).
    *   *Fallback Vision Model:* `qwen/qwen3.6-27b` via **Groq** (Used as a fallback vision model if the Gemini API is unavailable).
*   **Speech-to-Text (STT):** `whisper-large-v3-turbo` via **Groq Whisper Large V3 Turbo** (Transcribes user spoken audio in both English and major South Asian languages with high phoneme accuracy).
*   **Text-to-Speech (TTS):**
    *   *Primary Multilingual Engine:* `gTTS` (Google Text-to-Speech) for high-fidelity, native pronunciation across regional Indian dialects (Tamil, Hindi, Telugu, Kannada, Malayalam).
    *   *Secondary English Engine:* `canopylabs/orpheus-v1-english` (voice: `autumn`) via **Groq** (Provides premium synthetic speech output for English queries, falling back to `gTTS` if needed).

---

## 4. System Architecture

AgriNova AI implements a decoupled, modular service-oriented architecture:

### Interaction Flow

1. **Text Questions:**
   $$\text{User Query} \rightarrow \text{Groq API} \rightarrow \text{openai/gpt-oss-120b} \rightarrow \text{Agricultural Response}$$
2. **Image Upload + Question:**
   $$\text{Image + Query} \rightarrow \text{Google Gemini API} \rightarrow \text{gemini-2.5-flash} \rightarrow \text{Agricultural Image Analysis}$$
3. **Voice Input:**
   $$\text{Voice Audio} \rightarrow \text{Groq Whisper Large V3 Turbo} \rightarrow \text{AI Processing} \rightarrow \text{Text/Voice Response}$$

### Architecture Diagram

```
                       ┌─────────────────────────┐
                       │  Frontend (Web UI)      │
                       │  - jQuery / HTML5       │
                       │  - Audio Recorder       │
                       │  - Image Attachment     │
                       └────────────┬────────────┘
                                    │ HTTP Requests (POST / JSON / Multipart)
                                    ▼
                       ┌─────────────────────────┐
                       │     Flask Backend       │
                       │  - Blueprints (Routes)  │
                       │  - File Upload (Uploads)│
                       └─────┬─────────────┬─────┘
                             │             │
        ┌────────────────────┴──┐       ┌──┴────────────────────┐
        │   Redis Session Store │       │     Services Layer    │
        │  - Session Management │       │  - LLM Advisory       │
        │  - Conversation State │       │  - Speech-to-Text     │
        └───────────────────────┘       │  - Text-to-Speech     │
                                        └──────────┬────────────┘
                                                   │
                                                   ▼
                                        ┌───────────────────────┐
                                        │ External AI Providers │
                                        │  - Groq API           │
                                        │  - Google Gemini API  │
                                        │  - Google TTS (gTTS)  │
                                        └───────────────────────┘
```

---

## 5. Image Analysis Functionality

The production/development vision implementation uses the **Google Gemini API** with the **gemini-2.5-flash** model to analyze uploaded agricultural images. It provides a structured, professional diagnostic panel containing:

*   **Visible crop or object identification:** Accurate identification of the plant, leaf, or object in the image.
*   **Visible symptom observations:** Direct visual observations of damage, spots, pests, or discoloration.
*   **Possible diagnosis:** Specific disease, pest infestation, or nutritional deficiency identified.
*   **Possible causes:** Environmental, biological, or management factors that led to the issue.
*   **Recommended actions:** 2-3 specific, actionable remedies with product names, dosages, and application methods.
*   **Confidence level:** High, Medium, or Low based on visual evidence.

*Note: If the Gemini API fails, the system gracefully falls back to the `qwen/qwen3.6-27b` vision model on Groq.*

---

## 6. Voice Functionality

*   **Speech-to-Text (STT):** Spoken queries are captured via the HTML5 MediaRecorder API and transcribed using Groq's Whisper Large V3 Turbo model.
*   **Language Auto-Detection:** The system automatically detects the spoken language (Tamil, Hindi, Telugu, Kannada, Malayalam, or English) and processes the query accordingly.
*   **Text-to-Speech (TTS):**
    *   For regional Indian languages, the system uses `gTTS` to synthesize natural-sounding audio responses.
    *   For English, the system uses Groq's high-speed TTS API with the `canopylabs/orpheus-v1-english` model (voice: `autumn`) for premium synthetic speech.

---

## 7. Installation Instructions

### Prerequisites

*   Python 3.11+
*   Node.js (v18+) and npm/pnpm (optional, for running the Node.js wrapper)
*   Redis server (optional, falls back to in-memory storage if not running)

### Step-by-Step Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/kanagarajs/AgriNova-AI-Assistant.git
   cd AgriNova-AI-Assistant
   ```

2. **Create a Virtual Environment:**
   ```bash
   python -m venv venv
   # On Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   # On Linux/macOS:
   source venv/bin/activate
   ```

3. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Install Node.js Dependencies (Optional):**
   If you want to run the application using the Node.js wrapper:
   ```bash
   npm install
   ```

---

## 8. Required Python Packages

The application relies on the following core Python packages (defined in `requirements.txt`):

*   `flask>=3.1.3` — Web framework and routing
*   `python-dotenv>=1.0.1` — Environment variable management
*   `groq>=0.30.0` — Groq SDK for LLM, STT, and TTS
*   `redis>=5.2.0` — Redis client for session memory
*   `requests>=2.32.0` — HTTP client for Gemini API calls
*   `gTTS>=2.5.4` — Google Text-to-Speech library
*   `gunicorn>=22.0.0` — WSGI production server

---

## 9. Environment Variables

Create a `.env` file in the root directory of the project. Use the following template and replace the placeholders with your actual API keys and configurations:

```env
# Flask Configuration
FLASK_SECRET_KEY=your_flask_secret_key_here
FLASK_DEBUG=true

# AI Provider Keys
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# AI Models
LLM_MODEL=openai/gpt-oss-120b
LLM_VISION_MODEL=gemini-2.5-flash
STT_MODEL=whisper-large-v3-turbo
STT_PROVIDER=groq

# Text-to-Speech Configuration
TTS_PROVIDER=gtts
TTS_MODEL=canopylabs/orpheus-v1-english
VOICE=autumn

# Redis Configuration (Optional - falls back to in-memory if not configured)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_SSL=false
REDIS_SESSION_TTL=3600

# Logging
LOG_LEVEL=INFO
```

---

## 10. Running the Application Locally

### Option 1: Run directly with Python (Recommended)

1. Ensure your virtual environment is active and `.env` is configured.
2. Start the Flask application:
   ```bash
   python run.py
   ```
3. Open your browser and navigate to `http://localhost:5000`.

### Option 2: Run via Node.js Wrapper

1. Start the application using npm:
   ```bash
   npm run dev
   ```
2. Open your browser and navigate to `http://localhost:3000` (or the port specified in your terminal).

---

## 11. Project Structure

```
/
├── app/
│   ├── __init__.py           # Flask app factory initialization
│   ├── config.py             # Central application configuration
│   ├── routes/
│   │   ├── chat.py           # Chat blueprint API routes (send, history, uploads)
│   │   └── main.py           # Main routes (index page, favicon, sitemap)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── llm_service.py    # Groq & Gemini SDK controller with cache optimization
│   │   ├── memory_service.py # Redis session conversation history with in-memory fallback
│   │   ├── prompt_manager.py # Agricultural system-prompt builders
│   │   ├── stt_service.py    # Voice transcription logic (Whisper)
│   │   └── tts_service.py    # Audio response synthesis (gTTS / Orpheus)
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css     # Dark/Light responsive UI styling
│   │   ├── js/
│   │   │   └── chat.js       # Core frontend scripting & AJAX state handlers
│   │   └── manifest.webmanifest # PWA configuration
│   └── templates/
│       └── index.html        # Main dashboard viewport template
├── uploads/                  # Temporary cache for leafy/crop disease images
├── gunicorn.conf.py          # Production configuration for Gunicorn server
├── requirements.txt          # Python package requirements
├── package.json              # Node.js dependencies and scripts
├── server.ts                 # Node.js wrapper to spawn Python backend
└── run.py                    # Production-ready runtime entrypoint
```

---

## 12. API/Provider Information

*   **Groq API:** Powers the primary text advisory model (`openai/gpt-oss-120b`), speech-to-text transcription (`whisper-large-v3-turbo`), and English text-to-speech synthesis (`canopylabs/orpheus-v1-english`).
*   **Google Gemini API:** Powers the production/development vision model (`gemini-2.5-flash`) for multimodal agricultural image analysis.
*   **Google TTS (gTTS):** Powers the multilingual speech synthesis engine for regional Indian languages.

---

## 13. Security Notes

*   **API Key Protection:** Never commit your `.env` file or expose your real API keys in public repositories. The `.env` file is explicitly excluded from Git via `.gitignore`.
*   **Input Sanitization:** The application uses Werkzeug's `secure_filename` to sanitize uploaded file names, preventing directory traversal attacks.
*   **Stateless Sessions:** Session data is securely managed using Redis or local in-memory fallback, ensuring no sensitive data is exposed in client-side cookies.

---

## 14. Deployment Instructions

The application is configured for easy deployment on **Render** or any other cloud platform supporting Python/Gunicorn or Node.js.

### Deploying on Render

1. **Create a Web Service:** Connect your GitHub repository to Render.
2. **Environment:** Select **Python** or **Node** (if using the Node.js wrapper).
3. **Build Command:**
   - For Python: `pip install -r requirements.txt`
   - For Node: `npm install && npm run build`
4. **Start Command:**
   - For Python: `gunicorn run:app` (using the configuration in `gunicorn.conf.py`)
   - For Node: `npm start`
5. **Environment Variables:** Add all required environment variables (such as `GROQ_API_KEY`, `GEMINI_API_KEY`, `FLASK_SECRET_KEY`, etc.) in the Render dashboard.
