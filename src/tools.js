// MCP Tool Definitions for Regulatory Intelligence MCP
// 5 tools: search_regulations, entity_compliance_check, regulatory_filing_tracker, export_control_search, compliance_risk_report

import { searchEnforcement } from './apis/openfda-api.js';
import { getCompanyFilings } from './apis/sec-edgar-api.js';
import { screenEntity, searchExportControls } from './apis/opensanctions-api.js';
import {
    calculateEnforcementExposureScore,
    calculateSanctionsScreeningScore,
    calculateRegulatoryFilingsScore,
    calculateExportControlScore,
    calculateCompositeComplianceScore,
    getRiskLevel
} from './scoring.js';

// =============================================================================
// MCP TOOL DEFINITIONS
// =============================================================================

export const TOOLS = [
    {
        name: 'search_regulations',
        description: 'Search FDA drug/device enforcement actions (recalls, import alerts) by product, firm, or classification',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Drug name, device type, or firm name to search'
                },
                source: {
                    type: 'string',
                    description: "Source type: 'drug' or 'device' (optional, default: both)"
                },
                classification: {
                    type: 'string',
                    description: "Classification filter: 'Class I', 'Class II', or 'Class III'"
                },
                maxResults: {
                    type: 'integer',
                    description: 'Maximum results (default: 20, max: 100)',
                    default: 20
                }
            },
            required: ['query']
        }
    },
    {
        name: 'entity_compliance_check',
        description: 'Screen any entity (company or person) against sanctions and watchlists via OpenSanctions',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Company name or person name to screen'
                },
                type: {
                    type: 'string',
                    description: "Entity type: 'company' or 'person', default: both"
                }
            },
            required: ['query']
        }
    },
    {
        name: 'regulatory_filing_tracker',
        description: 'Track SEC regulatory filings for a company (10-K, 8-K, Form 4, proxy statements)',
        inputSchema: {
            type: 'object',
            properties: {
                ticker: {
                    type: 'string',
                    description: 'Stock ticker symbol (required)'
                },
                formTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: "Form types to track: ['10-K', '8-K', '4', 'SC 13G', 'DEF 14A'], default: all major"
                },
                dateRange: {
                    type: 'string',
                    description: "Date range: '7day', '30day', '90day', '1year', default: '30day'"
                }
            },
            required: ['ticker']
        }
    },
    {
        name: 'export_control_search',
        description: 'Search BIS Entity List and export control regulations for controlled entities/technologies',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Entity name, product code, or technology to search'
                },
                type: {
                    type: 'string',
                    description: "Search type: 'entity' or 'product', default: 'entity'"
                }
            },
            required: ['query']
        }
    },
    {
        name: 'compliance_risk_report',
        description: 'Full composite compliance risk report for a company — fans out to FDA, OpenSanctions, SEC EDGAR, and BIS Entity List simultaneously',
        inputSchema: {
            type: 'object',
            properties: {
                company: {
                    type: 'string',
                    description: 'Company name (required)'
                },
                ticker: {
                    type: 'string',
                    description: 'Stock ticker symbol (optional — enables SEC filing tracking)'
                }
            },
            required: ['company']
        }
    }
];

// =============================================================================
// PPE PRICING MAP
// =============================================================================

export const PPE_PRICES = {
    search_regulations: 0.05,
    entity_compliance_check: 0.10,
    regulatory_filing_tracker: 0.05,
    export_control_search: 0.10,
    compliance_risk_report: 0.15
};

// =============================================================================
// TOOL HANDLERS
// =============================================================================

/**
 * Handle search_regulations tool
 * Search FDA drug/device enforcement actions
 */
export async function handleSearchRegulations(params) {
    const { query, source, classification, maxResults } = params;

    const result = await searchEnforcement(query, classification, maxResults || 20);

    return {
        query,
        totalResults: result.totalResults,
        classBreakdown: result.classBreakdown,
        enforcementActions: result.enforcementActions,
        source: result.source
    };
}

/**
 * Handle entity_compliance_check tool
 * Screen entity against sanctions via OpenSanctions
 */
export async function handleEntityComplianceCheck(params) {
    const { query, type } = params;

    const result = await screenEntity(query, type);

    return {
        query,
        matched: result.matched,
        score: result.score,
        verdict: result.verdict,
        sourcesChecked: result.sourcesChecked,
        matches: result.matches,
        signals: result.signals,
        source: result.source
    };
}

/**
 * Handle regulatory_filing_tracker tool
 * Track SEC filings for a company by ticker
 */
export async function handleRegulatoryFilingTracker(params) {
    const { ticker, formTypes, dateRange } = params;

    const forms = formTypes || ['10-K', '10-Q', '8-K', '4', 'SC 13G', 'DEF 14A'];
    const range = dateRange || '30day';

    const result = await getCompanyFilings(ticker, forms, range);

    return {
        query: ticker,
        ticker: result.ticker,
        cik: result.cik,
        companyName: result.companyName,
        formsTracked: result.formsTracked,
        recentFilings: result.recentFilings,
        filingCount: result.filingCount,
        source: result.source
    };
}

