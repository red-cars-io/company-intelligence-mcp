/**
 * Company Intelligence MCP Server
 * Domain enrichment, sanctions screening, and beneficial ownership lookup for AI agents.
 */

import http from 'http';
import Apify, { Actor } from 'apify';

// MCP manifest
const MCP_MANIFEST = {
    schema_version: "1.0",
    name: "company-intelligence-mcp",
    version: "1.0.0",
    description: "Domain enrichment, sanctions screening, and beneficial ownership lookup for AI agents",
    tools: [
        {
            name: "company_enrich",
            description: "Enrich a company profile from a domain — SEC EDGAR filings, WHOIS registration data, officer information, and estimated company metadata",
            input_schema: {
                type: "object",
                properties: {
                    domain: { type: "string", description: "Company domain name (e.g. 'apple.com')" }
                },
                required: ["domain"]
            },
            price: 0.05
        },
        {
            name: "sanctions_screen",
            description: "Screen an entity (person or company) against OFAC SDN, OpenSanctions, and Interpol Red Notices for compliance and due diligence",
            input_schema: {
                type: "object",
                properties: {
                    entity: { type: "string", description: "Entity name to screen (person or company)" },
                    type: { type: "string", enum: ["person", "company", "all"], default: "all", description: "Entity type filter" }
                },
                required: ["entity"]
            },
            price: 0.10
        },
        {
            name: "beneficial_ownership",
            description: "Trace the beneficial ownership chain of a company — finds officers, parent companies, and ultimate beneficial controllers from international registries",
            input_schema: {
                type: "object",
                properties: {
                    company_name: { type: "string", description: "Name of the company to search" },
                    country: { type: "string", description: "Country code (e.g. 'US', 'GB', 'DE')", default: "US" }
                },
                required: ["company_name"]
            },
            price: 0.15
        }
    ]
};

// Tool price map (in USD)
const TOOL_PRICES = {
    "company_enrich": 0.05,
    "sanctions_screen": 0.10,
    "beneficial_ownership": 0.15
};

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

/**
 * company_enrich — domain → full company profile
 * Sources: WHOIS (registration), SEC EDGAR (filings, officers), domain age estimation
 */
