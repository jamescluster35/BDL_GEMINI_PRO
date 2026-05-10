
import { Lead, Partner } from './leads-schema';

/**
 * Enhanced Matching Engine: Matches a lead to a potential partner buyer.
 * Prioritizes niche alignment, specialization, and historical engagement/communication logs.
 */

export const findMatchingPartners = (lead: Lead, partners: Partner[]): Partner[] => {
    return partners
        .map(partner => {
            let score = 0;

            // 1. Niche Alignment (High Weight)
            if (partner.niche === lead.niche) score += 50;
            if (partner.serviceType === lead.niche) score += 30;

            // 2. Specialization Alignment (Medium Weight)
            const combinedMatchText = `${lead.painPoints} ${lead.saasOpportunities}`.toLowerCase();
            if (partner.specialization && combinedMatchText.includes(partner.specialization.toLowerCase())) {
                score += 30;
            }

            // 3. Past Communication Logs (Engagement Weight)
            if (partner.communicationLog && partner.communicationLog.length > 0) {
                // More logs = higher engagement = safer bet
                score += Math.min(partner.communicationLog.length * 5, 20);
                
                // Recency: check last interaction
                const lastLog = partner.communicationLog[0];
                if (lastLog && lastLog.date) {
                    const lastDate = new Date(lastLog.date);
                    const daysAgo = (new Date().getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysAgo < 30) score += 10;
                }
            }

            return { partner, score };
        })
        .filter(match => match.score > 0) // Only include relevant partners
        .sort((a, b) => b.score - a.score) // Sort by score DESC
        .slice(0, 3)
        .map(match => match.partner);
};