/**
 * Handle export_control_search tool
 * Search BIS Entity List via OpenSanctions
 */
export async function handleExportControlSearch(params) {
    const { query, type } = params;

    const result = await searchExportControls(query, type || 'entity');

    return {
        query,
        type: result.type,
        matchedEntities: result.matchedEntities,
        signals: result.signals,
        complianceNote: result.complianceNote,
        source: result.source
    };
}

/**
 * Handle compliance_risk_report tool
 * Fan out to all 4 sources and produce composite score
 */
export async function handleComplianceRiskReport(params) {
    const { company, ticker } = params;

    // Fan out to all sources simultaneously
    const [fdaResult, sanctionsResult, filingsResult, exportResult] = await Promise.allSettled([
        searchEnforcement(company, null, 20),
        screenEntity(company, 'both'),
        ticker ? getCompanyFilings(ticker, ['10-K', '10-Q', '8-K', '4'], '1year') : Promise.resolve({ recentFilings: [], filingCount: 0 }),
        searchExportControls(company, 'entity')
    ]);

    // Extract results with fallbacks
    const fda = fdaResult.status === 'fulfilled' ? fdaResult.value : { totalResults: 0, enforcementActions: [] };
    const sanctions = sanctionsResult.status === 'fulfilled' ? sanctionsResult.value : { matched: false, score: 0, verdict: 'CLEAR', signals: [], matches: [] };
    const filings = filingsResult.status === 'fulfilled' ? filingsResult.value : { recentFilings: [], filingCount: 0 };
    const exportCtrl = exportResult.status === 'fulfilled' ? exportResult.value : { matchedEntities: [], signals: [] };

    // Calculate sub-model scores
    const fdaEnforcementCount = fda.enforcementActions?.length || 0;
    const activeRecalls = fda.enforcementActions?.filter(a =>
        a.status === 'Ongoing' || a.status === 'On-going' || !a.status
    ).length || 0;

    const enforcementExposure = calculateEnforcementExposureScore(fdaEnforcementCount, activeRecalls);
    const sanctionsScreening = calculateSanctionsScreeningScore(sanctions);
    const regulatoryFilings = calculateRegulatoryFilingsScore(filings.filingCount || 0, false, false);
    const exportControl = calculateExportControlScore(
        sanctions.matched && sanctions.score >= 30,
        exportCtrl.matchedEntities?.some(e => e.licenseRequirement === 'Required for all exports'),
        exportCtrl.matchedEntities || []
    );

    // Composite score
    const { compositeScore, riskLevel } = calculateCompositeComplianceScore(
        enforcementExposure.score,
        sanctionsScreening.score,
        regulatoryFilings.score,
        exportControl.score
    );

    // Build signals
    const allSignals = [
        ...enforcementExposure.signals,
        ...sanctionsScreening.signals,
        ...regulatoryFilings.signals,
        ...exportControl.signals
    ];

    return {
        query: company,
        reportDate: new Date().toISOString().split('T')[0],
        compositeScore,
        riskLevel,
        enforcementExposure: {
            score: enforcementExposure.score,
            fdaEnforcementCount,
            activeRecalls,
            importAlerts: 0,
            signals: enforcementExposure.signals
        },
        sanctionsScreening: {
            score: sanctions.score,
            matched: sanctions.matched,
            verdict: sanctions.verdict,
            sourcesChecked: sanctions.sourcesChecked,
            signals: sanctions.signals
        },
        regulatoryFilings: {
            score: regulatoryFilings.score,
            ticker: ticker || null,
            recentFilingCount: filings.filingCount || 0,
            insiderTradingFlag: false,
            secInquiryFlag: false,
            signals: regulatoryFilings.signals
        },
        exportControl: {
            score: exportControl.score,
            controlledEntity: exportCtrl.matchedEntities?.length > 0,
            licenseRequired: exportCtrl.matchedEntities?.some(e => e.licenseRequirement === 'Required for all exports'),
            signals: exportControl.signals
        },
        allSignals,
        sourcesChecked: ['FDA Enforcement', 'OpenSanctions', 'SEC EDGAR', 'BIS Entity List']
    };
}

// =============================================================================
// TOOL ROUTER
// =============================================================================

export async function handleTool(toolName, params = {}) {
    switch (toolName) {
        case 'search_regulations':
            return await handleSearchRegulations(params);
        case 'entity_compliance_check':
            return await handleEntityComplianceCheck(params);
        case 'regulatory_filing_tracker':
            return await handleRegulatoryFilingTracker(params);
        case 'export_control_search':
            return await handleExportControlSearch(params);
        case 'compliance_risk_report':
            return await handleComplianceRiskReport(params);
        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}

export default { TOOLS, PPE_PRICES, handleTool };