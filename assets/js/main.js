(() => {
  'use strict';

  window.dataLayer = window.dataLayer || [];

  const pushEvent = (eventName, parameters = {}) => {
    window.dataLayer.push({
      event: eventName,
      ...parameters
    });
  };

  const header = document.getElementById('site-header');
  const navToggle = document.getElementById('nav-toggle');
  const navigation = document.getElementById('primary-navigation');

  const closeNavigation = () => {
    if (!navToggle || !navigation) return;
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Menu openen');
    navigation.classList.remove('is-open');
    document.body.classList.remove('nav-open');
  };

  if (navToggle && navigation) {
    navToggle.addEventListener('click', () => {
      const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Menu openen' : 'Menu sluiten');
      navigation.classList.toggle('is-open', !isOpen);
      document.body.classList.toggle('nav-open', !isOpen);
    });

    navigation.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeNavigation();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeNavigation();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) closeNavigation();
    }, { passive: true });
  }

  const updateHeader = () => {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const eventName = target.dataset.action;
    const allowedEvents = new Set([
      'whatsapp_click',
      'phone_click',
      'email_click',
      'internal_link_click'
    ]);
    if (!allowedEvents.has(eventName)) return;

    pushEvent(eventName, {
      cta_location: target.dataset.location || 'unknown',
      service: target.dataset.service || undefined,
      link_url: target.getAttribute('href') || undefined,
      link_text: (target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100)
    });
  });

  const year = document.getElementById('current-year');
  if (year) year.textContent = String(new Date().getFullYear());

  const form = document.getElementById('quote-form');
  if (!form) return;

  const statusBox = document.getElementById('form-status');
  const photoInput = document.getElementById('photos');
  const fileList = document.getElementById('file-list');
  const uploadBox = document.getElementById('upload-box');
  const serviceSelect = document.getElementById('service');
  const messageField = document.getElementById('message');
  const messageCount = document.getElementById('message-count');
  const formLoadedAt = document.getElementById('form-loaded-at');
  const pageUrl = document.getElementById('page-url');
  const MAX_FILES = 3;
  const MAX_FILE_SIZE = 4 * 1024 * 1024;
  const MAX_TOTAL_SIZE = 10 * 1024 * 1024;
  const ALLOWED_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]);
  let formStarted = false;
  let submissionInProgress = false;

  if (formLoadedAt) formLoadedAt.value = String(Date.now());
  if (pageUrl) pageUrl.value = window.location.href;

  const attributionKeys = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'gbraid', 'wbraid', 'msclkid'
  ];

  const captureAttribution = () => {
    const params = new URLSearchParams(window.location.search);
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem('bomenrooier_attribution') || '{}');
    } catch {
      stored = {};
    }

    const capturedAt = Number(stored.captured_at || 0);
    const isExpired = Date.now() - capturedAt > 30 * 24 * 60 * 60 * 1000;
    if (isExpired) stored = {};

    attributionKeys.forEach((key) => {
      const currentValue = params.get(key);
      if (currentValue && !stored[key]) stored[key] = currentValue.slice(0, 500);
    });
    if (!stored.captured_at) stored.captured_at = Date.now();

    try {
      localStorage.setItem('bomenrooier_attribution', JSON.stringify(stored));
    } catch {
      // Formulier blijft werken wanneer opslag is geblokkeerd.
    }

    attributionKeys.forEach((key) => {
      const input = form.querySelector(`input[name="${key}"]`);
      if (input) input.value = stored[key] || params.get(key) || '';
    });
  };

  captureAttribution();

  const markFormStarted = () => {
    if (formStarted) return;
    formStarted = true;
    pushEvent('form_start', {
      form_id: form.id,
      cta_location: 'footer'
    });
  };

  form.addEventListener('focusin', (event) => {
    if (event.target.matches('input, select, textarea')) markFormStarted();
  }, { once: false });

  const setStatus = (type, message) => {
    if (!statusBox) return;
    statusBox.className = `form-status is-${type}`;
    statusBox.textContent = message;
    statusBox.focus({ preventScroll: true });
  };

  const clearStatus = () => {
    if (!statusBox) return;
    statusBox.className = 'form-status';
    statusBox.textContent = '';
  };

  const fieldErrorElement = (field) => document.getElementById(`${field.id}-error`);

  const clearFieldError = (field) => {
    field.removeAttribute('aria-invalid');
    const error = fieldErrorElement(field);
    if (error) error.textContent = '';
  };

  const setFieldError = (field, message) => {
    field.setAttribute('aria-invalid', 'true');
    const error = fieldErrorElement(field);
    if (error) error.textContent = message;
  };

  const validateField = (field) => {
    clearFieldError(field);

    if (field.type === 'checkbox' && field.required && !field.checked) {
      setFieldError(field, 'Vink aan dat we contact met u mogen opnemen.');
      return false;
    }

    const value = field.value.trim();
    if (field.required && !value) {
      setFieldError(field, field.tagName === 'SELECT' ? 'Kies een dienst.' : 'Vul dit veld in.');
      return false;
    }

    if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setFieldError(field, 'Vul een geldig e-mailadres in.');
      return false;
    }

    if (field.type === 'tel' && value) {
      const digits = value.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) {
        setFieldError(field, 'Vul een geldig telefoonnummer in.');
        return false;
      }
    }

    return true;
  };

  const validateFiles = () => {
    const error = document.getElementById('photos-error');
    if (error) error.textContent = '';
    if (!photoInput || !photoInput.files.length) return true;

    const files = Array.from(photoInput.files);
    if (files.length > MAX_FILES) {
      if (error) error.textContent = 'Kies maximaal drie foto’s.';
      return false;
    }

    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
      const extensionAllowed = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
      if (!ALLOWED_TYPES.has(file.type) && !extensionAllowed) {
        if (error) error.textContent = 'Gebruik alleen JPG, PNG, WebP of HEIC.';
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        if (error) error.textContent = 'Een foto mag maximaal 4 MB zijn.';
        return false;
      }
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      if (error) error.textContent = 'De foto’s mogen samen maximaal 10 MB zijn.';
      return false;
    }

    return true;
  };

  const updateFileList = () => {
    if (!photoInput || !fileList) return;
    fileList.innerHTML = '';
    const files = Array.from(photoInput.files || []);
    files.slice(0, MAX_FILES).forEach((file) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const size = document.createElement('span');
      name.textContent = file.name;
      size.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
      item.append(name, size);
      fileList.append(item);
    });
  };

  if (photoInput) {
    photoInput.addEventListener('change', () => {
      markFormStarted();
      updateFileList();
      const isValid = validateFiles();
      if (photoInput.files.length && isValid) {
        pushEvent('photo_upload', {
          form_id: form.id,
          photo_count: photoInput.files.length,
          file_types: Array.from(photoInput.files).map((file) => file.type || 'unknown').join(',')
        });
      }
    });
  }

  if (uploadBox) {
    ['dragenter', 'dragover'].forEach((eventName) => {
      uploadBox.addEventListener(eventName, () => uploadBox.classList.add('is-dragging'));
    });
    ['dragleave', 'drop'].forEach((eventName) => {
      uploadBox.addEventListener(eventName, () => uploadBox.classList.remove('is-dragging'));
    });
  }

  if (serviceSelect) {
    serviceSelect.addEventListener('change', () => {
      clearFieldError(serviceSelect);
      if (serviceSelect.value) {
        pushEvent('service_selected', {
          form_id: form.id,
          service: serviceSelect.value
        });
      }
    });
  }

  if (messageField && messageCount) {
    const updateCount = () => {
      messageCount.textContent = `${messageField.value.length} / 1500`;
    };
    updateCount();
    messageField.addEventListener('input', updateCount);
  }

  form.querySelectorAll('input[required], select[required], textarea[required]').forEach((field) => {
    field.addEventListener(field.type === 'checkbox' || field.tagName === 'SELECT' ? 'change' : 'input', () => clearFieldError(field));
    field.addEventListener('blur', () => {
      if (field.value || field.checked) validateField(field);
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submissionInProgress) return;
    markFormStarted();
    clearStatus();

    const requiredFields = Array.from(form.querySelectorAll('input[required], select[required], textarea[required]'));
    const invalidFields = requiredFields.filter((field) => !validateField(field));
    const filesValid = validateFiles();

    if (invalidFields.length || !filesValid) {
      const firstInvalid = invalidFields[0] || photoInput;
      firstInvalid?.focus();
      pushEvent('form_error', {
        form_id: form.id,
        error_type: 'validation',
        error_count: invalidFields.length + (filesValid ? 0 : 1)
      });
      setStatus('error', 'Controleer de gemarkeerde velden en probeer het opnieuw.');
      return;
    }

    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      pushEvent('form_error', { form_id: form.id, error_type: 'configuration' });
      setStatus('error', 'Het formulier is nog niet gekoppeld. Bel of stuur uw aanvraag via WhatsApp.');
      return;
    }

    submissionInProgress = true;
    form.classList.add('is-loading');
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton?.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: new FormData(form),
        headers: {
          'Accept': 'application/json'
        }
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok) {
        throw new Error(result.message || 'De aanvraag kon niet worden verstuurd.');
      }

      pushEvent('generate_lead', {
        form_id: form.id,
        cta_location: 'footer',
        service: serviceSelect?.value || 'onbekend',
        lead_type: 'offerteaanvraag'
      });

      form.reset();
      captureAttribution();
      if (formLoadedAt) formLoadedAt.value = String(Date.now());
      if (pageUrl) pageUrl.value = window.location.href;
      if (fileList) fileList.innerHTML = '';
      if (messageCount) messageCount.textContent = '0 / 1500';
      setStatus('success', 'Bedankt. Uw aanvraag is ontvangen. We nemen contact met u op om de werkzaamheden te bespreken.');
      statusBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      pushEvent('form_error', {
        form_id: form.id,
        error_type: 'submission'
      });
      setStatus('error', error instanceof Error ? error.message : 'Er ging iets mis. Probeer het opnieuw of neem telefonisch contact op.');
    } finally {
      submissionInProgress = false;
      form.classList.remove('is-loading');
      submitButton?.removeAttribute('aria-busy');
    }
  });
})();
