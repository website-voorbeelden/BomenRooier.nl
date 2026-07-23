const DEFAULT_ALLOWED_ORIGINS = [
  'https://bomenrooier.nl',
  'https://www.bomenrooier.nl'
];

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_SIZE = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, message: 'Methode niet toegestaan.' }, 405, corsHeaders);
    }

    if (origin && !allowedOrigins.includes(origin)) {
      return jsonResponse({ ok: false, message: 'Deze herkomst is niet toegestaan.' }, 403, corsHeaders);
    }

    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY ontbreekt.');
      return jsonResponse({ ok: false, message: 'Het formulier is nog niet volledig geconfigureerd.' }, 500, corsHeaders);
    }

    try {
      const contentType = request.headers.get('Content-Type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return jsonResponse({ ok: false, message: 'Ongeldig formulierformaat.' }, 400, corsHeaders);
      }

      const form = await request.formData();

      // Honeypot: return success so bots do not learn how the filter works.
      if (stringValue(form, 'website')) {
        return jsonResponse({ ok: true }, 200, corsHeaders);
      }

      const loadedAt = Number(stringValue(form, 'form_loaded_at'));
      const elapsed = Date.now() - loadedAt;
      if (!loadedAt || elapsed < 2500 || elapsed > 24 * 60 * 60 * 1000) {
        return jsonResponse({ ok: false, message: 'Ververs de pagina en probeer het formulier opnieuw.' }, 400, corsHeaders);
      }

      const lead = {
        name: cleanSingleLine(stringValue(form, 'name'), 120),
        phone: cleanSingleLine(stringValue(form, 'phone'), 60),
        email: cleanSingleLine(stringValue(form, 'email'), 180),
        postcode: cleanSingleLine(stringValue(form, 'postcode'), 120),
        service: cleanSingleLine(stringValue(form, 'service'), 80),
        message: cleanMultiline(stringValue(form, 'message'), 4000),
        consent: stringValue(form, 'consent'),
        formId: cleanSingleLine(stringValue(form, 'form_id'), 80),
        pageUrl: cleanSingleLine(stringValue(form, 'page_url'), 1000),
        landingPage: cleanSingleLine(stringValue(form, 'landing_page'), 1000),
        attribution: {
          utm_source: cleanSingleLine(stringValue(form, 'utm_source'), 180),
          utm_medium: cleanSingleLine(stringValue(form, 'utm_medium'), 180),
          utm_campaign: cleanSingleLine(stringValue(form, 'utm_campaign'), 250),
          utm_term: cleanSingleLine(stringValue(form, 'utm_term'), 250),
          utm_content: cleanSingleLine(stringValue(form, 'utm_content'), 250),
          gclid: cleanSingleLine(stringValue(form, 'gclid'), 300),
          gbraid: cleanSingleLine(stringValue(form, 'gbraid'), 300),
          wbraid: cleanSingleLine(stringValue(form, 'wbraid'), 300),
          msclkid: cleanSingleLine(stringValue(form, 'msclkid'), 300)
        }
      };

      const validationError = validateLead(lead);
      if (validationError) {
        return jsonResponse({ ok: false, message: validationError }, 400, corsHeaders);
      }

      const files = form.getAll('photos').filter((value) => value instanceof File && value.size > 0);
      const fileError = validateFiles(files);
      if (fileError) {
        return jsonResponse({ ok: false, message: fileError }, 400, corsHeaders);
      }

      const attachments = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        attachments.push({
          filename: safeFilename(file.name, file.type),
          content: uint8ToBase64(bytes)
        });
      }

      const sourceIp = request.headers.get('CF-Connecting-IP') || '';
      const userAgent = cleanSingleLine(request.headers.get('User-Agent') || '', 500);
      const submittedAt = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
      const serviceLabel = serviceName(lead.service);

      const payload = {
        from: env.FROM_EMAIL || 'BomenRooier aanvragen <aanvragen@tjworx.nl>',
        to: [env.TO_EMAIL || 'Tiesjipzakelijk@gmail.com'],
        reply_to: lead.email,
        subject: `Nieuwe aanvraag: ${serviceLabel} — ${lead.postcode}`,
        html: buildEmailHtml(lead, serviceLabel, submittedAt, sourceIp, userAgent, files),
        text: buildEmailText(lead, serviceLabel, submittedAt, files),
        tags: [
          { name: 'source', value: tagValue(lead.attribution.utm_source || 'organic_direct') },
          { name: 'service', value: tagValue(lead.service || 'unknown') },
          { name: 'form', value: tagValue(lead.formId || 'homepage') }
        ],
        ...(attachments.length ? { attachments } : {})
      };

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify(payload)
      });

      const resendResult = await resendResponse.json().catch(() => ({}));
      if (!resendResponse.ok) {
        console.error('Resend error', resendResponse.status, resendResult);
        return jsonResponse({ ok: false, message: 'De aanvraag kon niet worden verstuurd. Probeer WhatsApp of bel ons.' }, 502, corsHeaders);
      }

      return jsonResponse({ ok: true, id: resendResult.id || null }, 200, corsHeaders);
    } catch (error) {
      console.error('Contact worker error', error);
      return jsonResponse({ ok: false, message: 'Er ging iets mis bij het versturen. Probeer WhatsApp of bel ons.' }, 500, corsHeaders);
    }
  }
};

