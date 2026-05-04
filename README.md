# Company Intelligence MCP Server

> Enrich any company, screen for sanctions, and trace beneficial ownership — for AI agents.

**[View on Apify](https://apify.com/red.cars/company-intelligence-mcp)** | **[MCP Endpoint](https://company-intelligence-mcp.apify.actor/mcp)**

---

## What It Does

Give AI agents the ability to do company due diligence in three clicks — no API keys, no manual research.

- **Company enrichment** from domain → SEC EDGAR filings, WHOIS, officer names, estimated headcount
- **Sanctions screening** against OFAC SDN, OpenSanctions, and Interpol Red Notices
- **Beneficial ownership** tracing through international corporate registries

---

## Quick Start

Add to your AI agent:

```json
{
  "mcpServers": {
    "company-intelligence-mcp": {
      "url": "https://company-intelligence-mcp.apify.actor/mcp"
    }
  }
}
```

---

## Tools

| Tool | Price | Description |
|------|-------|-------------|
| `company_enrich` | $0.05 | Enrich company from domain — SEC EDGAR, WHOIS, officers |
| `sanctions_screen` | $0.10 | Screen entity against OFAC SDN, OpenSanctions, Interpol |
| `beneficial_ownership` | $0.15 | Trace beneficial ownership chain through corporate registries |

### company_enrich
**When to call:** AI agent doing B2B sales research, investment due diligence, or partnership screening.
**Example AI prompt:** "Enrich apple.com — what can you tell me about Apple's corporate structure and recent SEC filings?"

### sanctions_screen
**When to call:** AI agent doing AML/KYC compliance, vendor vetting, or M&A due diligence.
**Example AI prompt:** "Screen 'Huawei Technologies Co Ltd' for sanctions — check OFAC SDN, OpenSanctions, and Interpol."

### beneficial_ownership
**When to call:** AI agent investigating corporate structures for M&A, compliance, or investment.
**Example AI prompt:** "Trace the beneficial ownership chain for Tesla Inc — who actually controls it?"

---

## Data Sources

| Source | Coverage | What's Available |
|--------|----------|-----------------|
| SEC EDGAR | US companies | Filings, company info, officer names |
| WHOIS | Global | Domain registration, registrar, dates |
| OpenSanctions | Global | SDN, sectoral lists, EU/UN sanctions |
| Interpol | Global | Red Notices (public) |
| OpenCorporates | 140+ countries | Corporate registry data |

---

## Pricing

| Tool | Per Call |
|------|----------|
| `company_enrich` | $0.05 |
| `sanctions_screen` | $0.10 |
| `beneficial_ownership` | $0.15 |

No subscription. Pay per use via Apify PPE. No API keys required.

---

## Example Calls

### Enrich a company

```
company_enrich(domain="stripe.com")
```

Returns:
```json
{
  "domain": "stripe.com",
  "company_name": "Stripe, Inc.",
  "sic_code": "7372",
  "sic_description": "Prepackaged Software",
  "state_of_incorporation": "Delaware",
  "officers": ["Patrick Collison", "John Collison"],
  "filings_count": 47,
  "recent_10k": "2024-02-15",
  "source": "SEC EDGAR + WHOIS"
}
```

### Screen for sanctions

```
sanctions_screen(entity="Huawei Technologies Co Ltd", type="company")
```

Returns:
```json
{
  "entity": "Huawei Technologies Co Ltd",
  "is_sanctioned": true,
  "lists": ["OFAC SDN", "BIS Entity List"],
  "match_confidence": "high",
  "sources": ["OFAC", "OpenSanctions"],
  "risk_level": "CRITICAL"
}
```

### Trace beneficial ownership

```
beneficial_ownership(company_name="Apple Inc.", country="US")
```

Returns:
```json
{
  "company_name": "Apple Inc.",
  "country": "US",
  "ultimate_beneficial_owner": "Tim Cook (CEO, major shareholder)",
  "ownership_chain": ["Apple Inc.", "Board of Directors", "Major Institutional Holders"],
  "source": "OpenCorporates + SEC filings"
}
```

---

## How It Compares to Alternatives

| Aspect | Company Intelligence MCP | ZoomInfo | Apollo.io |
|--------|--------------------------|----------|-----------|
| Price | $0.05–0.15/call | $99/mo+ | $49/mo+ |
| API for AI agents | MCP (native) | REST (complex) | REST (complex) |
| Sanctions screening | OFAC, OpenSanctions, Interpol | No | No |
| Beneficial ownership | Yes | Limited | No |
| No account needed | ✅ | ❌ | ❌ |

---

## Connect to AI Agents

### Claude Desktop / Cursor / Windsurf
```json
{
  "mcpServers": {
    "company-intelligence-mcp": {
      "url": "https://company-intelligence-mcp.apify.actor/mcp"
    }
  }
}
```

---

## SEO Keywords

company enrichment API, sanctions screening API, OFAC SDN check, beneficial ownership lookup, AI agent company research, KYC automation, AML screening, M&A due diligence, corporate registry API, SEC EDGAR API, WHOIS lookup, OpenSanctions API, OpenCorporates, AI agent compliance
