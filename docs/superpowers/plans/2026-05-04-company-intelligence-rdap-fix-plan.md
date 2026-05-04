# RDAP Enrichment Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `companyEnrich` to return enriched domain data (registrar, registration date, expiry, nameservers, registrant) instead of empty objects by replacing the broken WHOIS API with RDAP as primary source.

**Architecture:** Add `fetchRDAP(domain)` as the primary domain WHOIS source using IANA bootstrap + per-TLD RDAP servers. Keep `whoisxmlapi.com` as secondary fallback. Add graceful degradation when all sources fail. All sources fan out in parallel via `Promise.all`.

**Tech Stack:** Node.js 18+, native `fetch`, Apify Actor SDK.

**Files:**
- Modify: `src/main.js:72-202` (companyEnrich function body)
- Create: `scripts/test_rdap.mjs` (Sprint 1 probe — not committed)

---

## File Map

| File | Role |
|------|------|
| `src/main.js:72-202` | `companyEnrich` function — replace WHOIS block with RDAP + fallback |
| `src/main.js:206-315` | `sanctionsScreen` — unchanged |
| `src/main.js:320-441` | `beneficialOwnership` — unchanged |
| `src/main.js:465-494` | `handleTool` dispatcher — unchanged |
| `src/main.js:500-606` | HTTP server + standby mode — unchanged |
| `src/main.js:608-623` | `handleRequest` MCP export — unchanged |

---

## Task 1: Sprint 1 — Probe RDAP

**Goal:** Confirm RDAP endpoint for `.com`, verify response shape, understand which fields map to our `results.whois` schema.

**Files:**
- Create: `scripts/test_rdap.mjs`

- [ ] **Step 1: Create test script**

```javascript
// scripts/test_rdap.mjs
// Probe RDAP for .com TLD — no changes to actor code

const TLD_BOOTSTRAP_URL = 'https://rdap.bootstrap.org/';

async function main() {
  const domain = process.argv[2] || 'apify.com';
  console.log(`\nProbing RDAP for: ${domain}\n`);

  // 1. Fetch IANA bootstrap
  const bootstrapResp = await fetch(TLD_BOOTSTRAP_URL);
  const bootstrap = await bootstrapResp.json();
  console.log('Bootstrap services count:', bootstrap.services?.length);

  // 2. Find .com server
  const tld = domain.split('.').pop();
  const service = bootstrap.services?.find(s => s.tlds.includes(tld));
  if (!service) {
    console.log(`No RDAP server found for .${tld}`);
    process.exit(1);
  }
  const baseUrl = service.server.replace(/\/$/, '');
  console.log(`RDAP server for .${tld}: ${baseUrl}`);

  // 3. Query RDAP
  const rdapUrl = `${baseUrl}/domain/${domain}`;
  console.log(`Fetching: ${rdapUrl}\n`);

  const resp = await fetch(rdapUrl, {
    headers: { 'User-Agent': 'Company-Intelligence-MCP/1.0 research@red-cars-io.com' }
  });

  if (!resp.ok) {
    console.log(`RDAP returned ${resp.status}`);
    const text = await resp.text();
    console.log('Body:', text.slice(0, 500));
    process.exit(1);
  }

  const rdap = await resp.json();
  console.log('RDAP response keys:', Object.keys(rdap).join(', '));
  console.log('\n--- key fields ---');
  console.log('handle:', rdap.handle);
  console.log('status:', rdap.status);
  console.log('entities count:', rdap.entities?.length);
  console.log('events count:', rdap.events?.length);
  console.log('nameservers count:', rdap.nameservers?.length);

  if (rdap.events) {
    console.log('\n--- events ---');
    rdap.events.forEach(e => {
      console.log(`  ${e.eventType}: ${e.eventDate}`);
    });
  }

  if (rdap.entities) {
    console.log('\n--- entities (first 2) ---');
    rdap.entities.slice(0, 2).forEach(e => {
      console.log(`  handle=${e.handle} roles=${e.roles?.join(',')}`);
      if (e.vcardArray) {
        const vcard = e.vcardArray;
        console.log('  vcardArray:', JSON.stringify(vcard).slice(0, 200));
      }
    });
  }

  if (rdap.nameservers) {
    console.log('\n--- nameservers ---');
    rdap.nameservers.slice(0, 3).forEach(ns => {
      console.log(`  ${ns.ldhName}`);
    });
  }

  console.log('\n--- full rdap (truncated) ---');
  console.log(JSON.stringify(rdap, null, 2).slice(0, 3000));
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test**

```bash
node scripts/test_rdap.mjs apify.com
node scripts/test_rdap.mjs example.org
node scripts/test_rdap.mjs example.net
```

Expected: JSON responses with `handle`, `entities[]`, `events[]`, `nameservers[]`.

- [ ] **Step 3: Document findings**

Note the exact RDAP response shape for each TLD. Check if `vcardArray` uses v2 or v4 format (affects parsing).

---

## Task 2: Sprint 2 — Implement fetchRDAP(domain)

**Goal:** Add `fetchRDAP(domain)` function that returns a `results.whois`-compatible object or `null`.

**Files:**
- Modify: `src/main.js` — add `fetchRDAP` before `companyEnrich` (around line 68)

- [ ] **Step 1: Add fetchRDAP function before companyEnrich**

Add after line 68 (after `getSicDescription` function):

```javascript
// ============================================
// RDAP DOMAIN LOOKUP (replaces broken WHOIS)
// ============================================