function parseAllowedOrigins(value) {
  if (!value) return DEFAULT_ALLOWED_ORIGINS;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function buildCorsHeaders(origin, allowedOrigins) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  };
  if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}

function stringValue(form, key) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function cleanSingleLine(value, maxLength) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, maxLength);
}

function validateLead(lead) {
  if (lead.name.length < 2) return 'Vul uw naam in.';
  if (lead.phone.replace(/\D/g, '').length < 8) return 'Vul een geldig telefoonnummer in.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return 'Vul een geldig e-mailadres in.';
  if (lead.postcode.length < 4) return 'Vul uw postcode en plaats in.';
  if (!lead.service) return 'Kies de gewenste dienst.';
  if (lead.message.length < 10) return 'Geef een iets uitgebreidere omschrijving van de klus.';
  if (lead.consent !== 'yes') return 'Toestemming is vereist om de aanvraag te behandelen.';
  return '';
}

function validateFiles(files) {
  if (files.length > MAX_FILES) return `Voeg maximaal ${MAX_FILES} foto's toe.`;
  let total = 0;
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) return 'Gebruik alleen JPG, PNG of WebP.';
    if (file.size > MAX_FILE_SIZE) return 'Een foto is groter dan 5 MB.';
    total += file.size;
  }
  if (total > MAX_TOTAL_SIZE) return 'De foto’s zijn samen te groot. Gebruik kleinere bestanden.';
  return '';
}