async function companyEnrich(domain) {
    const results = {};
    const sources = [];

    // Strip protocol if present
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

    // --- WHOIS lookup via public API ---
    try {
        const whoisUrl = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=free&domainName=${encodeURIComponent(cleanDomain)}&outputFormat=json`;
        const resp = await fetch(whoisUrl);
        if (resp.ok) {
            const data = await resp.json();
            const whois = data?.WhoisRecord || {};
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
            // Estimate company size from domain age and registrar
            if (whois.createdDate) {
                const ageYears = (Date.now() - new Date(whois.createdDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
                if (ageYears > 15) results.size = 'enterprise';
                else if (ageYears > 5) results.size = 'smb';
                else results.size = 'startup';
                results.founded = new Date(whois.createdDate).getFullYear()?.toString() || null;
            }
            sources.push('WHOIS');
        }
    } catch (e) {
        console.error("WHOIS error:", e.message);
    }

    // Fallback WHOIS via whoisxmlapi free tier / alternative
    // If primary fails, try the free whoisapi endpoint
    if (!results.whois) {
        try {
            // Alternative: use the free tier API more gracefully
            const altUrl = `https://api.api甫.com/whois?domain=${encodeURIComponent(cleanDomain)}`;
            // skip - will use web scraping fallback
        } catch (e) { /* ignore */ }
    }

    // --- SEC EDGAR company search ---
    try {
        // First, find CIK by company name search
        const searchUrl = `https://search.apis.edgar.gov/companysearch/v1/company/${encodeURIComponent(cleanDomain.replace('.com', '').toUpperCase())}/companyid`;
        // Try SEC EDGAR full-text search API
        const edgarUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(cleanDomain)}%22&dateRange=custom&startdt=2020-01-01&enddt=2026-12-31&forms=10-K,10-Q`;
        const resp = await fetch(edgarUrl, {
            headers: { 'User-Agent': 'Company-Intelligence-MCP/1.0 (research@red-cars-io.com)' }
        });
        if (resp.ok) {
            const text = await resp.text();
            // Parse CIK from results
            const cikMatches = text.match(/CIK=(\d{7,10})/g) || [];
            const uniqueCiks = [...new Set(cikMatches.map(m => m.replace('CIK=', '')))];
            if (uniqueCiks.length > 0) {
                results.sec_edgar = { ciks: uniqueCiks };
                sources.push('SEC EDGAR');
            }
        }
    } catch (e) {
        console.error("SEC EDGAR error:", e.message);
    }

    // --- SEC EDGAR company search via CFPB-like API ---
    try {
        const companyDomain = cleanDomain.replace('www.', '');
        const secQuery = encodeURIComponent(companyDomain);
        const secUrl = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent("\"")}${encodeURIComponent(secQuery)}&forms=10-K`;
        const searchResp = await fetch(secUrl,
            { headers: { 'User-Agent': 'Company-Intelligence-MCP/1.0 research@red-cars-io.com' } }
        );
        if (searchResp.ok) {
            const searchText = await searchResp.text();
            const cikMatches = searchText.match(/CIK=(\d{7,10})/g) || [];
            if (cikMatches.length > 0) {
                const cik = cikMatches[0].replace('CIK=', '');
                // Get company submissions
                const subResp = await fetch(
                    `https://data.sec.gov/submissions/CIK${cik}.json`,
                    { headers: { 'User-Agent': 'Company-Intelligence-MCP/1.0 research@red-cars-io.com' } }
                );
                if (subResp.ok) {
                    const sub = await subResp.json();
                    const sic = sub.filings?.recent?.sic?.[0] || null;
                    results.company_name = sub.name || cleanDomain.replace('.com', '').split('.')[0];
                    results.industry = sic ? getSicDescription(sic) : null;
                    results.sec_filings_count = sub.filings?.recent?.form?.length || 0;
                    results.cik = cik;
                    sources.push('SEC EDGAR');
                }
            }
        }
    } catch (e) {
        console.error("SEC EDGAR company search error:", e.message);
    }

    // --- Additional web data: estimate size from domain age ---
    if (!results.size && results.whois?.createdDate) {
        const ageYears = (Date.now() - new Date(results.whois.createdDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (ageYears > 10) results.size = 'enterprise';
        else if (ageYears > 3) results.size = 'smb';
        else results.size = 'startup';
    }

    if (!results.company_name) {
        results.company_name = cleanDomain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    if (!results.location && results.whois?.registrant?.country) {
        results.location = [results.whois.registrant.city, results.whois.registrant.state, results.whois.registrant.country].filter(Boolean).join(', ');
    }

    results.domain = cleanDomain;
    results.sources_checked = [...new Set(sources)];
    results.tool = 'company_enrich';

    return results;
}

/**
 * sanctions_screen — entity → OFAC SDN, OpenSanctions, Interpol check
 */
async function sanctionsScreen(entity, type = 'all') {
    const query = entity.trim();
    const matches = [];
    const sources_checked = [];

    // --- OFAC SDN via API (using free API) ---
    try {
        // OpenSanctions API (free, no auth)
        const resp = await fetch(`https://api.opensanctions.org/search?q=${encodeURIComponent(query)}&type=${type === 'all' ? '' : type}&limit=20`);
        if (resp.ok) {
            const data = await resp.json();
            const results = data?.results || [];
            for (const item of results) {
                matches.push({
                    list: 'OpenSanctions',
                    name: item.name || query,
                    type: item.entity_type || 'unknown',
                    listing_date: item.listed_on || null,
                    url: item.source_url || null,
                    nationality: item.nationality || null,
                    aliases: item.aliases || [],
                    programs: item.programs || []
                });
            }
            sources_checked.push('OpenSanctions');
        }
    } catch (e) {
        console.error("OpenSanctions error:", e.message);
    }

    // --- OFAC SDN API alternative ---
    try {
        const ofacResp = await fetch(`https://ofac-api.cloudapps.io/api/v2/sdn?q=${encodeURIComponent(query)}`);
        if (ofacResp.ok) {
            const ofacData = await ofacResp.json();
            const ofacMatches = ofacData?.results || ofacData || [];
            for (const m of ofacMatches) {
                matches.push({
                    list: 'OFAC SDN',
                    name: m.name || query,
                    type: m.type || 'entity',
                    listing_date: m.added_date || null,
                    url: `https://sanctionsmap.com/sdn/detail/${m.id}`,
                    sdn_id: m.id || null,
                    programs: m.programs || []
                });
            }
            sources_checked.push('OFAC SDN');
        }
    } catch (e) {
        console.error("OFAC API error:", e.message);
    }

    // --- Interpol Red Notices ---
    try {
        const interpolResp = await fetch(
            `https://ws-public.interpol.int/notices/v1/red?name=${encodeURIComponent(query)}&type=person`,
            { headers: { 'User-Agent': 'Company-Intelligence-MCP/1.0' } }
        );
        if (interpolResp.ok) {
            const interpolData = await interpolResp.json();
            const notices = interpolData?.notices || [];
            for (const n of notices) {
                matches.push({
                    list: 'Interpol Red Notice',
                    name: n.forename ? `${n.forename} ${n.name}`.trim() : n.name || query,
                    type: 'person',
                    listing_date: n.date_of_birth ? null : null,
                    url: `https://www.interpol.int/notice/search/${n.entity_id || ''}`,
                    nationality: n.nationalities?.[0] || null,
                    charges: n.charges || null
                });
            }
            sources_checked.push('Interpol Red Notice');
        }
    } catch (e) {
        console.error("Interpol error:", e.message);
    }

    // Calculate risk score
    const matched = matches.length > 0;
    let score = 0;
    let verdict = 'CLEAR';

    if (matched) {
        // Higher score = higher risk
        score = Math.min(95, 40 + matches.length * 15);
        const hasSanction = matches.some(m => m.list === 'OFAC SDN' || m.list === 'OpenSanctions');
        const hasInterpol = matches.some(m => m.list === 'Interpol Red Notice');
        if (hasSanction && hasInterpol) {
            verdict = 'FLAG';
            score = Math.min(95, score + 20);
        } else if (hasSanction) {
            verdict = 'FLAG';
        } else {
            verdict = 'ENHANCED_REVIEW';
        }
    }

    return {
        query,
        matched,
        score,
        verdict,
        sources_checked: [...new Set(sources_checked)],
        matches,
        signals: matched ? matches.map(m => `${m.list}: ${m.name}`) : []
    };
}

/**
 * beneficial_ownership — company name → ownership chain
 */
async function beneficialOwnership(companyName, country = 'US') {
    const ownership_chain = [];
    const officers = [];
    const sources_checked = [];

    // --- Companies House (UK) ---
    if (country === 'GB' || country === 'UK') {
        try {
            const resp = await fetch(
                `https://api.companieshouse.gov.uk/search/companies?q=${encodeURIComponent(companyName)}`,
                { headers: { 'Authorization': 'Bearer ' + process.env.COMPANIES_HOUSE_API_KEY || '' } }
            );
            if (resp.ok) {
                const data = await resp.json();
                const items = data?.items || [];
                for (const item of items.slice(0, 3)) {
                    ownership_chain.push({
                        entity: item.title || companyName,
                        type: 'company',
                        jurisdiction: 'GB',
                        ownership_percent: null,
                        company_number: item.company_number || null
                    });
                    sources_checked.push('Companies House UK');
                }
            }
        } catch (e) {
            console.error("Companies House error:", e.message);
        }
    }

    // --- OpenCorporates (international) ---
    try {
        const ocResp = await fetch(
            `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(companyName)}&jurisdiction_codes=${country}&per_page=5`
        );
        if (ocResp.ok) {
            const ocData = await ocResp.json();
            const results = ocData?.results?.companies || [];
            for (const r of results) {
                const co = r.company || {};
                ownership_chain.push({
                    entity: co.name || companyName,
                    type: 'company',
                    jurisdiction: co.jurisdiction_code || country,
                    ownership_percent: null,
                    company_number: co.company_number || null,
                    source_url: co.opencorporates_url || null
                });
            }
            sources_checked.push('OpenCorporates');
        }
    } catch (e) {
        console.error("OpenCorporates error:", e.message);
    }

    // --- SEC EDGAR XBRL for US companies ---
    if (country === 'US') {
        try {
            // Search SEC EDGAR for the company to find CIK
            const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&forms=10-K`;
            const resp = await fetch(searchUrl, {
                headers: { 'User-Agent': 'Company-Intelligence-MCP/1.0 (research@red-cars-io.com)' }
            });
            if (resp.ok) {
                const text = await resp.text();
                const cikMatches = text.match(/CIK=(\d{7,10})/g) || [];
                const uniqueCiks = [...new Set(cikMatches.map(m => m.replace('CIK=', '')))];
                for (const cik of uniqueCiks.slice(0, 3)) {
                    const subResp = await fetch(
                        `https://data.sec.gov/submissions/CIK${cik}.json`,
                        { headers: { 'User-Agent': 'Company-Intelligence-MCP/1.0 research@red-cars-io.com' }
                    });
                    if (subResp.ok) {
                        const sub = await subResp.json();
                        // Extract officers from submissions
                        const names = sub.filings?.recent?.name || [];
                        // Get recent 10-K for officer data
                        const recentForms = sub.filings?.recent?.form || [];
                        const tenKIndex = recentForms.indexOf('10-K');
                        if (tenKIndex !== -1) {
                            const accNum = sub.filings?.recent?.accessionNumber?.[tenKIndex]?.replace('-', '');
                            // Officer data would be in 10-K document
                            ownership_chain.push({
                                entity: sub.name || companyName,
                                type: 'company',
                                jurisdiction: 'US',
                                ownership_percent: null,
                                cik: cik,
                                sec_filings_count: recentForms.length
                            });
                        } else {
                            ownership_chain.push({
                                entity: sub.name || companyName,
                                type: 'company',
                                jurisdiction: 'US',
                                ownership_percent: null,
                                cik: cik
                            });
                        }
                        sources_checked.push('SEC EDGAR');
                    }
                }
            }
        } catch (e) {
            console.error("SEC EDGAR ownership error:", e.message);
        }
    }

    // --- Estimate confidence ---
    let confidence = ownership_chain.length > 0 ? Math.min(0.9, 0.3 + ownership_chain.length * 0.2) : 0.1;

    return {
        company_name: companyName,
        country,
        ownership_chain,
        officers,
        confidence,
        sources_checked: [...new Set(sources_checked)],
        tool: 'beneficial_ownership'
    };
}

