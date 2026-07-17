# AgriNova AI — Professional Agricultural Advisor

AgriNova AI is a highly performant, full-stack, voice-enabled agricultural assistant designed to support farmers by overcoming language, literacy, and technological barriers. By offering voice-first interactions and automated translation in regional languages (Tamil, Hindi, Telugu, Kannada, Malayalam, and English), it democratizes access to expert agronomic advice, pest diagnostics, and soil management.

---

## 1. Project Overview

AgriNova AI serves as an interactive, on-demand advisory panel for agricultural challenges. Smallholder and regional farmers frequently struggle with access to timely agronomic support, crop disease identification, and literacy-locked text interfaces. AgriNova AI resolves these challenges by providing a comprehensive portal where users can speak their queries naturally, upload photos of infected crops, and receive verbal, context-aware instructions in their native language. 

---

## 2. Technology Stack

AgriNova AI is built entirely on a lightweight, efficient, and robust Python stack combined with responsive front-end components:

*   **Runtime Environment:** Python 3.11+
*   **Web Framework:** Flask (v3.1+) with Blueprint-based modular routing
*   **Front-End Markup & Layout:** HTML5 & CSS3 with Tailwind CSS utility classes
*   **Front-End Interactivity:** Vanilla JavaScript (ES6+) and jQuery
*   **Icons & Visuals:** Bootstrap Icons
*   **Session Cache & Memory Store:** Redis (v5.2+) via `redis-py`
*   **File Upload Validation:** Werkzeug Secure File Utilities
*   **WSGI Production Server:** Gunicorn (v22.0+)

---

## 3. Core AI Models & Services

The application leverages the **Groq SDK** and external translation/speech APIs to perform high-speed, accurate inferencing:

*   **Primary Advisory Model (LLM):** `openai/gpt-oss-120b` (Handles expert reasoning regarding soil health, fertilizer ratios, crop rotation, and regional weather mitigation)
*   **Vision Advisory Model (VLM):** `meta-llama/llama-4-scout-17b-16e-instruct` (Analyzes user-uploaded plant and leaf photographs to detect visual crop damage, nutritional deficiencies, and pest infestations)
*   **Speech-to-Text (STT):** `whisper-large-v3-turbo` (Transcribes user spoken audio in both English and major South Asian languages with high phoneme accuracy)
*   **Text-to-Speech (TTS):**
    *   *Primary Multilingual Engine:* `gTTS` (Google Text-to-Speech) for high-fidelity, native pronunciation across regional Indian dialects.
    *   *Secondary English Engine:* `canopylabs/orpheus-v1-english` (Provides premium synthetic speech output as a fallback configuration).

---

## 4. Backend Architecture

The backend implements a decoupled, modular service-oriented architecture:

*   **Application Factory Pattern (`app/__init__.py`):** Dynamically configures the Flask instance, registers core blueprints, and configures cross-origin resource guidelines.
*   **Central Configuration Management (`app/config.py`):** Safely loads environment variables, API tokens, temporary upload directory paths, and fallback services through a structured environment class.
*   **Session-Persistent Memory Service (`app/services/memory_service.py`):** Interfaces with Redis to retrieve and serialize user-specific conversation histories. Redis ensures consistent context windows across stateless HTTP requests using time-to-live (TTL) bounds.
*   **Prompts Framework (`app/services/prompt_manager.py`):** Houses detailed agronomic directives that instruct models to formulate practical, actionable guidance, keeping responses safe, concise, and focused purely on farming.
*   **Service Layer Separation:** External API operations (Speech-to-Text, Text-to-Speech, and LLM inference) are completely isolated into independent files under `app/services/` to improve code maintainability and streamline unit testing.

---

## 5. Frontend Architecture

The user interface is designed as an inclusive, single-page dashboard optimized for farm-level conditions:

*   **Custom Select-Box Container:** Features a modern language select element allowing users to specify Tamil, Hindi, Telugu, Kannada, Malayalam, English, or "Auto Detect" language processing.
*   **Voice Interface Controllers:** Incorporates a streamlined recorder module that accesses the device microphone via the HTML5 MediaRecorder API, visualizes recording states, and handles streaming audio uploads.
*   **Direct Visual Diagnostics Upload:** Integrates file-selection handlers to upload leaf/crop photos directly to the server using standard multipart forms.
*   **Adaptive Light & Dark Modes:** Employs CSS custom properties to switch between eye-safe Dark Theme and High-Contrast Light Theme, enhancing outdoor display readability under direct sunlight.

---

## 6. Application Architecture

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
                                        │ External AI Provider  │
                                        │  - Groq API / Models  │
                                        │  - Google TTS API     │
                                        └───────────────────────┘
```

---

## 7. Project Folder Structure

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
│   │   ├── llm_service.py    # Groq SDK controller with cache optimization
│   │   ├── memory_service.py # Redis session conversation history
│   │   ├── prompt_manager.py # Agricultural system-prompt builders
│   │   ├── stt_service.py    # Voice transcription logic (Whisper)
│   │   └── tts_service.py    # Audio response synthesis (gTTS / Orpheus)
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css     # Dark/Light responsive UI styling
│   │   └── js/
│   │       └── chat.js       # Core frontend scripting & AJAX state handlers
│   └── templates/
│       └── index.html        # Main dashboard viewport template
├── uploads/                  # Temporary cache for leafy/crop disease images
├── gunicorn.conf.py          # Production configuration for Gunicorn server
├── requirements.txt          # Python package requirements
└── run.py                    # Production-ready runtime entrypoint
```

---

## 8. Key Features Implemented

*   **Intelligent Agricultural Advisory:** Expert advisory model outputs recommendations customized for fertilizer application, pest eradication, soil rehabilitation, and seasonal crop selection.
*   **Multilingual Voice Interface:** Voice-to-voice interaction cycle where farmers speak in their local languages and receive clear vocal readbacks of advisors' recommendations.
*   **Computer Vision Diagnostic Panel:** Users upload photographs of damaged foliage or roots for immediate inspection by the vision model, which details pathogen identification and remedy instructions.
*   **Conversational Memory Engine:** Seamless multi-turn dialog memory backed by Redis, allowing complex troubleshooting paths (e.g., following up on a pesticide question with specific dosage queries).
*   **Smart Auto-Detect Translation:** Automatic inference of spoken and written regional dialects, switching translation tracks without requiring manual language toggling.

---

## 9. Security & Performance

*   **Secure File Validation:** Leverages Werkzeug's `secure_filename` logic to filter user file inputs, sanitizing filenames to block potential directory traversal vectors during visual image uploads.
*   **Optimized Session Management:** Offloads heavy chat states to local Redis sessions. This ensures Flask worker processes remain stateless, highly responsive, and capable of horizontal scaling.
*   **Robust Audio Failover:** The Text-to-Speech microservice falls back gracefully to `gTTS` or alternative text synthesizers if Groq API capacity limits or terms approvals are hit, preventing platform voice blackouts.

---

## 10. Real-World Impact

*   **Overcoming the Literacy Barrier:** Spoken input and output modalities permit illiterate and semi-literate farmers to query complex agricultural databases directly, democratizing access to expert knowledge.
*   **Immediate Financial Savings:** Rapid pest and leaf disease identification reduces crop failures and prevents excessive or incorrect fertilizer purchases.
*   **Accessible Technical Guidance:** Connects rural smallholder farmers directly with high-grade agricultural practices, bypassing geographical barriers to agricultural extension offices.

---

## 11. Future Enhancements

*   **Geographical Weather & Soil API Integration:** Incorporating client-side GPS coordinates to query local soil classification maps and real-time localized weather forecasts automatically.
*   **Offline-First Cache System:** Adding browser Progressive Web App (PWA) sync queues, letting farmers capture images and voice recordings offline in remote fields and auto-submitting them when coverage returns.
*   **Local Market Price Aggregators:** Integrating real-time market data APIs to display local crop price forecasts, helping farmers maximize revenue.
