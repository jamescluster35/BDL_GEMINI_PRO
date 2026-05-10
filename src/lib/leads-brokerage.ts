import { Lead } from "./leads-schema";

export interface SaaSOpportunity {
    gap: string;
    leakage: number;
    description: string;
    category: 'Reputation' | 'Efficiency' | 'Conversion';
}

/**
 * Detects SaaS opportunities and calculates revenue leakage based on identified gaps.
 * Uses fixed multipliers for gaps: Reviews ($2500), CRM ($1500), AI Chat ($2000).
 */
export function detectAllSaaSOpportunities(lead: Lead): SaaSOpportunity[] {
    const opportunities: SaaSOpportunity[] = [];
    
    // 1. Review Management Gap
    // Multiplier: $2,500/gap
    // Gap: Based on Review Count (< 50)
    if (lead.reviewCount < 50) {
        opportunities.push({
            gap: "Review Management",
            leakage: 2500,
            description: "Low review count suggests reputation gap and lost trust.",
            category: 'Reputation'
        });
    }

    // 2. CRM Gap
    // Multiplier: $1,500/gap
    // Gap: Based on Follow-up Count (< 2)
    if ((lead.followUpCount || 0) < 2) {
        opportunities.push({
            gap: "CRM",
            leakage: 1500,
            description: "Low follow-up activity indicates lack of effective CRM usage.",
            category: 'Efficiency'
        });
    }

    // 3. AI Chat Gap
    // Multiplier: $2,000/gap
    // Gap: Based on Mobile Score (< 70)
    if ((lead.mobileScore || 0) < 70) {
        opportunities.push({
            gap: "AI Chat",
            leakage: 2000,
            description: "High friction environment suitable for AI Chat to improve conversion.",
            category: 'Conversion'
        });
    }

    return opportunities;
}

/**
 * Generates a professional partner pitch email.
 */
export function generatePartnerPitch(lead: Lead): string {
    const opportunities = detectAllSaaSOpportunities(lead);
    const totalLeakage = opportunities.reduce((acc, opp) => acc + opp.leakage, 0);
    const painPoints = lead.painPoints || "digital optimization gaps";
    
    const opportunityDetails = opportunities
        .map(opp => `- ${opp.gap}: $${opp.leakage.toLocaleString()} estimated leakage (${opp.description})`)
        .join("\n");

    return `
Subject: High-Value Partnership Opportunity: ${lead.company}

Hi Partner Team,

I am reaching out to share a high-value lead that perfectly aligns with your SaaS solution.

We have audited ${lead.company} and identified significant revenue leakage:

- Total Estimated Monthly Leakage: $${totalLeakage.toLocaleString()}
- Primary Pain Point Identified: ${painPoints}

Detailed Breakdown of SaaS Opportunities:
${opportunityDetails}

Strategic Recommendation: We believe your platform can help them address these gaps and reclaim these missed opportunities.

Would you be interested in a warm introduction to the decision maker at ${lead.company}?

Best regards,
Brokerage Engine Team
    `.trim();
}
