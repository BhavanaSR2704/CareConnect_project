/**
 * Tiptur Health Care Hub - Offline GPS Proximity Engine & Hackathon Demo Mode
 * - Haversine distance calculations computed 100% offline in client browser.
 * - Strict separation between real GPS location and manual demo locations.
 * - Support for Hackathon Demo Mode with separate verified Gubbi hospital dataset.
 * - Real-time online/offline connection monitoring.
 */

(function () {
  'use strict';

  // Constants for Coordinates
  const TIPTUR_DEMO_COORDS = { lat: 13.2584, lng: 76.4770, label: 'Tiptur Town Centre (Demo)' };
  const GUBBI_DEMO_COORDS = { lat: 13.3117, lng: 76.9405, label: 'Gubbi Town Centre (Hackathon Demo)' };

  // App State
  const state = {
    locationMode: 'gps', // 'gps', 'tiptur_demo', 'gubbi_demo'
    userCoords: null, // { lat, lng, accuracy, isRealGps: boolean }
    gpsError: null,
    isOnline: navigator.onLine,
    activeRegion: 'tiptur', // 'tiptur' or 'gubbi'
    hospitalData: null,
    searchQuery: '',
    emergencyFilter: false,
    icuFilter: false,
    selectedHospital: null
  };

  // Mathematical Haversine Distance Calculation (pure math, zero internet required)
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  // Formatting distance nicely
  function formatDistance(km) {
    if (km < 1) {
      return `${Math.round(km * 1000)} m away`;
    }
    return `${km.toFixed(2)} km away`;
  }

  // Load hospitals dataset from local cache / static file / fallback
  async function loadHospitals() {
    try {
      const response = await fetch('/static/data/hospitals.json');
      if (response.ok) {
        state.hospitalData = await response.json();
        try {
          localStorage.setItem('tiptur_cached_hospitals', JSON.stringify(state.hospitalData));
        } catch (e) {}
        return;
      }
    } catch (e) {
      console.warn('Network fetch failed, attempting localStorage cache...', e);
    }

    // Try localStorage if offline
    try {
      const cached = localStorage.getItem('tiptur_cached_hospitals');
      if (cached) {
        state.hospitalData = JSON.parse(cached);
        return;
      }
    } catch (e) {}

    // Fallback embedded if entirely offline first-time
    state.hospitalData = getFallbackHospitalData();
  }

  // Request actual GPS location
  function requestGpsLocation(callback) {
    state.gpsError = null;
    updateStatusUI();

    if (!navigator.geolocation) {
      state.gpsError = 'Geolocation is not supported by your browser.';
      updateStatusUI();
      if (callback) callback(false);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.userCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          isRealGps: true,
          label: `Live GPS: ${position.coords.latitude.toFixed(4)}° N, ${position.coords.longitude.toFixed(4)}° E (±${Math.round(position.coords.accuracy)}m)`
        };
        state.locationMode = 'gps';
        state.activeRegion = 'tiptur';
        state.gpsError = null;
        updateStatusUI();
        renderHospitalCards();
        if (callback) callback(true);
      },
      (error) => {
        let msg = 'Could not acquire GPS position.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'GPS permission was denied in your browser settings. Please enable location access or select a demo location below.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'GPS signal is currently unavailable on your device. Please try outdoors or select a demo location below.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'GPS request timed out. Please retry or select a demo location below.';
        }
        state.gpsError = msg;
        // NEVER treat Tiptur coordinates as user's real location when GPS fails
        state.userCoords = null;
        updateStatusUI();
        renderHospitalCards();
        if (callback) callback(false);
      },
      options
    );
  }

  // Set manual Demo location (Tiptur or Gubbi)
  function setDemoLocation(mode) {
    state.gpsError = null;
    if (mode === 'tiptur_demo') {
      state.locationMode = 'tiptur_demo';
      state.activeRegion = 'tiptur';
      state.userCoords = {
        lat: TIPTUR_DEMO_COORDS.lat,
        lng: TIPTUR_DEMO_COORDS.lng,
        accuracy: null,
        isRealGps: false,
        label: 'Demo Location: Tiptur Town Centre'
      };
    } else if (mode === 'gubbi_demo') {
      state.locationMode = 'gubbi_demo';
      state.activeRegion = 'gubbi'; // Strictly show Gubbi dataset
      state.userCoords = {
        lat: GUBBI_DEMO_COORDS.lat,
        lng: GUBBI_DEMO_COORDS.lng,
        accuracy: null,
        isRealGps: false,
        label: 'Hackathon Demo Location: Gubbi Town Centre'
      };
    }
    updateStatusUI();
    renderHospitalCards();
  }

  // Render the location and online status banner
  function updateStatusUI() {
    const statusContainer = document.getElementById('hubStatusBanner');
    if (!statusContainer) return;

    let onlineBadge = state.isOnline
      ? `<span class="badge online" title="Connected to network">🟢 Online</span>`
      : `<span class="badge offline" title="Working completely from local device storage">🟠 Offline (Local Cache Active)</span>`;

    let locationBadge = '';
    if (state.gpsError) {
      locationBadge = `
        <div class="loc-warning">
          <strong>⚠️ Location Notice:</strong> ${state.gpsError}
          <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-chip" onclick="window.tipturGps.retryGps()">🔄 Retry GPS</button>
            <button class="btn-chip" onclick="window.tipturGps.selectDemo('tiptur_demo')">📍 Use Tiptur Demo</button>
            <button class="btn-chip" onclick="window.tipturGps.selectDemo('gubbi_demo')">📍 Use Gubbi Demo</button>
          </div>
        </div>
      `;
    } else if (state.userCoords) {
      if (state.userCoords.isRealGps) {
        locationBadge = `
          <div class="loc-success">
            <span>🛰️ <strong>Actual Device GPS:</strong> ${state.userCoords.label}</span>
          </div>
        `;
      } else {
        locationBadge = `
          <div class="loc-demo">
            <span>🎯 <strong>Manually Selected Demo Mode:</strong> ${state.userCoords.label} (Not your actual GPS)</span>
          </div>
        `;
      }
    } else {
      locationBadge = `
        <div class="loc-neutral">
          <span>📍 <strong>Location Status:</strong> Click "Detect My Real GPS" or select a demo location to calculate proximity.</span>
        </div>
      `;
    }

    statusContainer.innerHTML = `
      <div class="status-row">
        <div class="status-left">
          ${onlineBadge}
          <span class="region-badge">Region: <strong>${state.activeRegion === 'gubbi' ? 'Gubbi (Hackathon Mode)' : 'Tiptur'}</strong></span>
        </div>
        <div class="location-controls">
          <button id="btnRealGps" class="loc-btn ${state.locationMode === 'gps' && state.userCoords ? 'active' : ''}" onclick="window.tipturGps.retryGps()">
            🛰️ Use Real GPS
          </button>
          <button class="loc-btn ${state.locationMode === 'tiptur_demo' ? 'active' : ''}" onclick="window.tipturGps.selectDemo('tiptur_demo')">
            📍 Tiptur Demo
          </button>
          <button class="loc-btn ${state.locationMode === 'gubbi_demo' ? 'active' : ''}" onclick="window.tipturGps.selectDemo('gubbi_demo')">
            🏆 Gubbi Demo
          </button>
        </div>
      </div>
      ${locationBadge}
    `;
  }

  // Compute distances, filter and sort hospitals
  function getComputedHospitals() {
    if (!state.hospitalData) return [];

    // Strictly separate Gubbi and Tiptur datasets
    let list = [];
    if (state.activeRegion === 'gubbi') {
      list = (state.hospitalData.gubbi || []).map((h) => ({ ...h }));
    } else {
      list = (state.hospitalData.tiptur || []).map((h) => ({ ...h }));
    }

    // Calculate distance if userCoords available
    if (state.userCoords) {
      list.forEach((h) => {
        h.distanceKm = haversineDistance(state.userCoords.lat, state.userCoords.lng, h.lat, h.lng);
      });
      // Sort nearest to farthest
      list.sort((a, b) => a.distanceKm - b.distanceKm);
    }

    // Apply text search filter
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter((h) => {
        return (
          h.name.toLowerCase().includes(q) ||
          h.address.toLowerCase().includes(q) ||
          h.subtitle.toLowerCase().includes(q) ||
          (h.services && h.services.some((s) => s.toLowerCase().includes(q)))
        );
      });
    }

    // Apply Emergency / ICU filters if checked
    if (state.emergencyFilter) {
      list = list.filter((h) => (h.timings && h.timings.includes('24')) || (h.services && h.services.some((s) => s.includes('Emergency'))));
    }
    if (state.icuFilter) {
      list = list.filter((h) => h.icu_available);
    }

    return list;
  }

  // Render cards in dashboard grid
  function renderHospitalCards() {
    const grid = document.getElementById('hospitalGrid');
    if (!grid) return;

    const list = getComputedHospitals();

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px; background: rgba(255,255,255,0.03); border-radius: 12px;">
          <p style="font-size: 1.2rem; color: #00c6ff;">No facilities match your search filter.</p>
          <p style="opacity: 0.7;">Try clearing filters or switching between Tiptur and Gubbi regions.</p>
        </div>
      `;
      return;
    }

    let html = '';
    list.forEach((h, index) => {
      const distBadge = h.distanceKm !== undefined
        ? `<span class="distance-pill">📍 ${formatDistance(h.distanceKm)}</span>`
        : `<span class="distance-pill muted">Distance: Detect GPS</span>`;

      const emBadge = (h.timings && h.timings.includes('24'))
        ? `<span class="tag-badge em">24×7 Emergency</span>`
        : '';
      const icuBadge = h.icu_available
        ? `<span class="tag-badge icu">ICU Available</span>`
        : '';

      const phoneLink = (h.phones && h.phones[0])
        ? `<a href="tel:${h.phones[0]}" class="quick-call-btn">📞 Call ${h.phones[0]}</a>`
        : '';

      const verificationNotice = h.verification_note
        ? `<div class="verify-note">ℹ️ ${escapeHtml(h.verification_note)}</div>`
        : '';

      // Page link: for Tiptur hospitals it links to existing .html page; for Gubbi it opens modal
      const isGubbi = h.region === 'gubbi';
      const pageLink = isGubbi
        ? `<a href="javascript:void(0)" onclick="window.tipturGps.openFacilityDetails('${h.id}')" class="view-link">View Facility Profile ➡</a>`
        : `<a href="${h.page}" class="view-link">View Full Hospital Profile ➡</a>`;

      html += `
        <div class="card hospital-card ${index === 0 && h.distanceKm !== undefined ? 'nearest-card' : ''}">
          <div class="card-header">
            ${index === 0 && h.distanceKm !== undefined ? '<span class="nearest-ribbon">⭐ NEAREST FACILITY</span>' : ''}
            <h3>${pageLink.includes('href="javascript') ? `<a href="javascript:void(0)" onclick="window.tipturGps.openFacilityDetails('${h.id}')">${escapeHtml(h.name)}</a>` : `<a href="${h.page}">${escapeHtml(h.name)}</a>`}</h3>
            <p class="card-sub">${escapeHtml(h.subtitle)}</p>
          </div>
          <div class="card-meta">
            ${distBadge}
            ${emBadge}
            ${icuBadge}
          </div>
          <p class="card-addr"><strong>Address:</strong> ${escapeHtml(h.address)}</p>
          <p class="card-time"><strong>Timings:</strong> ${escapeHtml(h.timings || 'Check with facility')}</p>
          ${verificationNotice}
          <div class="card-actions">
            ${phoneLink}
            ${pageLink}
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;

    // Also update offline map radar
    renderOfflineRadar(list);
  }

  // Interactive Offline Map Radar (pure SVG, works 100% without internet or Google Maps)
  function renderOfflineRadar(hospitals) {
    const radarContainer = document.getElementById('offlineRadarContainer');
    if (!radarContainer) return;

    if (!state.userCoords) {
      radarContainer.innerHTML = `
        <div class="radar-box">
          <p style="text-align:center;padding:20px;color:rgba(255,255,255,0.7);">
            Enable GPS or select a Demo Location to view relative hospital proximity on the offline radar map.
          </p>
        </div>
      `;
      return;
    }

    const userLat = state.userCoords.lat;
    const userLng = state.userCoords.lng;

    // Filter top 6 nearest hospitals for clarity
    const nearList = hospitals.slice(0, 6);

    // SVG coordinate mapping relative to user center (150, 150) with 300x300 viewBox
    const scale = 22; // scale factor km -> pixels
    const maxR = 120; // max radius pixels

    let pinsSvg = '';
    nearList.forEach((h, i) => {
      const dLat = (h.lat - userLat) * 111; // ~111 km per lat degree
      const dLng = (h.lng - userLng) * (111 * Math.cos(userLat * Math.PI / 180));
      
      let px = 150 + dLng * scale;
      let py = 150 - dLat * scale;

      // Clamp inside radar boundary
      const distFromCenter = Math.sqrt((px - 150) ** 2 + (py - 150) ** 2);
      if (distFromCenter > maxR) {
        const ratio = maxR / distFromCenter;
        px = 150 + (px - 150) * ratio;
        py = 150 + (py - 150) * ratio;
      }

      pinsSvg += `
        <g class="radar-pin" data-name="${escapeHtml(h.name)}" style="cursor:pointer" onclick="window.tipturGps.openFacilityDetails('${h.id}')">
          <circle cx="${px}" cy="${py}" r="${i === 0 ? '7' : '5'}" fill="${i === 0 ? '#00ff88' : '#00c6ff'}" stroke="#ffffff" stroke-width="1.5" />
          <text x="${px + 8}" y="${py + 4}" fill="#ffffff" font-size="10" font-weight="bold">${i + 1}. ${escapeHtml(h.name.split(' ')[0])} (${(h.distanceKm || 0).toFixed(1)}k)</text>
        </g>
      `;
    });

    radarContainer.innerHTML = `
      <div class="radar-box">
        <div class="radar-header">
          <h4>📡 Offline Proximity Radar Map (No Internet Required)</h4>
          <span style="font-size:0.85rem;color:#00c6ff;">Relative positions from ${state.userCoords.isRealGps ? 'Your GPS' : 'Demo Center'}</span>
        </div>
        <div style="display:flex;justify-content:center;align-items:center;padding:10px 0;">
          <svg viewBox="0 0 300 300" width="300" height="300" style="background:rgba(2,12,27,0.85);border-radius:50%;border:2px solid rgba(0,198,255,0.4);box-shadow:0 0 20px rgba(0,198,255,0.2);">
            <!-- Concentric Range Rings -->
            <circle cx="150" cy="150" r="40" fill="none" stroke="rgba(0,198,255,0.15)" stroke-dasharray="3,3" />
            <circle cx="150" cy="150" r="80" fill="none" stroke="rgba(0,198,255,0.2)" stroke-dasharray="3,3" />
            <circle cx="150" cy="150" r="120" fill="none" stroke="rgba(0,198,255,0.3)" />
            <!-- Cardinal Lines -->
            <line x1="150" y1="20" x2="150" y2="280" stroke="rgba(0,198,255,0.2)" />
            <line x1="20" y1="150" x2="280" y2="150" stroke="rgba(0,198,255,0.2)" />
            <!-- Cardinal Labels -->
            <text x="145" y="18" fill="#00c6ff" font-size="11" font-weight="bold">N</text>
            <text x="145" y="295" fill="#00c6ff" font-size="11" font-weight="bold">S</text>
            <text x="285" y="154" fill="#00c6ff" font-size="11" font-weight="bold">E</text>
            <text x="6" y="154" fill="#00c6ff" font-size="11" font-weight="bold">W</text>
            <!-- User Center Pin -->
            <circle cx="150" cy="150" r="6" fill="#ff4d4d" stroke="#ffffff" stroke-width="2" />
            <text x="142" y="170" fill="#ff7777" font-size="10" font-weight="bold">YOU</text>
            <!-- Hospital Pins -->
            ${pinsSvg}
          </svg>
        </div>
        <p style="font-size:0.8rem;text-align:center;color:rgba(255,255,255,0.6);margin:4px 0 0;">
          🟢 Green = Closest Facility • 🔵 Blue = Other Nearby Facilities • 🔴 Red = Your Location
        </p>
      </div>
    `;
  }

  // Open detail modal for facility (especially useful for Gubbi or offline viewing)
  function openFacilityDetails(hospitalId) {
    if (!state.hospitalData) return;
    const all = [...(state.hospitalData.tiptur || []), ...(state.hospitalData.gubbi || [])];
    const h = all.find((item) => item.id === hospitalId);
    if (!h) return;

    const modal = document.getElementById('facilityModal');
    const content = document.getElementById('facilityModalContent');
    if (!modal || !content) return;

    let distText = '';
    if (state.userCoords) {
      const d = haversineDistance(state.userCoords.lat, state.userCoords.lng, h.lat, h.lng);
      distText = `<div style="background:rgba(0,198,255,0.15);padding:8px 12px;border-radius:8px;margin-bottom:12px;color:#7ee7ff;font-weight:bold;">📍 Approx. ${formatDistance(d)} from your current position</div>`;
    }

    content.innerHTML = `
      <h2 style="color:#00c6ff;margin-top:0;">${escapeHtml(h.name)}</h2>
      <p style="opacity:0.85;margin-bottom:12px;">${escapeHtml(h.subtitle)}</p>
      ${distText}
      <div style="background:rgba(255,255,255,0.04);padding:14px;border-radius:10px;margin-bottom:14px;">
        <p style="margin:4px 0;"><strong>Address:</strong> ${escapeHtml(h.address)}</p>
        <p style="margin:4px 0;"><strong>Timings:</strong> ${escapeHtml(h.timings)}</p>
        <p style="margin:4px 0;"><strong>Emergency:</strong> ${escapeHtml(h.emergency_phone || 'Call 112 / 108')}</p>
        <p style="margin:4px 0;"><strong>ICU Available:</strong> ${h.icu_available ? '✅ Yes' : '❌ Not equipped for advanced ICU'}</p>
        <p style="margin:4px 0;"><strong>Bed Capacity:</strong> ${escapeHtml(h.bed_count || 'General capacity')}</p>
      </div>
      <div style="margin-bottom:14px;">
        <h4 style="color:#00c6ff;margin:0 0 8px 0;">Available Services</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${(h.services || []).map((s) => `<span style="background:rgba(0,198,255,0.1);border:1px solid rgba(0,198,255,0.3);padding:4px 10px;border-radius:20px;font-size:0.85rem;">${escapeHtml(s)}</span>`).join('')}
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.02);border-left:3px solid #00c6ff;padding:10px;border-radius:4px;font-size:0.85rem;color:rgba(255,255,255,0.7);margin-bottom:16px;">
        ${escapeHtml(h.verification_note || 'Facility verified in Tiptur/Gubbi Healthcare Hub registry.')}
      </div>
      <div style="display:flex;gap:12px;justify-content:flex-end;">
        ${(h.phones && h.phones[0]) ? `<a href="tel:${h.phones[0]}" class="btn" style="background:#00c6ff;color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">📞 Call ${h.phones[0]}</a>` : ''}
        ${h.region === 'tiptur' ? `<a href="${h.page}" class="btn" style="background:transparent;border:1px solid #00c6ff;color:#00c6ff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open Full Profile Page</a>` : ''}
        <button onclick="window.tipturGps.closeFacilityDetails()" class="btn" style="background:rgba(255,255,255,0.1);color:#fff;padding:10px 18px;border-radius:8px;border:none;cursor:pointer;">Close</button>
      </div>
    `;

    modal.style.display = 'flex';
  }

  function closeFacilityDetails() {
    const modal = document.getElementById('facilityModal');
    if (modal) modal.style.display = 'none';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Fallback data in case json cannot be fetched
  function getFallbackHospitalData() {
    return {
      tiptur: [
        { id: 'govt-hospital', page: 'govt-hospital.html', name: 'Government General Hospital, Tiptur', subtitle: 'Public hospital · 24×7 Emergency', address: 'Near Bus Stand, Tiptur', lat: 13.2568, lng: 76.4764, phones: ['08133000000', '108'], timings: 'Open 24 Hours', icu_available: true, services: ['Emergency', 'Maternity', 'General Medicine'], verification_note: 'Verified Government Hospital' },
        { id: 'hospital', page: 'hospital.html', name: 'Shridevi Institute of Medical Sciences & Research Hospital', subtitle: 'Major Teaching hospital', address: 'Sira Road, Tumakuru', lat: 13.3742, lng: 77.0982, phones: ['08162211999'], timings: 'Open 24 Hours', icu_available: true, services: ['Cardiac', 'ICU', 'Emergency'], verification_note: 'Referral Hospital' },
        { id: 'mudra-hospital', page: 'mudra-hospital.html', name: 'Mudra Hospital', subtitle: 'Multi-speciality hospital', address: 'B.H. Road, Tiptur', lat: 13.2601, lng: 76.4748, phones: ['08133222333'], timings: '24×7 Emergency', icu_available: true, services: ['General Medicine', 'Cardiology'], verification_note: 'Verified from template embed' }
      ],
      gubbi: [
        { id: 'gubbi-taluk-hospital', page: 'gubbi-taluk-hospital', name: 'Gubbi Taluk General Hospital (CHC Gubbi)', subtitle: 'Public Government Taluk Hospital · 24×7 Emergency', address: 'Near KSRTC Bus Stand, Gubbi', lat: 13.3130, lng: 76.9385, phones: ['08131-222240', '108'], timings: '24 Hours', icu_available: true, services: ['Emergency', 'Maternity', 'General Medicine'], verification_note: 'Verified Government Taluk Facility' }
      ]
    };
  }

  // Setup Event Listeners
  function init() {
    // Online / Offline window listeners
    window.addEventListener('online', () => {
      state.isOnline = true;
      updateStatusUI();
    });
    window.addEventListener('offline', () => {
      state.isOnline = false;
      updateStatusUI();
    });

    // Search input
    const searchInput = document.getElementById('search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderHospitalCards();
      });
    }

    // Filter checkboxes if present
    const emCheck = document.getElementById('filterEmergency');
    if (emCheck) {
      emCheck.addEventListener('change', (e) => {
        state.emergencyFilter = e.target.checked;
        renderHospitalCards();
      });
    }

    const icuCheck = document.getElementById('filterIcu');
    if (icuCheck) {
      icuCheck.addEventListener('change', (e) => {
        state.icuFilter = e.target.checked;
        renderHospitalCards();
      });
    }

    // Load dataset and then update UI
    loadHospitals().then(() => {
      updateStatusUI();
      renderHospitalCards();
    });

    // Register Service Worker if supported
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('Tiptur Healthcare ServiceWorker registered.'))
        .catch((err) => console.log('SW registration note:', err));
    }
  }

  // Expose global controller
  window.tipturGps = {
    init,
    retryGps: () => requestGpsLocation(),
    selectDemo: (mode) => setDemoLocation(mode),
    openFacilityDetails,
    closeFacilityDetails,
    getState: () => ({ ...state }),
    getComputedHospitals
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
