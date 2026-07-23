# BomenRooier.nl — homepage

Een snelle, mobielvriendelijke SEO-landingspagina voor boom kappen, boom verwijderen, bomen snoeien en boomstronk verwijderen.

## Inhoud

- `index.html` — volledige homepage
- `styles.css` — responsive styling
- `script.js` — menu, FAQ, formulier, upload en tracking-events
- `privacyverklaring.html` — eenvoudige privacyverklaring
- `robots.txt` en `sitemap.xml` — basis voor Search Console
- `assets/` — geoptimaliseerde lokale afbeeldingen, favicon en bronvermelding
- `worker/` — beveiligde Cloudflare Worker die formulieraanvragen met Resend verstuurt

## Eerst lokaal bekijken

Open Terminal in deze map en start een lokale server:

```bash
python3 -m http.server 8080
```

Open daarna `http://localhost:8080`.

Het ontwerp werkt lokaal. Het formulier werkt pas wanneer de Worker is gepubliceerd en het endpoint is gekoppeld.

## Contactformulier veilig activeren

De API-key hoort uitsluitend in de Worker-secret en nooit in `index.html`, `script.js`, GitHub of een screenshot.

De eerder gedeelde sleutel moet in Resend worden ingetrokken. Maak daarna een nieuwe sleutel met alleen Sending access.

### 1. Controleer Resend

- Verifieer `tjworx.nl` als verzenddomein in Resend.
- De standaardafzender staat op `aanvragen@tjworx.nl`.
- Aanvragen gaan naar `Tiesjipzakelijk@gmail.com`.

### 2. Publiceer de Cloudflare Worker

```bash
cd worker
npx wrangler login
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

Plak de nieuwe API-key alleen wanneer Wrangler daar in Terminal om vraagt.

### 3. Koppel het endpoint

**Aanbevolen:** koppel de Worker aan route `bomenrooier.nl/api/*`. De homepage kan dan onveranderd `/api/contact` gebruiken.

Wanneer je alleen een `workers.dev`-URL gebruikt, vervang in `index.html` bij het formulier:

```html
data-endpoint="/api/contact"
```

door bijvoorbeeld:

```html
data-endpoint="https://bomenrooier-contact.jouw-account.workers.dev"
```

Voeg voor lokaal testen eventueel `http://localhost:8080` tijdelijk toe aan `ALLOWED_ORIGINS` in `worker/wrangler.toml`.

## JSON-LD structured data

De homepage bevat één gekoppelde `@graph` met:

- `WebSite`
- `WebPage`
- `ImageObject`
- `HomeAndConstructionBusiness` met adres, werkgebied, telefoon en dienstenaanbod
- `FAQPage` met dezelfde vragen en antwoorden die zichtbaar op de pagina staan

Gebruik na publicatie de Google Rich Results Test en de Schema.org Validator om de live URL opnieuw te controleren. Voeg geen beoordelingen, keurmerken of openingstijden toe zolang die niet aantoonbaar en zichtbaar op de website zijn.

## GTM, GA4 en Google Ads

De site laadt nog geen trackingsoftware. Daardoor kun je de juiste container en cookietoestemming later netjes toevoegen.

Boven in `<head>` staat de plaats voor de GTM-scriptcode. Direct na `<body>` staat de plaats voor de noscriptcode. `window.dataLayer` wordt niet overschreven.

### Beschikbare events

| Event | Betekenis | Handige inzet |
|---|---|---|
| `page_ready` | Pagina en verkeersbron staan klaar | Debugging / page context |
| `cta_click` | Klik op algemene offerte-CTA | Microconversie |
| `whatsapp_click` | Klik naar WhatsApp | Google Ads-conversie of secundair doel |
| `phone_click` | Klik op telefoonnummer | Google Ads-conversie of secundair doel |
| `email_click` | Klik op e-mail | Secundair doel |
| `form_start` | Eerste interactie met formulier | Funnelanalyse |
| `service_select` | Dienst geselecteerd | Funnelanalyse |
| `file_upload` | Foto toegevoegd | Funnelanalyse |
| `form_submit_attempt` | Geldige verzendpoging | Debugging |
| `generate_lead` | Formulier succesvol via backend verzonden | Primaire leadconversie |
| `form_validation_error` | Formulier bevat fouten | UX-optimalisatie |
| `form_submit_error` | Backend/netwerkfout | Monitoring |
| `faq_open` | FAQ geopend | Contentanalyse |

Maak in GTM Custom Event-triggers met exact deze eventnamen. Voor Google Ads is `generate_lead` de beste primaire formulierconversie. WhatsApp- en belklikken kunnen apart worden gemeten.

De dataLayer bevat geen naam, e-mailadres, telefoonnummer, postcode of vrije formuliertekst. Campagneparameters en de gekozen dienst gaan wel mee.

### Campagne-attributie

De frontend bewaart tijdens de browsersessie:

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- `gclid`, `gbraid`, `wbraid`
- `msclkid`
- oorspronkelijke landingspagina

Deze gegevens komen in de aanvraagmail en in niet-persoonlijke dataLayer-events terecht.

## Search Console

1. Publiceer de site op `https://bomenrooier.nl/`.
2. Voeg bij voorkeur een Domain property toe in Google Search Console.
3. Dien `https://bomenrooier.nl/sitemap.xml` in.
4. Vraag indexering van de homepage aan.
5. Voeg pas extra diensten- en locatiepagina’s toe wanneer iedere pagina een eigen zoekintentie en unieke inhoud krijgt.

## Afbeeldingen

Alle foto's zijn lokaal opgeslagen en geoptimaliseerd naar WebP/JPG. De bronnen en fotografen staan in `assets/LICENSING.txt`. Hierdoor is de site niet afhankelijk van hotlinks naar een externe beeldbank.

## Voor livegang controleren

- Controleer of het domein definitief `bomenrooier.nl` is.
- Test bellen en WhatsApp op mobiel.
- Test het formulier met 0, 1 en 3 foto’s.
- Controleer de aanvraag in Resend Logs en in Gmail.
- Gebruik GTM Preview/Tag Assistant om de events te controleren.
- Voeg een correcte consentoplossing toe voordat GA4, Google Ads of andere niet-noodzakelijke trackingtags live gaan.
- Controleer of het huisadres zichtbaar moet blijven in footer en structured data.
