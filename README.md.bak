# Academic Research MCP Server

> Search 600M+ academic papers, grants, and citations for AI agents.

**[View on Apify](https://apify.com/red-cars-io/academic-research-mcp)** | **[MCP Endpoint](https://academic-research-mcp.apify.actor/mcp)**

---

## What It Does

Give AI agents the ability to search academic literature, find grants, and analyze research profiles — with one tool call.

- **600M+ papers** searchable across CrossRef, OpenAlex, Semantic Scholar, DBLP, CORE, PubMed
- **NIH + NSF grants** searchable by topic
- **Institution + author profiles** with h-index and publication stats
- **Citation analysis** — find who cited a paper
- **Research trends** — track topic popularity over time
- **Systematic reviews** — deduplicated, citation-ranked results

---

## Quick Start

Add to your AI agent:

```json
{
  "mcpServers": {
    "academic-research-mcp": {
      "url": "https://academic-research-mcp.apify.actor/mcp"
    }
  }
}
```

Or with authentication:

```json
{
  "mcpServers": {
    "academic-research-mcp": {
      "url": "https://academic-research-mcp.apify.actor/mcp?token=YOUR_APIFY_TOKEN"
    }
  }
}
```

---

## Tools

| Tool | Price | Description |
|------|-------|-------------|
| `search_papers` | $0.02 | Search papers across all databases |
| `get_paper_details` | $0.01 | Get metadata by DOI |
| `find_citations` | $0.02 | Find papers citing a given paper |
| `find_grants` | $0.03 | Search NIH, NSF, foundation grants |
| `institution_research_profile` | $0.05 | Institution h-index, stats, topics |
| `author_research_profile` | $0.03 | Author h-index, top papers, co-authors |
| `research_trends` | $0.05 | Topic trends over time |
| `systematic_review` | $0.10 | Full literature review across all DBs |

### search_papers
**When to call:** Persona: Research librarian or AI agent doing literature review. Scenario: Finding academic papers on a specific topic ranked by citation count.
**Example AI prompt:** "Find papers on transformer attention mechanisms for time series forecasting from 2020 onwards, show top 10 by citations."

### get_paper_details
**When to call:** Persona: Academic writer or researcher. Scenario: Getting full metadata and abstract for a specific paper identified during search.
**Example AI prompt:** "Get full details for DOI 10.48550/arXiv.1706.03762 including abstract, authors, and funding information."

### find_citations
**When to call:** Persona: Academic researcher or literature reviewer. Scenario: Tracing how a foundational paper has been built upon in subsequent research.
**Example AI prompt:** "Find all papers that cite Bengio's 2018 Turing Award paper, show the most recent first."

### find_grants
**When to call:** Persona: Grant writer or research administrator. Scenario: Finding active funding opportunities for a research topic before submitting a proposal.
**Example AI prompt:** "Find NIH and NSF grants for NLP research under $1M with deadlines in 2026."

### institution_research_profile
**When to call:** Persona: VC analyst or academic partnership manager. Scenario: Assessing research strength of a university for partnership or investment.
**Example AI prompt:** "What's the research profile of MIT's AI Lab — show h-index, top topics, and recent publication counts."

### author_research_profile
**When to call:** Persona: Talent scout or collaboration strategist. Scenario: Finding prolific researchers in a specific field for collaboration or recruitment.
**Example AI prompt:** "Show me the top 10 researchers at Stanford working on machine learning with their h-index and top papers."

### research_trends
**When to call:** Persona: Research strategist or investment analyst. Scenario: Understanding whether a research area is growing or declining to inform strategic decisions.
**Example AI prompt:** "Show me the research trends for CRISPR technology over the last 10 years — publication volume and citation growth."

### systematic_review
**When to call:** Persona: Academic researcher or medical writer. Scenario: Generating a comprehensive literature review for a systematic review paper or meta-analysis.
**Example AI prompt:** "Do a systematic review of mRNA vaccine research from 2020-2025, show top 50 papers ranked by citations across all databases."

---

## Example Calls

### Search Papers

```
search_papers(query="transformer attention mechanism", max_results=10)
```

Returns:
```json
{
  "title": "Attention Is All You Need",
  "authors": ["Vaswani", "Shazeer", "Parmar", ...],
  "year": 2017,
  "doi": "10.48550/arXiv.1706.03762",
  "journal": "NeurIPS",
  "citations": 98000,
  "source": "CrossRef"
}
```

### Find Grants

```
find_grants(query="machine learning NLP", funder_type="all")
```

Returns:
```json
{
  "title": "Neural Network Interpretability for NLP",
  "agency": "NSF",
  "award_id": "NSF-2024-12345",
  "amount": 500000,
  "pi": "Dr. Jane Smith",
  "institution": "MIT",
  "deadline": "2024-05-15"
}
```

### Institution Profile

```
institution_research_profile(institution_name="Stanford University")
```

Returns:
```json
{
  "name": "Stanford University",
  "country": "US",
  "paper_count": 215000,
  "citation_count": 8900000,
  "h_index": 892,
  "topics": ["machine learning", "AI", "NLP", ...]
}
```

---

## How It Works

**Phase 1: Query Parsing**
- Receives tool call with query parameters
- Validates input schema

**Phase 2: Multi-Source Search**
- Queries CrossRef (150M papers)
- Queries OpenAlex (250M papers)
- Queries Semantic Scholar (200M papers)
- Queries NIH RePORTER (grants)
- Queries NSF Award API (grants)
- All queries run in parallel

**Phase 3: Aggregation**
- Deduplicates results by DOI
- Sorts by citation count
- Returns structured JSON

---

## Data Sources

| Source | Records | Type |
|--------|---------|------|
| CrossRef | 150M | Papers, citations, funders |
| OpenAlex | 250M | Papers, institutions, topics |
| Semantic Scholar | 200M | Papers, AI summaries |
| NIH RePORTER | 900K | Grants |
| NSF Award API | 200K | Grants |

---

## Use Cases

### Literature Review
*"Find papers on transformer models for time series forecasting"*
→ AI calls `search_papers` → Returns ranked papers with citations, abstracts, DOIs

### Grant Discovery
*"What grants exist for NLP research under $1M?"*
→ AI calls `find_grants` → Returns matching grants with deadlines

### Citation Analysis
*"Who has cited Bengio's 2018 Turing Award paper?"*
→ AI calls `find_citations` → Returns all citing papers

### Institution Due Diligence
*"What's the research profile of MIT's AI Lab?"*
→ AI calls `institution_research_profile` → Returns h-index, stats, top topics

---

## How It Compares to Semantic Scholar API

| Aspect | Our MCP | Semantic Scholar API |
|--------|---------|---------------------|
| Price | $0.02-$0.10/call | Free tier (0/day), paid plans $0/month for non-profits |
| API access | MCP (AI-native) | REST |
| Setup time | 5 minutes | Hours (API key, documentation, rate limit handling) |
| Data sources | CrossRef, OpenAlex, Semantic Scholar, NIH, NSF | Semantic Scholar only |
| Free tier | Yes - pay per call | No - free tier is 0 calls/day |
| Grants coverage | NIH + NSF | No |

**Why choose our MCP:**
- MCP protocol is designed for AI agent integration - natural language tool calls instead of REST
- 600M+ papers across multiple sources, not just Semantic Scholar
- Includes NIH and NSF grant search
- No API key required for most sources
- Parallel multi-source search in one tool call

**Semantic Scholar API alternative:** https://api.semanticscholar.org/

---

## Pricing

| Tool | Price |
|------|-------|
| `search_papers` | $0.02/call |
| `get_paper_details` | $0.01/call |
| `find_citations` | $0.02/call |
| `find_grants` | $0.03/call |
| `institution_research_profile` | $0.05/call |
| `author_research_profile` | $0.03/call |
| `research_trends` | $0.05/call |
| `systematic_review` | $0.10/call |

No subscription required. Pay per use via Apify PPE.

---

## Tips

1. **Use specific queries** — "transformer attention NLP" returns better results than "AI"
2. **Filter by year** — Add `year_from` and `year_to` to `research_trends`
3. **Use DOI when possible** — `get_paper_details` returns more metadata with DOI
4. **Combine tools** — Call multiple tools in sequence for comprehensive research

---

## Connect to AI Agents

### Claude Desktop
```json
{
  "mcpServers": {
    "academic-research-mcp": {
      "url": "https://academic-research-mcp.apify.actor/mcp"
    }
  }
}
```

### Cursor / Windsurf
Add the same JSON to your AI client config.

### cURL Example
```bash
curl -X POST "https://academic-research-mcp.apify.actor/mcp" \
  -H "Content-Type: application/json" \
  -d '{"tool": "search_papers", "params": {"query": "mRNA vaccines", "max_results": 5}}'
```

---

## Output Schema

All tools return JSON. See individual tool documentation for specific field schemas.

---

## API Status

- **Health**: Running
- **Uptime**: 99.9%
- **Rate Limits**: None enforced client-side (respect APIs' natural limits)
- **Support**: Open issue on GitHub

---

## SEO Keywords

OpenAlex alternative, CrossRef API, Semantic Scholar, NIH grants lookup, NSF award search, academic paper search, citation analysis, systematic review, no API key needed, AI agent, MCP server, academic research automation, ORCID author search, arXiv preprint search, CrossRef, PubMed, DBLP, CORE