// Cache bootstrap data per TLD — valid 24hrs
const _bootstrapCache = new Map();

/**
 * Fetch RDAP bootstrap for a TLD. Cached.
 * @param {string} tld — e.g. "com", "org"
 * @returns {Promise<string>} base RDAP server URL
 */
async function getRdapServerForTld(tld) {
  if (_bootstrapCache.has(tld)) {
    return _bootstrapCache.get(tld);
  }
  const resp = await fetch('https://rdap.bootstrap.org/');
  if (!resp.ok) throw new Error(`RDAP bootstrap failed: ${resp.status}`);
  const bootstrap = await resp.json();
  const service = bootstrap.services?.find(s => s.tlds.includes(tld));
  if (!service) throw new Error(`No RDAP server for .${tld}`);
  const server = service.server.replace(/\/$/, '');
  _bootstrapCache.set(tld, server);
  return server;
}

/**
 * Extract single string from vcardArray (v4 format: fn, org, adr, tel, email)
 */
function vcardGet(vcardArray, property) {
  if (!vcardArray || !Array.isArray(vcardArray)) return null;
  // vcardArray[1..] are properties: [propertyName, params, value]
  for (const item of vcardArray) {
    if (!Array.isArray(item) || item[0] === property) {
      const val = Array.isArray(item) ? item[3] || item[1] : null;
      if (val) return val;
    }
  }
  return null;
}

/**
 * Extract date from RDAP events array by eventType.
 * @param {Array} events — RDAP events array
 * @param {string} eventType — 'registration' | 'expiration' | 'last changed'
 * @returns {string|null} ISO date string or null
 */
function extractRdapDate(events, eventType) {
  if (!events) return null;
  const evt = events.find(e => e.eventType === eventType || e.eventType === 'RWS' && eventType === 'registration');
  return evt?.eventDate?.split('T')[0] || null;
}

/**
 * Fetch domain WHOIS data via RDAP. Maps to results.whois shape.
 * @param {string} domain — e.g. "apify.com"
 * @returns {Promise<object|null>} whois-shaped object or null on failure
 */
async function fetchRDAP(domain) {
  const tld = domain.split('.').pop();
  let baseUrl;
  try {
    baseUrl = await getRdapServerForTld(tld);
  } catch (e) {
    console.error(`RDAP: no server for .${tld}: ${e.message}`);
    return null;
  }

  const rdapUrl = `${baseUrl}/domain/${domain}`;
  let resp;
  try {
    resp = await fetch(rdapUrl, {
      headers: { 'User-Agent': 'Company-Intelligence-MCP/1.0 research@red-cars-io.com' }
    });
  } catch (e) {
    console.error(`RDAP fetch error for ${domain}: ${e.message}`);
    return null;
  }

  if (!resp.ok) {
    console.error(`RDAP returned ${resp.status} for ${domain}`);
    return null;
  }

  const rdap = await resp.json();

  // Extract registrant (entity with "registrant" role)
  let registrant = null;
  if (rdap.entities?.length) {
    const regEntity = rdap.entities.find(e =>
      e.roles?.includes('registrant') || e.roles?.includes('registrar') || e.roles?.includes('admin')
    ) || rdap.entities[0];
    if (regEntity.vcardArray) {
      registrant = {
        organization: vcardGet(regEntity.vcardArray, 'ORG'),
        country: vcardGet(regEntity.vcardArray, 'country') || vcardGet(regEntity.vcardArray, 'C'),
        state: vcardGet(regEntity.vcardArray, 'region') || vcardGet(regEntity.vcardArray, 'SP'),
        city: vcardGet(regEntity.vcardArray, 'city') || vcardGet(regEntity.vcardArray, ' locality')
      };
    }
  }

  // Extract admin/tech contacts
  let administrative = null;
  let technical = null;
  if (rdap.entities?.length) {
    for (const entity of rdap.entities) {
      if (entity.roles?.includes('administrative')) {
        administrative = vcardGet(entity.vcardArray, 'FN') || entity.handle;
      }
      if (entity.roles?.includes('technical')) {
        technical = vcardGet(entity.vcardArray, 'FN') || entity.handle;
      }
    }
  }

  return {
    domain_name: rdap.handle || domain,
    registrar: null, // RDAP doesn't always have registrar
    registration_date: extractRdapDate(rdap.events, 'registration'),
    expiry_date: extractRdapDate(rdap.events, 'expiration'),
    nameservers: (rdap.nameservers || []).slice(0, 5).map(ns => ns.ldhName || ns.name),
    registrant,
    administrative,
    technical
  };
}
```

- [ ] **Step 2: Run tests to verify function loads without errors**

```bash
cd ~/Projects/apify-actors/company-intelligence-mcp
node --input-type=module << 'EOF'
import { fetchRDAP } from './src/main.js';
const r = await fetchRDAP('apify.com');
console.log('RDAP result:', JSON.stringify(r, null, 2));
EOF
```

Expected: object with `domain_name`, `registration_date`, `expiry_date`, `nameservers` populated.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: add fetchRDAP function for domain WHOIS lookup"
```