function safeFilename(name, type) {
  const extByType = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const cleaned = name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(-120);
  if (cleaned.includes('.')) return cleaned;
  return `${cleaned || 'boom-foto'}${extByType[type] || ''}`;
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function serviceName(value) {
  const services = {
    boom_kappen_verwijderen: 'Boom kappen of verwijderen',
    bomen_snoeien: 'Bomen snoeien',
    boomstronk_wortels: 'Boomstronk of wortels verwijderen',
    stormschade_spoed: 'Stormschade of gevaarlijke boom',
    kapvergunning_advies: 'Kapvergunning of advies',
    anders: 'Andere boomklus'
  };
  return services[value] || value || 'Onbekende dienst';
}

function tagValue(value) {
  const cleaned = String(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256);
  return cleaned || 'unknown';
}

function row(label, value) {
  return `<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#667085;width:180px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#172019;font-weight:600;vertical-align:top">${escapeHtml(value || 'Niet ingevuld').replace(/\n/g, '<br>')}</td></tr>`;
}

function buildEmailHtml(lead, serviceLabel, submittedAt, sourceIp, userAgent, files) {
  const a = lead.attribution;
  const hasAttribution = Object.values(a).some(Boolean);
  return `<!doctype html>
  <html lang="nl"><body style="margin:0;background:#f3f7f3;font-family:Arial,sans-serif;color:#172019">
    <div style="max-width:760px;margin:0 auto;padding:30px 16px">
      <div style="background:#173f2b;color:white;padding:26px;border-radius:16px 16px 0 0">
        <div style="font-size:13px;color:#b9d56a;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Nieuwe websiteaanvraag</div>
        <h1 style="margin:8px 0 4px;font-size:26px">${escapeHtml(serviceLabel)}</h1>
        <p style="margin:0;color:#d6e2d9">Ontvangen op ${escapeHtml(submittedAt)}</p>
      </div>
      <div style="background:white;padding:18px 18px 26px;border-radius:0 0 16px 16px">
        <table role="presentation" style="width:100%;border-collapse:collapse">
          ${row('Naam', lead.name)}
          ${row('Telefoon', lead.phone)}
          ${row('E-mail', lead.email)}
          ${row('Postcode en plaats', lead.postcode)}
          ${row('Dienst', serviceLabel)}
          ${row('Omschrijving', lead.message)}
          ${row('Foto’s', files.length ? `${files.length} bijlage(n)` : 'Geen foto’s toegevoegd')}
        </table>
        <div style="margin:24px 0 0;padding:18px;background:#f3f7f3;border-radius:10px">
          <h2 style="margin:0 0 10px;font-size:16px">Herkomst aanvraag</h2>
          <table role="presentation" style="width:100%;border-collapse:collapse">
            ${row('Pagina', lead.pageUrl)}
            ${row('Landingspagina', lead.landingPage)}
            ${hasAttribution ? row('UTM source', a.utm_source) + row('UTM medium', a.utm_medium) + row('UTM campaign', a.utm_campaign) + row('UTM term', a.utm_term) + row('UTM content', a.utm_content) : row('Campagne', 'Geen UTM-parameters')}
            ${a.gclid ? row('Google click ID', a.gclid) : ''}
            ${a.gbraid ? row('GBRAID', a.gbraid) : ''}
            ${a.wbraid ? row('WBRAID', a.wbraid) : ''}
            ${a.msclkid ? row('Microsoft click ID', a.msclkid) : ''}
            ${row('IP', sourceIp)}
            ${row('Browser', userAgent)}
          </table>
        </div>
        <p style="margin:20px 0 0;color:#667085;font-size:12px">Klik in uw mailprogramma op beantwoorden om rechtstreeks naar ${escapeHtml(lead.email)} te mailen.</p>
      </div>
    </div>
  </body></html>`;
}

function buildEmailText(lead, serviceLabel, submittedAt, files) {
  const a = lead.attribution;
  return [
    'NIEUWE AANVRAAG BOMENROOIER',
    `Ontvangen: ${submittedAt}`,
    '',
    `Naam: ${lead.name}`,
    `Telefoon: ${lead.phone}`,
    `E-mail: ${lead.email}`,
    `Postcode en plaats: ${lead.postcode}`,
    `Dienst: ${serviceLabel}`,
    `Omschrijving: ${lead.message}`,
    `Foto's: ${files.length}`,
    '',
    'HERKOMST',
    `Pagina: ${lead.pageUrl}`,
    `Landingspagina: ${lead.landingPage}`,
    `UTM source: ${a.utm_source || '-'}`,
    `UTM medium: ${a.utm_medium || '-'}`,
    `UTM campaign: ${a.utm_campaign || '-'}`,
    `UTM term: ${a.utm_term || '-'}`,
    `UTM content: ${a.utm_content || '-'}`,
    `GCLID: ${a.gclid || '-'}`,
    `GBRAID: ${a.gbraid || '-'}`,
    `WBRAID: ${a.wbraid || '-'}`,
    `MSCLKID: ${a.msclkid || '-'}`
  ].join('\n');
}
