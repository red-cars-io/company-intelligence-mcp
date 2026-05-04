# Spec: company-intelligence-mcp RDAP Enrichment Fix

## Problem
`companyEnrich` runs 621/day but returns empty enrichment data due to broken WHOIS path. The `whoisxmlapi.com` free tier API key is invalid, the RDAP fallback URL is a broken placeholder, and SEC EDGAR only covers US public companies. Result: 88-96% failure rate.

## Solution
Replace WHOIS with RDAP as the primary domain registration source, with WHOIS as secondary fallback, and graceful degradation to partial results.

## Architecture

```
companyEnrich(domain)
  ├── cleanDomain (strip www., normalize)
  ├── Promise.all([
  │     fetchRDAP(domain),     // NEW primary
  │     fetchWHOIS(domain),    // secondary fallback
  │     fetchEDGAR(domain)     // already works
  │   ])
  └── coalesce(results, partial=!whois && !rdap)
```

## Sprint 1 — Probe RDAP
**Goal:** Confirm RDAP response shape and TLD server for `.com`

**Script:** `test_rdap.mjs`
```javascript
const domain = 'apify.com';
// IANA bootstrap
const bootstrap = await fetch('https://rdap.bootstrap.org/').then(r => r.json());
// Find .com server
const comServer = bootstrap.services.find(s => s.tlds.includes('com'))?.server;
// Query RDAP
const rdapUrl = comServer + 'domain/apify.com';
const rdap = await fetch(rdapUrl).then(r => r.json());
console.log(JSON.stringify(rdap, null, 2));
```

**Success:** Returns parsed JSON with `handle`, `entities`, `events` fields.

## Sprint 2 — fetchRDAP(domain)
**Goal:** Pure function `fetchRDAP(domain) → Promise<RDAPRecord|null>`

**RDAP bootstrap:** `https://rdap.bootstrap.org/` — cached for 24hrs per TLD.

**RDAP response mapping to `results.whois` shape:**
```javascript
{
  domain_name: rdap.handle,           // e.g. "apify.com"
  registrar: extractRegistrar(rdap),  // from entities[].vcardArray
  registration_date: extractDate(rdap, 'registration'),
  expiry_date: extractDate(rdap, 'expiration'),
  nameservers: extractNameservers(rdap),
  registrant: extractRegistrant(rdap),
  administrative: extractAdmin(rdap),
  technical: extractTech(rdap)
}
```

**RDAP fields:**
- `handle` — domain name
- `entities[]` — contact info, each with `vcardArray` (FN, ORG, ADR, TEL, EMAIL)
- `events[]` — `{eventDate, eventType}` — types: `registration`, `expiration`, `last changed`
- `nameservers[]` — `{ldhName}` — hostnames

**Error handling:** If RDAP returns 404 or network error → return `null` (fallback to WHOIS).

## Sprint 3 — Integrate into companyEnrich
**Goal:** `companyEnrich('apple.com')` returns populated registration data

**Changes to `companyEnrich`:**
1. `fetchRDAP(cleanDomain)` replaces `whoisxmlapi.com` as primary
2. `fetchWHOIS` kept as secondary fallback (still uses `whoisxmlapi.com` free tier)
3. `results.whois` populated from whichever source returns first
4. `results.sources_checked` tracks what actually returned data
5. If both RDAP and WHOIS fail but EDGAR succeeds → return EDGAR data with `results.incomplete = true`
6. No error thrown when WHOIS/RDAP fail — graceful degradation

## Sprint 4 — Deploy
**Steps:**
1. `git add -A && git commit -m "fix: RDAP primary, graceful degradation in companyEnrich"`
2. `git push`
3. `apify push red-cars-io/company-intelligence-mcp --wait-for-finish 120`
4. Monitor via API: `GET /v2/acts/b0JYvJOLKau9KAYSO/runs?limit=50&desc=true`

**Build:** 1.0.23

**Success criteria:** 20 consecutive runs with 100% SUCCEEDED.

## Sprint 5 — Monitor
**Goal:** Zero FAILED runs after 1 hour in production

**Watch:** Apify runs dashboard, failure rate by build version.

## Backward Compatibility
`results.whois` shape unchanged — consumers (AI agents) get same data shape, just populated now instead of empty.

## Files Changed
- `src/tools.js` — add `fetchRDAP`, update `companyEnrich`, add graceful degradation
- `test_rdap.mjs` — Sprint 1 test script (not committed)

## Test Domains
- `apify.com` — .com TLD
- `example.org` — .org TLD  
- `example.net` — .net TLD
- `apple.com` — real US company with EDGAR data