---

## Task 3: Sprint 3 — Integrate RDAP into companyEnrich

**Goal:** Replace broken WHOIS API with RDAP as primary, WHOIS as fallback, add graceful degradation.

**Files:**
- Modify: `src/main.js:79-201` (companyEnrich function body)

- [ ] **Step 1: Replace the WHOIS block in companyEnrich**

Find this block (lines 79-123 in original):
```javascript
// --- WHOIS lookup via public API ---
try {
    const whoisUrl = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=free&domainName=${encodeURIComponent(cleanDomain)}&outputFormat=json`;
    ...
} catch (e) {
    console.error("WHOIS error:", e.message);
}

// Fallback WHOIS via whoisxmlapi free tier / alternative
...
```

Replace with:

```javascript
    // --- RDAP domain lookup (primary) ---
    try {
        const rdapData = await fetchRDAP(cleanDomain);
        if (rdapData) {
            results.whois = rdapData;
            sources.push('RDAP');
            // Estimate company size from domain age
            if (rdapData.registration_date) {
                const ageYears = (Date.now() - new Date(rdapData.registration_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
                if (ageYears > 15) results.size = 'enterprise';
                else if (ageYears > 5) results.size = 'smb';
                else results.size = 'startup';
                results.founded = new Date(rdapData.registration_date).getFullYear()?.toString() || null;
            }
        }
    } catch (e) {
        console.error("RDAP error:", e.message);
    }

    // --- WHOIS fallback (secondary) ---
    if (!results.whois) {
        try {
            const whoisUrl = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=free&domainName=${encodeURIComponent(cleanDomain)}&outputFormat=json`;
            const resp = await fetch(whoisUrl);
            if (resp.ok) {
                const data = await resp.json();
                const whois = data?.WhoisRecord || {};
                if (whois.domainName) {
                    results.whois = {
                        domain_name: whois.domainName || cleanDomain,
                        registrar: whois.registrarName || whois.registrar || null,
                        registration_date: whois.createdDate || whois.createdDateInISO || null,
                        expiry_date: whois.expiresDate || null,
                        nameservers: whois.nameServers?.hosts || [],
                        registrant: whois.registrant?.organization ? {
                            organization: whois.registrant.organization,
                            country: whois.registrant.country,
                            state: whois.registrant.state,
                            city: whois.registrant.city
                        } : null,
                        administrative: whois.administrativeContact || null,
                        technical: whois.techContact || null
                    };
                    if (whois.createdDate) {
                        const ageYears = (Date.now() - new Date(whois.createdDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
                        if (ageYears > 15) results.size = 'enterprise';
                        else if (ageYears > 5) results.size = 'smb';
                        else results.size = 'startup';
                        results.founded = new Date(whois.createdDate).getFullYear()?.toString() || null;
                    }
                    sources.push('WHOIS');
                }
            }
        } catch (e) {
            console.error("WHOIS fallback error:", e.message);
        }
    }
```

- [ ] **Step 2: Add incomplete flag when all WHOIS sources fail**

After `results.sources_checked = [...new Set(sources)];` (around line 198), add:

```javascript
    // Graceful degradation: flag as incomplete if no registration data
    if (!results.whois && results.sec_edgar) {
        results.incomplete = true;
    }
```

- [ ] **Step 3: Test companyEnrich directly**

```bash
node --input-type=module << 'EOF'
import { handleTool } from './src/main.js';
const result = await handleTool('company_enrich', { domain: 'apify.com' });
console.log(JSON.stringify(result, null, 2));
EOF
```

Expected: populated `results.whois` with `domain_name`, `registration_date`, `expiry_date`, `nameservers`, `registrant`.

- [ ] **Step 4: Test edge cases**

```bash
node --input-type=module << 'EOF'
import { handleTool } from './src/main.js';
// Test .org
const r1 = await handleTool('company_enrich', { domain: 'example.org' });
console.log('example.org whois:', JSON.stringify(r1.whois, null, 2));
// Test nonexistent domain
const r2 = await handleTool('company_enrich', { domain: 'thisdomaindontexist12345.xyz' });
console.log('nonexistent incomplete:', r2.incomplete);
EOF
```

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "fix: RDAP primary, WHOIS fallback, graceful degradation in companyEnrich"
```

---

## Task 4: Sprint 4 — Deploy

**Goal:** Push build to Apify and verify success rate.

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Push to Apify**

```bash
cd ~/Projects/apify-actors/company-intelligence-mcp
apify push red-cars-io/company-intelligence-mcp --wait-for-finish 120
```

Expected: BUILD SUCCEEDED, new build number (1.0.23).

- [ ] **Step 2: Check build ID**

```bash
curl -s -H "Authorization: Bearer $APIFY_API_TOKEN" \
  "https://api.apify.com/v2/acts/b0JYvJOLKau9KAYSO/builds?limit=1&desc=true" | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d).data.items[0],null,2)))"
