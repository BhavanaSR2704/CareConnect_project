/**
 * Tiptur Health Care Hub - ChatGPT-like Conversational Voice Assistant
 * - Glowing 3D-styled animated voice orb (Listening, Thinking, Speaking states).
 * - Full support for English and Kannada voice queries.
 * - SpeechRecognition (STT) + SpeechSynthesis (TTS).
 * - Secure Flask backend proxy to Gemini (Zero API keys in client).
 * - Contextual session memory and visual hospital cards while speaking.
 * - Basic offline voice command execution using local cache when internet is unavailable.
 */

(function () {
  'use strict';

  // Assistant State
  const state = {
    isOpen: false,
    mode: 'idle', // 'idle', 'listening', 'thinking', 'speaking'
    language: 'en-IN', // 'en-IN' or 'kn-IN'
    transcript: '',
    aiReply: '',
    history: [], // conversation context
    recognition: null,
    synthesis: window.speechSynthesis || null,
    isListening: false,
    visualizerActive: false,
    orbAnimationId: null,
    matchedHospitalCard: null
  };

  // Kannada & English Sample Suggestions
  const PROMPTS = {
    'en-IN': [
      '📍 "Find the nearest hospital"',
      '👁️ "Where is the best eye hospital?"',
      '🏥 "Show Government Hospital details"',
      '⚡ "Which hospital has 24x7 emergency?"',
      '📞 "Call Government Hospital emergency"'
    ],
    'kn-IN': [
      '📍 "ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆ ಯಾವುದು?"',
      '👁️ "ಕಣ್ಣಿನ ಆಸ್ಪತ್ರೆ ಎಲ್ಲಿದೆ?"',
      '🏥 "ಸರ್ಕಾರಿ ಆಸ್ಪತ್ರೆ ವಿವರಗಳನ್ನು ನೀಡಿ"',
      '⚡ "ತುರ್ತು ಚಿಕಿತ್ಸಾ ಆಸ್ಪತ್ರೆ ತಿಳಿಸಿ"',
      '📞 "ಸರ್ಕಾರಿ ಆಸ್ಪತ್ರೆಗೆ ಕರೆ ಮಾಡಿ"'
    ]
  };

  // Initialize Speech Recognition
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported in this browser.');
      return null;
    }

    const reco = new SpeechRecognition();
    reco.continuous = false;
    reco.interimResults = true;
    reco.lang = state.language;

    reco.onstart = () => {
      state.isListening = true;
      setOrbState('listening');
      updateStatusText(state.language === 'kn-IN' ? 'ಧ್ವನಿಯನ್ನು ಆಲಿಸಲಾಗುತ್ತಿದೆ... ಮಾತನಾಡಿ' : 'Listening... speak now');
    };

    reco.onresult = (event) => {
      let current = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        current += event.results[i][0].transcript;
      }
      state.transcript = current;
      const transcriptEl = document.getElementById('voiceTranscript');
      if (transcriptEl) {
        transcriptEl.innerText = `“${current}”`;
      }
    };

    reco.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      state.isListening = false;
      if (event.error === 'not-allowed') {
        updateStatusText('Microphone permission denied. Please allow microphone access.');
      } else {
        updateStatusText('Could not capture audio clearly. Tap microphone to try again.');
      }
      setOrbState('idle');
    };

    reco.onend = () => {
      state.isListening = false;
      if (state.transcript && state.transcript.trim().length > 0) {
        handleUserQuery(state.transcript.trim());
      } else {
        setOrbState('idle');
        updateStatusText(state.language === 'kn-IN' ? 'ಆಲಿಸಲು ಮೈಕ್ರೋಫೋನ್ ಒತ್ತಿ' : 'Tap the orb or mic to speak');
      }
    };

    return reco;
  }

  // Toggle voice recognition
  function toggleListening() {
    // If speaking, cancel speech and listen
    if (state.synthesis && state.synthesis.speaking) {
      state.synthesis.cancel();
    }

    if (state.isListening) {
      if (state.recognition) state.recognition.stop();
      return;
    }

    state.transcript = '';
    const transcriptEl = document.getElementById('voiceTranscript');
    if (transcriptEl) transcriptEl.innerText = '';
    state.matchedHospitalCard = null;
    renderMatchedCard(null);

    if (!state.recognition) {
      state.recognition = initSpeechRecognition();
    }

    if (!state.recognition) {
      alert('Speech Recognition is not supported by your browser. You can still type your questions in the voice dialog!');
      return;
    }

    state.recognition.lang = state.language;
    try {
      state.recognition.start();
    } catch (e) {
      console.warn('Recognition start exception:', e);
      state.recognition.stop();
      setTimeout(() => state.recognition.start(), 200);
    }
  }

  // Process User Query (Online via Flask Gemini API OR Offline Local Command Matcher)
  async function handleUserQuery(query) {
    setOrbState('thinking');
    updateStatusText(state.language === 'kn-IN' ? 'ಆಲೋಚಿಸಲಾಗುತ್ತಿದೆ...' : 'Thinking...');

    // 1. Check for Offline Mode or offline intent
    if (!navigator.onLine) {
      processOfflineVoiceQuery(query);
      return;
    }

    // 2. Online: Send query to Flask backend `/api/voice-assistant`
    try {
      const userLoc = window.tipturGps ? window.tipturGps.getState().userCoords : null;
      const region = window.tipturGps ? window.tipturGps.getState().activeRegion : 'tiptur';

      const response = await fetch('/api/voice-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          language: state.language,
          history: state.history.slice(-6), // keep context
          location: userLoc,
          region: region
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const reply = data.reply || "I couldn't process that medical query. Please try again.";
      
      // Update history context
      state.history.push({ role: 'user', content: query });
      state.history.push({ role: 'assistant', content: reply });

      // Action execution (e.g. request GPS, open directory, call)
      if (data.action === 'request_gps' && window.tipturGps) {
        window.tipturGps.retryGps();
      }

      // Display matched hospital card if returned
      if (data.matched_hospital) {
        state.matchedHospitalCard = data.matched_hospital;
        renderMatchedCard(data.matched_hospital);
      } else {
        renderMatchedCard(null);
      }

      speakResponse(reply);
    } catch (err) {
      console.warn('Online voice query failed, falling back to local offline logic:', err);
      processOfflineVoiceQuery(query, true);
    }
  }

  // Local Offline Voice Intent Engine
  function processOfflineVoiceQuery(query, fallbackFromNetwork = false) {
    const q = query.toLowerCase();
    const isKn = state.language === 'kn-IN';
    const computed = window.tipturGps ? window.tipturGps.getComputedHospitals() : [];
    let reply = '';
    let matchedHospital = null;

    if (q.includes('nearest') || q.includes('close') || q.includes('ಹತ್ತಿರ')) {
      const userCoords = window.tipturGps ? window.tipturGps.getState().userCoords : null;
      if (!userCoords) {
        reply = isKn
          ? "ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಯನ್ನು ತಿಳಿಯಲು ದಯವಿಟ್ಟು ಮೊದಲು ಜಿಪಿಎಸ್ ಸಕ್ರಿಯಗೊಳಿಸಿ."
          : "To calculate the nearest hospital, please enable your device GPS location.";
        if (window.tipturGps) window.tipturGps.retryGps();
      } else if (computed.length > 0) {
        const top = computed[0];
        matchedHospital = top;
        reply = isKn
          ? `ನಿಮ್ಮ ಸ್ಥಳಕ್ಕೆ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆ ${top.name}. ಇದು ಸುಮಾರು ${top.distanceKm.toFixed(1)} ಕಿಲೋಮೀಟರ್ ದೂರದಲ್ಲಿದೆ.`
          : `The nearest medical facility to your location is ${top.name}, located approximately ${top.distanceKm.toFixed(1)} kilometers away.`;
      }
    } else if (q.includes('eye') || q.includes('ಕಣ್ಣು') || q.includes('vision') || q.includes('nethra')) {
      const eyeHosp = computed.find((h) => h.id.includes('eye') || h.id.includes('nethralaya')) || computed[0];
      matchedHospital = eyeHosp;
      reply = isKn
        ? `ತಿಪಟೂರಿನಲ್ಲಿ ಸುನಂದಾ ಐ ಹಾಸ್ಪಿಟಲ್ ಮತ್ತು ಜ್ಯೋತಿ ನೇತ್ರಾಲಯ ಮುಖ್ಯ ಕಣ್ಣಿನ ಚಿಕಿತ್ಸಾ ಕೇಂದ್ರಗಳಾಗಿವೆ.`
        : `Sunanda Eye Hospital and Jyothi Nethralaya are the specialized eye care centers in Tiptur.`;
    } else if (q.includes('govt') || q.includes('government') || q.includes('ಸರ್ಕಾರಿ')) {
      const govt = computed.find((h) => h.id.includes('govt')) || computed[0];
      matchedHospital = govt;
      reply = isKn
        ? `ತಿಪಟೂರು ಸರ್ಕಾರಿ ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆ ಬಸ್ ನಿಲ್ದಾಣದ ಬಳಿ ಇದೆ. ತುರ್ತು ಚಿಕಿತ್ಸೆ ಲಭ್ಯವಿದೆ.`
        : `Government General Hospital is located near Tiptur Bus Stand. It provides 24x7 emergency and public healthcare.`;
    } else if (q.includes('emergency') || q.includes('ತುರ್ತು') || q.includes('icu')) {
      const emHosp = computed.find((h) => h.icu_available || (h.timings && h.timings.includes('24'))) || computed[0];
      matchedHospital = emHosp;
      reply = isKn
        ? `ತುರ್ತು ಸಂದರ್ಭದಲ್ಲಿ ಸರ್ಕಾರಿ ಆಸ್ಪತ್ರೆ ಅಥವಾ ಶೇಖರ್ ಆಸ್ಪತ್ರೆಗೆ ಭೇಟಿ ನೀಡಿ. ಆಂಬ್ಯುಲೆನ್ಸ್ ಗಾಗಿ 108 ಅಥವಾ 112 ಗೆ ಕರೆ ಮಾಡಿ.`
        : `For medical emergencies, Government Hospital and Shekhar Hospital provide immediate care. In severe emergencies call 108 or 112.`;
    } else if (q.includes('call') || q.includes('ಕರೆ')) {
      const first = computed[0];
      if (first && first.phones && first.phones[0]) {
        matchedHospital = first;
        reply = isKn
          ? `${first.name} ಗೆ ಕರೆ ಮಾಡಲಾಗುತ್ತಿದೆ. ಫೋನ್ ಸಂಖ್ಯೆ: ${first.phones[0]}.`
          : `Connecting to ${first.name} at ${first.phones[0]}.`;
        window.location.href = `tel:${first.phones[0]}`;
      } else {
        reply = isKn ? "ಆಸ್ಪತ್ರೆಗೆ ಕರೆ ಮಾಡಲು 112 ಅಥವಾ 108 ಗೆ ಡಯಲ್ ಮಾಡಿ." : "To contact emergency services, dial 112 or 108.";
      }
    } else {
      reply = isKn
        ? "ಸ್ಥಳೀಯ ಆಫ್‌ಲೈನ್ ಡೇಟಾಬೇಸ್ ಸಕ್ರಿಯವಾಗಿದೆ. ವಿವರವಾದ ಕ್ಲಿನಿಕಲ್ ಪ್ರಶ್ನೆಗಳಿಗೆ ದಯವಿಟ್ಟು ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕವನ್ನು ಪರಿಶೀಲಿಸಿ."
        : (fallbackFromNetwork
            ? "Operating in local offline mode. Here is information from the local Tiptur healthcare directory."
            : "Offline mode active. You can ask for nearest hospital, eye hospital, or Government hospital.");
      if (computed.length > 0) matchedHospital = computed[0];
    }

    if (matchedHospital) {
      state.matchedHospitalCard = matchedHospital;
      renderMatchedCard(matchedHospital);
    }

    speakResponse(reply);
  }

  // Text-To-Speech Output with Speaking State
  function speakResponse(text) {
    state.aiReply = text;
    setOrbState('speaking');
    updateStatusText(text);

    if (!state.synthesis) {
      setTimeout(() => setOrbState('idle'), 3000);
      return;
    }

    state.synthesis.cancel(); // Stop any pending utterance

    const cleanText = text.replace(/[*#_~`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = state.language;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick appropriate voice if available
    const voices = state.synthesis.getVoices();
    if (state.language === 'kn-IN') {
      const knVoice = voices.find((v) => v.lang.startsWith('kn') || v.name.includes('Kannada'));
      if (knVoice) utterance.voice = knVoice;
    } else {
      const inVoice = voices.find((v) => v.lang === 'en-IN' || v.name.includes('India'));
      if (inVoice) utterance.voice = inVoice;
    }

    utterance.onend = () => {
      setOrbState('idle');
      updateStatusText(state.language === 'kn-IN' ? 'ಆಲಿಸಲು ಮೈಕ್ರೋಫೋನ್ ಒತ್ತಿ' : 'Tap orb or mic to ask another question');
    };

    utterance.onerror = () => {
      setOrbState('idle');
    };

    state.synthesis.speak(utterance);
  }

  // Render Visual Hospital Card directly in the Voice modal
  function renderMatchedCard(hosp) {
    const cardEl = document.getElementById('voiceMatchedCard');
    if (!cardEl) return;

    if (!hosp) {
      cardEl.innerHTML = '';
      cardEl.style.display = 'none';
      return;
    }

    const phone = (hosp.phones && hosp.phones[0]) ? hosp.phones[0] : (hosp.emergency_phone || '112');
    const pageLink = hosp.region === 'gubbi'
      ? `<button onclick="window.tipturGps.openFacilityDetails('${hosp.id}')" class="btn-chip">View Details</button>`
      : `<a href="${hosp.page}" class="btn-chip">View Profile Page ➡</a>`;

    cardEl.innerHTML = `
      <div class="voice-hosp-box">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <h4 style="margin:0;color:#00c6ff;font-size:1.1rem;">${hosp.name}</h4>
          ${hosp.distanceKm !== undefined ? `<span style="background:rgba(0,198,255,0.2);padding:3px 8px;border-radius:12px;font-size:0.8rem;color:#7ee7ff;font-weight:bold;">📍 ${hosp.distanceKm.toFixed(1)} km</span>` : ''}
        </div>
        <p style="margin:6px 0;font-size:0.85rem;opacity:0.85;">${hosp.address}</p>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <a href="tel:${phone}" class="quick-call-btn" style="padding:6px 14px;font-size:0.9rem;">📞 Call ${phone}</a>
          ${pageLink}
        </div>
      </div>
    `;
    cardEl.style.display = 'block';
  }

  // Update Status Text in Voice Modal
  function updateStatusText(text) {
    const statusEl = document.getElementById('voiceStatusMessage');
    if (statusEl) {
      statusEl.innerHTML = text;
    }
  }

  // Set Orb State & Trigger Animation Styles
  function setOrbState(newMode) {
    state.mode = newMode;
    const orbContainer = document.getElementById('voiceOrbContainer');
    const badgeEl = document.getElementById('voiceStateBadge');
    if (orbContainer) {
      orbContainer.className = `voice-orb-wrapper mode-${newMode}`;
    }
    if (badgeEl) {
      if (newMode === 'listening') {
        badgeEl.innerHTML = '<span class="pulse-dot green"></span> Listening...';
      } else if (newMode === 'thinking') {
        badgeEl.innerHTML = '<span class="pulse-dot blue"></span> Consulting Medical Hub...';
      } else if (newMode === 'speaking') {
        badgeEl.innerHTML = '<span class="pulse-dot cyan"></span> Speaking';
      } else {
        badgeEl.innerHTML = '<span class="pulse-dot gray"></span> Ready';
      }
    }
  }

  // Animated Glowing Voice Orb Canvas Renderer
  function startOrbCanvasAnimation() {
    const canvas = document.getElementById('voiceOrbCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let angle = 0;

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      angle += 0.04;

      // Base radius varies by state
      let baseR = 55;
      let pulse = Math.sin(angle * 2) * 5;
      let glowColor = 'rgba(0, 198, 255, ';

      if (state.mode === 'listening') {
        baseR = 65;
        pulse = Math.sin(angle * 6) * 12;
        glowColor = 'rgba(0, 255, 170, '; // electric neon green-cyan
      } else if (state.mode === 'thinking') {
        baseR = 58;
        pulse = Math.sin(angle * 8) * 8;
        glowColor = 'rgba(0, 114, 255, '; // deep pulse blue
      } else if (state.mode === 'speaking') {
        baseR = 68;
        pulse = Math.abs(Math.sin(angle * 4)) * 16;
        glowColor = 'rgba(0, 212, 255, '; // vibrant cyan
      }

      const r = baseR + pulse;

      // 1. Outer Glow Aura
      const outerGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.6);
      outerGrad.addColorStop(0, glowColor + '0.45)');
      outerGrad.addColorStop(0.6, glowColor + '0.15)');
      outerGrad.addColorStop(1, glowColor + '0.0)');

      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // 2. Secondary orbiting particle rings for ChatGPT style
      for (let i = 0; i < 3; i++) {
        const ringAngle = angle * (i % 2 === 0 ? 1 : -1) + (i * Math.PI) / 3;
        const rx = cx + Math.cos(ringAngle) * (r * 0.7);
        const ry = cy + Math.sin(ringAngle) * (r * 0.7);
        ctx.beginPath();
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fillStyle = glowColor + '0.8)';
        ctx.fill();
      }

      // 3. Central Orb with smooth glass gradient
      const orbGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      orbGrad.addColorStop(0, '#ffffff');
      orbGrad.addColorStop(0.3, '#7ee7ff');
      orbGrad.addColorStop(0.7, '#0072ff');
      orbGrad.addColorStop(1, '#020c1b');

      ctx.save();
      ctx.shadowColor = glowColor + '0.9)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      state.orbAnimationId = requestAnimationFrame(draw);
    }

    if (state.orbAnimationId) cancelAnimationFrame(state.orbAnimationId);
    draw();
  }

  // Switch Assistant Language
  function setLanguage(lang) {
    state.language = lang;
    const btnEn = document.getElementById('langBtnEn');
    const btnKn = document.getElementById('langBtnKn');
    if (btnEn && btnKn) {
      btnEn.className = `lang-btn ${lang === 'en-IN' ? 'active' : ''}`;
      btnKn.className = `lang-btn ${lang === 'kn-IN' ? 'active' : ''}`;
    }

    if (state.recognition) {
      state.recognition.lang = lang;
    }

    renderSamplePrompts();
    updateStatusText(lang === 'kn-IN' ? 'ಕನ್ನಡ ಧ್ವನಿ ಸಹಾಯಕ ಸಿದ್ಧವಾಗಿದೆ. ಮಾತನಾಡಿ.' : 'English Voice Assistant ready. Tap orb to speak.');
  }

  // Render Sample Prompt Chips
  function renderSamplePrompts() {
    const listEl = document.getElementById('voicePromptChips');
    if (!listEl) return;
    const items = PROMPTS[state.language] || PROMPTS['en-IN'];
    listEl.innerHTML = items
      .map(
        (p) => `<button class="prompt-chip" onclick="window.Voice.sendCustomPrompt('${escapeQuotes(p.replace(/^[^\"]*\"([^\"]+)\".*$/, '$1'))}')">${escapeHtml(p)}</button>`
      )
      .join('');
  }

  // Open Modal Screen
  function openVoiceModal() {
    state.isOpen = true;
    const modal = document.getElementById('voiceAssistantModal');
    if (modal) {
      modal.style.display = 'flex';
      startOrbCanvasAnimation();
      renderSamplePrompts();
      updateStatusText(state.language === 'kn-IN' ? 'ಆಲಿಸಲು ಮೈಕ್ರೋಫೋನ್ ಒತ್ತಿ' : 'Tap the glowing orb or microphone to speak');
    }
  }

  // Close Modal Screen
  function closeVoiceModal() {
    state.isOpen = false;
    if (state.synthesis && state.synthesis.speaking) {
      state.synthesis.cancel();
    }
    if (state.recognition && state.isListening) {
      state.recognition.stop();
    }
    if (state.orbAnimationId) {
      cancelAnimationFrame(state.orbAnimationId);
    }
    const modal = document.getElementById('voiceAssistantModal');
    if (modal) modal.style.display = 'none';
  }

  // Send typed query from voice input field
  function sendTypedQuery() {
    const input = document.getElementById('voiceTextInput');
    if (!input || !input.value.trim()) return;
    const q = input.value.trim();
    input.value = '';
    const transcriptEl = document.getElementById('voiceTranscript');
    if (transcriptEl) transcriptEl.innerText = `“${q}”`;
    handleUserQuery(q);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeQuotes(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'");
  }

  // Expose global methods
  window.Voice = {
    open: openVoiceModal,
    close: closeVoiceModal,
    toggleListening,
    setLanguage,
    sendTypedQuery,
    sendCustomPrompt: (promptText) => {
      const transcriptEl = document.getElementById('voiceTranscript');
      if (transcriptEl) transcriptEl.innerText = `“${promptText}”`;
      handleUserQuery(promptText);
    }
  };

  // Pre-load voices on browser load
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
})();
