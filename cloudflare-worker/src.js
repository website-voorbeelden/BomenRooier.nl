const MAX_FILES = 3;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 15 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = getAllowedOrigins(env);
    const corsHeaders = getCorsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      if (!allowedOrigins.has(origin)) return json({ ok: false }, 403);
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, message: 'Methode niet toegestaan.' }, 405, corsHeaders);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/offerte') {
      return json({ ok: false, message: 'Niet gevonden.' }, 404, corsHeaders);
    }

    if (!allowedOrigins.has(origin)) {
      return json({ ok: false, message: 'Herkomst niet toegestaan.' }, 403, corsHeaders);
    }

    if (!env.RESEND_API_KEY || !env.FORM_RECIPIENT || !env.FORM_FROM) {
      console.error('Ontbrekende Worker secrets/variabelen.');
      return json({ ok: false, message: 'Het formulier is tijdelijk niet beschikbaar.' }, 503, corsHeaders);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength && contentLength > MAX_REQUEST_BYTES) {
      return json({ ok: false, message: 'De aanvraag is te groot. Voeg kleinere foto’s toe.' }, 413, corsHeaders);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ ok: false, message: 'De formuliergegevens konden niet worden gelezen.' }, 400, corsHeaders);
    }

    // Eenvoudige botfilters. Gebruik aanvullend Cloudflare WAF/Turnstile wanneer er spam ontstaat.
    if (clean(form.get('website'), 200)) {
      return json({ ok: true, message: 'Aanvraag ontvangen.' }, 200, corsHeaders);
    }

    const loadedAt = Number(form.get('form_loaded_at') || 0);
    if (!loadedAt || Date.now() - loadedAt < 1800 || Date.now() - loadedAt > 24 * 60 * 60 * 1000) {
      return json({ ok: false, message: 'Ververs de pagina en probeer het opnieuw.' }, 400, corsHeaders);
    }

    const data = {
      name: clean(form.get('name'), 100),
      phone: clean(form.get('phone'), 30),
      email: clean(form.get('email'), 160).toLowerCase(),
      postalCode: clean(form.get('postal_code'), 12).toUpperCase(),
      city: clean(form.get('city'), 100),
      service: clean(form.get('service'), 100),
      message: clean(form.get('message'), 1500),
      consent: clean(form.get('consent'), 10),
      pageUrl: clean(form.get('page_url'), 1000),
      utmSource: clean(form.get('utm_source'), 500),
      utmMedium: clean(form.get('utm_medium'), 500),
      utmCampaign: clean(form.get('utm_campaign'), 500),
      utmTerm: clean(form.get('utm_term'), 500),
      utmContent: clean(form.get('utm_content'), 500),
      gclid: clean(form.get('gclid'), 500),
      gbraid: clean(form.get('gbraid'), 500),
      wbraid: clean(form.get('wbraid'), 500),
      msclkid: clean(form.get('msclkid'), 500)
    };

    const validationError = validate(data);
    if (validationError) {
      return json({ ok: false, message: validationError }, 400, corsHeaders);
    }

    const incomingFiles = form.getAll('photos').filter((entry) => entry instanceof File && entry.size > 0);
    const checkedFiles = validateFiles(incomingFiles);
    if (!checkedFiles.ok) {
      return json({ ok: false, message: checkedFiles.message }, 400, corsHeaders);
    }

    const attachments = [];
    for (const file of incomingFiles) {
      const buffer = await file.arrayBuffer();
      attachments.push({
        filename: safeFilename(file.name),
        content: arrayBufferToBase64(buffer)
      });
    }

    const attributionRows = [
      ['utm_source', data.utmSource],
      ['utm_medium', data.utmMedium],
      ['utm_campaign', data.utmCampaign],
      ['utm_term', data.utmTerm],
      ['utm_content', data.utmContent],
      ['gclid', data.gclid],
      ['gbraid', data.gbraid],
      ['wbraid', data.wbraid],
      ['msclkid', data.msclkid]
    ].filter(([, value]) => value);

    const html = buildHtmlEmail(data, attributionRows, request);
    const text = buildTextEmail(data, attributionRows, request);
    const idempotencyKey = await createIdempotencyKey(data, loadedAt);

    const resendPayload = {
      from: env.FORM_FROM,
      to: [env.FORM_RECIPIENT],
      reply_to: data.email,
      subject: `Nieuwe offerteaanvraag: ${subjectSafe(data.service)} – ${subjectSafe(data.city)}`,
      html,
      text,
      attachments,
      tags: [
        { name: 'source', value: 'bomenrooier_website' },
        { name: 'form', value: 'offerte' }
      ]
    };

    let resendResponse;
    try {
      resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(resendPayload)
      });
    } catch (error) {
      console.error('Resend netwerkfout', error);
      return json({ ok: false, message: 'Versturen is tijdelijk niet gelukt. Probeer het later opnieuw.' }, 502, corsHeaders);
    }

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('Resend fout', resendResponse.status, errorText);
      return json({ ok: false, message: 'Versturen is tijdelijk niet gelukt. Bel of stuur een WhatsApp-bericht.' }, 502, corsHeaders);
    }

    return json({ ok: true, message: 'Uw aanvraag is ontvangen.' }, 200, corsHeaders);
  }
};