```

Expected: `buildNumber: "1.0.23"`

- [ ] **Step 3: Run 3 test calls via API**

```bash
# Test 1: apify.com
curl -s -X POST "https://api.apify.com/v2/acts/b0JYvJOLKau9KAYSO/runs" \
  -H "Authorization: Bearer $APIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"eyJhbGciOiJIUzI1NiJ9.fake","build":"1.0.23","maxItems":1,"input":"{\"tool\":\"company_enrich\",\"params\":{\"domain\":\"apify.com\"}}"}'
```

Poll run status until SUCCEEDED/FAILED, then check run detail for populated whois data.

- [ ] **Step 4: Monitor runs via API**

```bash
curl -s -H "Authorization: Bearer $APIFY_API_TOKEN" \
  "https://api.apify.com/v2/acts/b0JYvJOLKau9KAYSO/runs?limit=20&desc=true" | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);p.data.items.forEach(r=>console.log(r.status,r.buildNumber,r.id.substring(0,8)));const fails=p.data.items.filter(r=>r.status==='FAILED').length;const ok=p.data.items.filter(r=>r.status==='SUCCEEDED').length;console.log('\\nTotal:',p.data.items.length,'Ok:',ok,'Failed:',fails);})"
```

Expected: 20/20 SUCCEEDED on build 1.0.23.

---

## Task 5: Sprint 5 — Monitor (1 hour)

**Goal:** Confirm zero FAILED runs after 1 hour in production.

- [ ] **Step 1: Check runs after 1 hour**

```bash
curl -s -H "Authorization: Bearer $APIFY_API_TOKEN" \
  "https://api.apify.com/v2/acts/b0JYvJOLKau9KAYSO/runs?limit=100&desc=true" | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const byBuild={};p.data.items.forEach(r=>{const b=r.buildNumber||'?';if(!byBuild[b])byBuild[b]={ok:0,fail:0};byBuild[b][r.status==='SUCCEEDED'?'ok':'fail']++});Object.entries(byBuild).forEach(([b,s])=>console.log(b+':',s.ok+'ok',s.fail+'fail'));})"
```

Expected: builds 1.0.9+ all have 0 FAILED. Only 1.0.8 should have FAILED runs (old queued runs).

---

## Verification Checklist

After all tasks complete:

- [ ] `fetchRDAP('apify.com')` returns `domain_name: "apify.com"` + `registration_date` + `expiry_date`
- [ ] `fetchRDAP('example.org')` returns nameservers array
- [ ] `handleTool('company_enrich', {domain:'apify.com'})` returns populated `whois` with no error
- [ ] `handleTool('company_enrich', {domain:'nonexistent1234567.xyz'})` returns with `incomplete: true` (not an error)
- [ ] `apify push` succeeds with build 1.0.23
- [ ] 20/20 SUCCEEDED on build 1.0.23
- [ ] Zero FAILED runs on 1.0.23 after 1 hour
- [ ] Git commit is pushed to GitHub

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| RDAP primary source | Task 2, Task 3 |
| WHOIS secondary fallback | Task 3 |
| Graceful degradation | Task 3 |
| `results.whois` shape backward compat | Task 3 |
| `results.sources_checked` tracking | Task 3 |
| Deploy and verify 100% success | Task 4 |
| 1-hour production monitor | Task 5 |
