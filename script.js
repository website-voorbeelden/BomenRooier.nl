(() => {
  'use strict';

  const dataLayer = window.dataLayer = window.dataLayer || [];
  const pageContext = {
    page_type: 'home',
    page_path: window.location.pathname,
    page_title: document.title
  };

  const pushEvent = (eventName, parameters = {}) => {
    dataLayer.push({ event: eventName, ...pageContext, ...parameters });
  };

  // Store attribution without placing personal data in GTM/GA4.
  const attributionKeys = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'gbraid', 'wbraid', 'msclkid'
  ];
  const params = new URLSearchParams(window.location.search);
  const attribution = {};

  attributionKeys.forEach((key) => {
    const incoming = params.get(key);
    if (incoming) {
      try { sessionStorage.setItem(`br_${key}`, incoming); } catch (_) {}
      attribution[key] = incoming;
    } else {
      try { attribution[key] = sessionStorage.getItem(`br_${key}`) || ''; } catch (_) { attribution[key] = ''; }
    }
  });

  try {
    if (!sessionStorage.getItem('br_landing_page')) {
      sessionStorage.setItem('br_landing_page', window.location.href);
    }
  } catch (_) {}

  pushEvent('page_ready', {
    traffic_source: attribution.utm_source || '(direct)',
    traffic_medium: attribution.utm_medium || '(none)',
    traffic_campaign: attribution.utm_campaign || '(not set)',
    has_google_click_id: Boolean(attribution.gclid || attribution.gbraid || attribution.wbraid),
    has_microsoft_click_id: Boolean(attribution.msclkid)
  });

  // Universal click tracking. Add data-track, data-label and data-location to any future CTA.
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-track]');
    if (!target) return;

    const eventName = target.dataset.track;
    const href = target.getAttribute('href') || '';
    pushEvent(eventName, {
      element_label: target.dataset.label || target.textContent.trim().slice(0, 80),
      element_location: target.dataset.location || 'unknown',
      element_type: target.tagName.toLowerCase(),
      link_url: href.startsWith('mailto:') || href.startsWith('tel:') ? href.split(':')[0] : href,
      contact_method: eventName.includes('whatsapp') ? 'whatsapp' : eventName.includes('phone') ? 'phone' : eventName.includes('email') ? 'email' : undefined
    });
  });

  // Sticky header.
  const header = document.querySelector('[data-header]');
  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  // Mobile menu.
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  const closeMenu = () => {
    if (!menuToggle || !mobileMenu) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    mobileMenu.hidden = true;
    document.body.classList.remove('menu-open');
  };
  menuToggle?.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!open));
    mobileMenu.hidden = open;
    document.body.classList.toggle('menu-open', !open);
    pushEvent(open ? 'mobile_menu_close' : 'mobile_menu_open');
  });
  mobileMenu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => { if (window.innerWidth > 920) closeMenu(); });

  // FAQ accordion.
  document.querySelectorAll('[data-accordion] .accordion-item').forEach((item) => {
    const button = item.querySelector('button');
    const panel = item.querySelector('.accordion-panel');
    button?.addEventListener('click', () => {
      const isOpen = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!isOpen));
      if (panel) panel.hidden = isOpen;
      if (!isOpen) {
        pushEvent('faq_open', { faq_question: button.textContent.trim().slice(0, 120) });
      }
    });
  });

  // Current year.
  document.querySelectorAll('[data-current-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  const form = document.getElementById('quote-form');
  if (!form) return;

  const endpoint = form.dataset.endpoint || form.action || '/api/contact';
  const submitButton = form.querySelector('.submit-button');
  const submitLabel = form.querySelector('[data-submit-label]');
  const status = form.querySelector('[data-form-status]');
  const fileInput = form.querySelector('#photos');
  const fileList = form.querySelector('[data-file-list]');
  const uploadZone = form.querySelector('[data-upload-zone]');
  const MAX_FILES = 3;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  let selectedFiles = [];
  let formStarted = false;

  const hidden = (name) => form.querySelector(`[name="${name}"]`);
  hidden('page_url').value = window.location.href;
  try { hidden('landing_page').value = sessionStorage.getItem('br_landing_page') || window.location.href; } catch (_) { hidden('landing_page').value = window.location.href; }
  hidden('form_loaded_at').value = String(Date.now());
  attributionKeys.forEach((key) => { const field = hidden(key); if (field) field.value = attribution[key] || ''; });

  form.addEventListener('focusin', () => {
    if (formStarted) return;
    formStarted = true;
    pushEvent('form_start', { form_id: 'homepage_offerte' });
  }, { once: true });

  form.querySelector('#service')?.addEventListener('change', (event) => {
    pushEvent('service_select', { form_id: 'homepage_offerte', service: event.target.value || 'none' });
  });

  const errorFor = (name, message = '') => {
    const field = form.elements[name];
    const error = form.querySelector(`[data-error-for="${name}"]`);
    if (error) error.textContent = message;
    if (field && 'setAttribute' in field) {
      if (message) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    }
  };

  const validate = () => {
    let valid = true;
    const values = Object.fromEntries(new FormData(form).entries());
    const required = {
      name: 'Vul uw naam in.',
      phone: 'Vul een telefoonnummer in.',
      email: 'Vul een geldig e-mailadres in.',
      postcode: 'Vul uw postcode en plaats in.',
      service: 'Kies de gewenste dienst.',
      message: 'Beschrijf kort wat er moet gebeuren.'
    };

    Object.entries(required).forEach(([name, message]) => {
      const value = String(values[name] || '').trim();
      let fieldValid = Boolean(value);
      if (name === 'email' && value) fieldValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (name === 'phone' && value) fieldValid = value.replace(/\D/g, '').length >= 8;
      errorFor(name, fieldValid ? '' : message);
      if (!fieldValid) valid = false;
    });

    const consent = form.querySelector('[name="consent"]');
    errorFor('consent', consent?.checked ? '' : 'Geef toestemming om contact op te nemen.');
    if (!consent?.checked) valid = false;

    if (selectedFiles.length > MAX_FILES) {
      errorFor('photos', `Voeg maximaal ${MAX_FILES} foto's toe.`);
      valid = false;
    } else if (selectedFiles.some(file => !ALLOWED_TYPES.includes(file.type))) {
      errorFor('photos', 'Gebruik alleen JPG, PNG of WebP.');
      valid = false;
    } else if (selectedFiles.some(file => file.size > MAX_FILE_SIZE)) {
      errorFor('photos', 'Een foto is groter dan 5 MB. Kies een kleinere foto.');
      valid = false;
    } else {
      errorFor('photos', '');
    }

    return valid;
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const syncInputFiles = () => {
    if (!fileInput || typeof DataTransfer === 'undefined') return;
    const dt = new DataTransfer();
    selectedFiles.forEach(file => dt.items.add(file));
    fileInput.files = dt.files;
  };

  const renderFiles = () => {
    if (!fileList) return;
    fileList.innerHTML = '';
    selectedFiles.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'file-chip';
      chip.innerHTML = `<span>${file.name} · ${formatBytes(file.size)}</span><button type="button" aria-label="Verwijder ${file.name}">Verwijderen</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        syncInputFiles();
        renderFiles();
        errorFor('photos', '');
        pushEvent('file_remove', { form_id: 'homepage_offerte', remaining_files: selectedFiles.length });
      });
      fileList.appendChild(chip);
    });
  };

  const addFiles = (files) => {
    const incoming = Array.from(files || []);
    const combined = [...selectedFiles, ...incoming];
    const unique = combined.filter((file, index, arr) => arr.findIndex(x => x.name === file.name && x.size === file.size && x.lastModified === file.lastModified) === index);
    selectedFiles = unique.slice(0, MAX_FILES);
    syncInputFiles();
    renderFiles();

    if (unique.length > MAX_FILES) errorFor('photos', `De eerste ${MAX_FILES} foto's zijn geselecteerd.`);
    else if (selectedFiles.some(file => !ALLOWED_TYPES.includes(file.type))) errorFor('photos', 'Gebruik alleen JPG, PNG of WebP.');
    else if (selectedFiles.some(file => file.size > MAX_FILE_SIZE)) errorFor('photos', 'Een foto is groter dan 5 MB. Kies een kleinere foto.');
    else errorFor('photos', '');

    if (incoming.length) {
      pushEvent('file_upload', {
        form_id: 'homepage_offerte',
        file_count: selectedFiles.length,
        total_size_kb: Math.round(selectedFiles.reduce((sum, file) => sum + file.size, 0) / 1024)
      });
    }
  };

  fileInput?.addEventListener('change', (event) => {
    selectedFiles = [];
    addFiles(event.target.files);
  });

  if (uploadZone) {
    ['dragenter', 'dragover'].forEach(name => uploadZone.addEventListener(name, (event) => {
      event.preventDefault();
      uploadZone.classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach(name => uploadZone.addEventListener(name, (event) => {
      event.preventDefault();
      uploadZone.classList.remove('is-dragging');
    }));
    uploadZone.addEventListener('drop', (event) => addFiles(event.dataTransfer?.files));
  }

  const setLoading = (loading) => {
    submitButton.disabled = loading;
    submitButton.classList.toggle('is-loading', loading);
    if (submitLabel) submitLabel.textContent = loading ? 'Aanvraag versturen...' : 'Gratis offerte aanvragen';
  };

  const showStatus = (type, message) => {
    status.hidden = false;
    status.className = `form-status ${type}`;
    status.textContent = message;
    status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.hidden = true;

    if (!validate()) {
      pushEvent('form_validation_error', { form_id: 'homepage_offerte' });
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const service = form.elements.service.value;
    const formData = new FormData(form);
    formData.delete('photos');
    selectedFiles.forEach(file => formData.append('photos', file, file.name));

    setLoading(true);
    pushEvent('form_submit_attempt', {
      form_id: 'homepage_offerte',
      service,
      photo_count: selectedFiles.length,
      lead_source: attribution.utm_source || 'direct'
    });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      });
      let result = {};
      try { result = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(result.message || 'De aanvraag kon niet worden verstuurd.');

      showStatus('success', 'Bedankt! Uw aanvraag is verstuurd. We nemen zo snel mogelijk contact met u op.');
      pushEvent('generate_lead', {
        form_id: 'homepage_offerte',
        lead_type: 'quote_request',
        service,
        photo_count: selectedFiles.length,
        lead_source: attribution.utm_source || 'direct',
        lead_medium: attribution.utm_medium || 'none',
        lead_campaign: attribution.utm_campaign || 'not_set'
      });

      form.reset();
      selectedFiles = [];
      renderFiles();
      form.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
      hidden('form_loaded_at').value = String(Date.now());
      hidden('page_url').value = window.location.href;
      try { hidden('landing_page').value = sessionStorage.getItem('br_landing_page') || window.location.href; } catch (_) {}
      attributionKeys.forEach((key) => { const field = hidden(key); if (field) field.value = attribution[key] || ''; });
    } catch (error) {
      console.error(error);
      showStatus('error', `${error.message || 'Er ging iets mis.'} U kunt uw foto’s ook direct via WhatsApp sturen.`);
      pushEvent('form_submit_error', {
        form_id: 'homepage_offerte',
        service,
        error_type: 'network_or_api'
      });
    } finally {
      setLoading(false);
    }
  });
})();