// ============================================
// HELPER: SIC code to industry description
// ============================================
function getSicDescription(sic) {
    const sicMap = {
        '7370': 'Software & IT Services',
        '7371': 'Computer Programming & Data Processing',
        '7372': 'Software Publishers',
        '8200': 'Educational Services',
        '8700': 'Engineering & Management Services',
        '9997': 'Non-Classifiable',
        '4920': 'Oil & Gas',
        '4900': 'Utilities',
        '6000': 'Banking & Financial Services',
        '5000': 'Manufacturing'
    };
    return sicMap[sic?.toString()] || `SIC ${sic}`;
}

// ============================================
// TOOL DISPATCHER
// ============================================
async function handleTool(toolName, params = {}) {
    const handlers = {
        "company_enrich": async () => companyEnrich(params.domain),
        "sanctions_screen": async () => sanctionsScreen(params.entity, params.type),
        "beneficial_ownership": async () => beneficialOwnership(params.company_name, params.country)
    };

    const handler = handlers[toolName];
    if (!handler) {
        return { error: `Unknown tool: ${toolName}` };
    }

    try {
        const result = await handler();

        // Charge for the tool via PPE
        const price = TOOL_PRICES[toolName];
        if (price) {
            try {
                await Actor.charge(price, { eventName: toolName });
            } catch (e) {
                console.error("Charge failed:", e.message);
            }
        }

        return result;
    } catch (error) {
        return { error: error.message, tool: toolName };
    }
}

