# BomenRooier.nl – homepage

Complete statische homepage voor GitHub Pages, met een losse Cloudflare Worker voor het offerteformulier via Resend.

## Mappenstructuur

```text
/
├── index.html
├── 404.html
├── favicon.svg
├── CNAME
├── robots.txt
├── sitemap.xml
├── site.webmanifest
├── IMAGE-SOURCES-AND-LICENSES.md
├── assets/
│   ├── css/styles.css
│   ├── js/main.js
│   ├── icons/
│   └── images/
└── cloudflare-worker/
    ├── src.js
    ├── wrangler.toml.example
    └── README.md
```

## Publiceren op GitHub Pages

1. Maak een nieuwe GitHub-repository, bijvoorbeeld `bomenrooier`.
2. Upload **de inhoud van deze map** naar de hoofdmap van de repository. `index.html`, `assets`, `robots.txt` en de andere bestanden moeten dus direct in de repository-root staan. Upload niet één extra buitenmap waar alles nog in zit.
3. Open in GitHub: **Settings → Pages**.
4. Kies bij Source: **Deploy from a branch**.
5. Kies branch `main` en map `/ (root)`.
6. Sla op en wacht tot GitHub de site heeft gepubliceerd.

Het bestand `CNAME` bevat al `bomenrooier.nl`.

## Domein via Cloudflare koppelen

Gebruik in Cloudflare de DNS-records die GitHub Pages in de repository-instellingen voorschrijft. Voor het hoofddomein zijn dit doorgaans de GitHub Pages A/AAAA-records; voor `www` gebruikt u een CNAME naar uw GitHub Pages-hostnaam. Controleer de actuele waarden altijd in GitHub bij **Settings → Pages → Custom domain**.

Zet na succesvolle DNS- en certificaatcontrole in GitHub **Enforce HTTPS** aan. Gebruik in Cloudflare SSL/TLS bij voorkeur **Full (strict)** zodra het certificaat actief is.

## Offerteformulier activeren

De frontend verstuurt naar:

```text
https://form.bomenrooier.nl/offerte
```

Publiceer eerst de Worker uit `cloudflare-worker/`. De volledige stappen staan in `cloudflare-worker/README.md`.

Belangrijk:

- `RESEND_API_KEY` uitsluitend als Cloudflare encrypted secret opslaan;
- de key nooit in HTML, `main.js`, GitHub of een openbaar configuratiebestand plaatsen;
- `aanvragen@tjworx.nl` in Resend als toegestaan afzenderadres/domein configureren;
- na publicatie een echte test met een kleine foto uitvoeren.

## Google Tag Manager

In `index.html` staan twee opmerkingen waar de officiële GTM-code kan worden toegevoegd:

1. de `<script>` in `<head>`;
2. de `<noscript>`-iframe direct na `<body>`.

Voeg geen losse hardcoded GA4-tag toe wanneer GA4 via GTM wordt beheerd.

De site stuurt de volgende `dataLayer`-events:

- `whatsapp_click`
- `phone_click`
- `email_click`
- `form_start`
- `photo_upload`
- `service_selected`
- `generate_lead`
- `form_error`
- `internal_link_click`

Het event `generate_lead` wordt pas na een succesvolle reactie van de Cloudflare Worker afgevuurd.

## Vervolgpagina's

De homepage bevat al links naar toekomstige pagina's:

- `boom-kappen/`
- `bomen-snoeien/`
- `boomstronk-verwijderen/`
- `boom-kappen-kosten/`
- `boom-kappen-den-haag/`
- `boom-kappen-rotterdam/`

Voeg die URL's pas aan `sitemap.xml` toe wanneer de pagina's inhoudelijk klaar en gepubliceerd zijn. Zo worden geen lege of tijdelijke pagina's geïndexeerd.

## Laatste controles voor livegang

- vervang of bevestig alle contactgegevens;
- test telefoon- en WhatsApp-links op mobiel;
- test formulier, foto-upload en succesmelding;
- plaats GTM en controleer events in Preview Mode;
- dien `https://bomenrooier.nl/sitemap.xml` in bij Google Search Console;
- controleer canonical, HTTPS en de gekozen voorkeursversie met of zonder `www`;
- controleer of toekomstige interne links geen 404 meer geven zodra de website officieel wordt gepromoot.
