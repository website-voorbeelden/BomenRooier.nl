# Cloudflare Worker voor het offerteformulier

Deze map bevat de serverless backend voor `https://form.bomenrooier.nl/offerte`. De Resend API-key staat uitsluitend als encrypted Cloudflare secret en wordt nooit naar de browser of GitHub gestuurd.

## 1. Voorbereiden

1. Maak in Cloudflare een Worker aan of installeer Wrangler lokaal.
2. Kopieer `wrangler.toml.example` naar `wrangler.toml`.
3. Controleer `FORM_RECIPIENT`, `FORM_FROM` en `ALLOWED_ORIGINS`.
4. Het afzenderdomein van `FORM_FROM` moet in Resend geverifieerd zijn.

## 2. Secret veilig toevoegen

Voer vanuit deze map uit:

```bash
npx wrangler secret put RESEND_API_KEY
```

Plak de Resend-key alleen in de beveiligde terminalprompt. Zet hem nooit in `src.js`, HTML, JavaScript, `wrangler.toml` of GitHub.

## 3. Publiceren

```bash
npx wrangler deploy
```

Koppel daarna in Cloudflare een Custom Domain aan de Worker:

```text
form.bomenrooier.nl
```

De frontend verstuurt standaard naar:

```text
https://form.bomenrooier.nl/offerte
```

## 4. Testen

Test vanaf de live website met een kleine JPG. Controleer daarna:

- of de aanvraag aankomt op `Tiesjipzakelijk@gmail.com`;
- of antwoorden naar het ingevulde e-mailadres gaan;
- of maximaal drie foto’s worden meegestuurd;
- of de succesmelding verschijnt;
- of in GTM het event `generate_lead` wordt ontvangen.

## Beveiliging

De Worker controleert de toegestane Origin, verplichte velden, bestandstype en bestandsgrootte. Ook bevat het formulier een honeypot en minimale invultijd. Voeg bij structurele spam Cloudflare Turnstile en/of een WAF rate-limitregel toe.