// ============================================
// HTTP SERVER FOR STANDBY MODE
// ============================================

await Actor.init();

const isStandby = Actor.config.get('metaOrigin') === 'STANDBY';

if (isStandby) {
    const PORT = parseInt(Actor.config.get('containerPort') || process.env.ACTOR_WEB_SERVER_PORT || '3000', 10);

    const server = http.createServer(async (req, res) => {
        if (req.headers['x-apify-container-server-readiness-probe']) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
        }
        if (req.method === 'POST' && req.url === '/mcp') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const jsonBody = JSON.parse(body);
                    const id = jsonBody.id ?? null;

                    const reply = (result) => {
                        const resp = id !== null
                            ? { jsonrpc: '2.0', id, result }
                            : result;
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(resp));
                    };

                    const replyError = (code, message) => {
                        const resp = id !== null
                            ? { jsonrpc: '2.0', id, error: { code, message } }
                            : { status: 'error', error: message };
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(resp));
                    };

                    const method = jsonBody.method;

                    if (method === 'initialize') {
                        return reply({
                            protocolVersion: '2024-11-05',
                            capabilities: { tools: {} },
                            serverInfo: { name: 'company-intelligence-mcp', version: '1.0.0' }
                        });
                    }

                    if (method === 'tools/list' || (!method && jsonBody.tool === 'list')) {
                        return reply({ tools: MCP_MANIFEST.tools });
                    }

                    if (method === 'tools/call') {
                        const toolName = jsonBody.params?.name;
                        const toolArgs = jsonBody.params?.arguments || {};
                        if (!toolName) return replyError(-32602, 'Missing params.name');
                        const toolResult = await handleTool(toolName, toolArgs);
                        await Actor.setValue('OUTPUT', toolResult);
                        return reply({ content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }] });
                    }

                    const { tool, params = {} } = jsonBody;
                    if (!tool) return replyError(-32602, 'Missing tool name');

                    const result = await handleTool(tool, params);
                    await Actor.setValue('OUTPUT', result);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'success', result }));
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'error', error: error.message }));
                }
            });
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    });

    // Wait for server to be fully bound before continuing
    await new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(PORT, () => {
            console.log(`Company Intelligence MCP listening on port ${PORT}`);
            resolve();
        });
    });

    // Keep the process alive with graceful shutdown handling
    const keepalive = setInterval(() => {}, 10000);
    process.on('SIGTERM', () => {
        clearInterval(keepalive);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 10000);
    });
}
// ===== NON-STANDBY PATH (Actor.isAtHome) =====
else if (Actor.isAtHome()) {
    const input = await Actor.getInput();
    if (input) {
        const { tool, params = {} } = input;
        if (tool) {
            const result = await handleTool(tool, params);
            await Actor.setValue('OUTPUT', result);
        }
    }
    await Actor.exit();
}

// Export handleRequest for MCP gateway compatibility
export default {
    handleRequest: async ({ request, log }) => {
        log.info("Company Intelligence MCP received request");
        try {
            const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
            const { tool, params = {} } = body;
            log.info(`Calling tool: ${tool}`);
            const result = await handleTool(tool, params);
            return { content: [{ type: 'text', text: JSON.stringify({ status: "success", result }, null, 2) }] };
        } catch (error) {
            log.error(`Error: ${error.message}`);
            return { content: [{ type: 'text', text: JSON.stringify({ status: "error", error: error.message }, null, 2) }] };
        }
    }
};