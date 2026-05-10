import { Lead } from "./leads-schema";
import { calculateRevenueLeakage } from "./leads-research";

export function generatePartnerPitch(lead: Lead): string {
    const leakage = calculateRevenueLeakage(lead);
    const opportunity = lead.strategicPlay || "digital optimization";
    
    return `
Subject: Partnership Opportunity: ${lead.company} - Revenue Leakage Identified

Hi there,

I am reaching out to share a high-value lead that perfectly aligns with your SaaS solution.

We have audited ${lead.company} and identified significant revenue leakage:

- Total Estimated Monthly Leakage: $${leakage.total.toLocaleString()}
- Primary Pain Point: ${lead.painPoints || opportunity}
- Strategic Recommendation: We believe your ${opportunity} platform can help them reclaim these missed opportunities.

Would you be interested in a warm introduction to the decision maker at ${lead.company}?

Best regards,
Brokerage Engine Team
    `.trim();
}