function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || 'https://bomenrooier.nl,https://www.bomenrooier.nl')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured);
}

function getCorsHeaders(origin, allowedOrigins) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  if (allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

function clean(value, maxLength) {
  return String(value || '').replace(/\0/g, '').trim().slice(0, maxLength);
}

function validate(data) {
  if (!data.name || !data.phone || !data.email || !data.postalCode || !data.city || !data.service || !data.message) {
    return 'Vul alle verplichte velden in.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Vul een geldig e-mailadres in.';
  const phoneDigits = data.phone.replace(/\D/g, '');
  if (phoneDigits.length < 8 || phoneDigits.length > 15) return 'Vul een geldig telefoonnummer in.';
  if (data.consent !== 'ja') return 'Toestemming om contact op te nemen is verplicht.';
  return '';
}

function validateFiles(files) {
  if (files.length > MAX_FILES) return { ok: false, message: 'Voeg maximaal drie foto’s toe.' };
  let total = 0;
  for (const file of files) {
    total += file.size;
    const extensionAllowed = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
    if (!ALLOWED_FILE_TYPES.has(file.type) && !extensionAllowed) {
      return { ok: false, message: 'Gebruik alleen JPG, PNG, WebP of HEIC.' };
    }
    if (file.size > MAX_FILE_BYTES) return { ok: false, message: 'Een foto mag maximaal 4 MB zijn.' };
  }
  if (total > MAX_TOTAL_FILE_BYTES) return { ok: false, message: 'De foto’s mogen samen maximaal 10 MB zijn.' };
  return { ok: true };
}

function safeFilename(filename) {
  const cleaned = String(filename || 'foto').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  return cleaned.slice(0, 120) || 'foto';
}

function subjectSafe(value) {
  return String(value || '').replace(/[\r\n]/g, ' ').slice(0, 80);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function tableRow(label, value) {
  return `<tr><th style="padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #e3e8e4;width:180px;color:#3e5145">${escapeHtml(label)}</th><td style="padding:10px 12px;border-bottom:1px solid #e3e8e4;color:#142018">${escapeHtml(value || '—')}</td></tr>`;
}

function buildHtmlEmail(data, attributionRows, request) {
  const ipCountry = request.cf?.country || 'onbekend';
  const rows = [
    ['Naam', data.name], ['Telefoon', data.phone], ['E-mail', data.email],
    ['Postcode', data.postalCode], ['Plaats', data.city], ['Dienst', data.service],
    ['Omschrijving', data.message], ['Pagina', data.pageUrl], ['Land aanvraag', ipCountry],
    ...attributionRows
  ].map(([label, value]) => tableRow(label, value)).join('');

  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f2f5f2;font-family:Arial,sans-serif;color:#142018"><div style="max-width:720px;margin:0 auto;padding:28px 16px"><div style="padding:24px 28px;background:#0d3c28;color:#fff;border-radius:14px 14px 0 0"><div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#b9d8c0">BomenRooier.nl</div><h1 style="margin:8px 0 0;font-size:25px">Nieuwe offerteaanvraag</h1></div><div style="padding:24px;background:#fff;border-radius:0 0 14px 14px"><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table><p style="margin:22px 0 0;color:#617067;font-size:12px">Antwoord op deze e-mail om rechtstreeks naar ${escapeHtml(data.name)} te reageren.</p></div></div></body></html>`;
}

function buildTextEmail(data, attributionRows, request) {
  const lines = [
    'NIEUWE OFFERTEAANVRAAG – BOMENROOIER.NL', '',
    `Naam: ${data.name}`, `Telefoon: ${data.phone}`, `E-mail: ${data.email}`,
    `Postcode: ${data.postalCode}`, `Plaats: ${data.city}`, `Dienst: ${data.service}`,
    '', 'Omschrijving:', data.message, '', `Pagina: ${data.pageUrl || '—'}`,
    `Land aanvraag: ${request.cf?.country || 'onbekend'}`
  ];
  if (attributionRows.length) {
    lines.push('', 'Attributie:');
    attributionRows.forEach(([key, value]) => lines.push(`${key}: ${value}`));
  }
  return lines.join('\n');
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function createIdempotencyKey(data, loadedAt) {
  const source = `${data.email}|${data.phone}|${data.service}|${loadedAt}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `bomenrooier-offerte-${hash.slice(0, 48)}`;
}
