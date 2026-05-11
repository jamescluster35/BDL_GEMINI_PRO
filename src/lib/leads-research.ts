/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { Lead, Partner } from "./leads-schema.ts";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_MAPS_PLATFORM_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY;

export async function performGeminiResearch(lead: Lead): Promise<string> {
  if (!GEMINI_API_KEY) return "Gemini API key missing.";

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const prompt = `Perform an EXHAUSTIVE Technical and Strategic Audit for the following business.
  
  Business Name: ${lead.company}
  Website: ${lead.website}
  Location: ${lead.city}, ${lead.state}
  Category: ${lead.niche}

  STRUCTURE YOUR RESPONSE IN THESE EXACT SECTIONS:
  1. TECHNICAL FRICTION: Analyze site performance, mobile responsiveness, and specific technical failures.
  2. REVENUE LEAKAGE: Estimate lost monthly revenue for each of the following gaps: 
     - Review Management ($2,500/gap)
     - CRM ($1,500/gap)
     - AI Chat ($2,000/gap)
     List the gaps and their estimated monthly dollar leakage.
  3. SAAS OPPORTUNITY: Identify top 2-3 specific SaaS opportunities (e.g., AI Chat, CRM, Review Management) that would solve their biggest pain point.
  4. STRATEGIC PLAY: A specific 1-sentence "Hook" for outreach that references a concrete pain point discovered.

  Keep the summary technical, data-driven, and under 250 words. Focus on finding "Friction" that costs them money.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "No research findings.";
  } catch (error) {
    console.error("Gemini research error:", error);
    return "Error performing AI research.";
  }
}

/**
 * Validates a lead to determine if it's a high-value prospect.
 * Rejects large enterprises or previously rejected leads.
 */
export async function validateLead(lead: Lead): Promise<{ 
  isValid: boolean; 
  reason: string; 
  legacyScore: number; 
  isRejected: boolean; 
  rejectionReason: string; 
}> {
  if (!GEMINI_API_KEY) return { isValid: false, reason: "Gemini API key missing.", legacyScore: 0, isRejected: true, rejectionReason: "No API Key" };

  // 1. Basic filter for rejected or already processed
  if (lead.status === 'Rejected' || lead.status === 'Closed') {
    return { isValid: false, reason: "Lead is already in a terminal status.", legacyScore: 0, isRejected: true, rejectionReason: "Terminal status" };
  }

  // 2. Semantic validation using Gemini
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const prompt = `Analyze this business as a potential high-value B2B SaaS Lead.
  Business: ${lead.company}
  Website: ${lead.website}
  
  Criteria for REJECTION:
  - Is it a massive enterprise company (e.g., Apple, Walmart, McDonald's)?
  - Does it already have a sophisticated in-house digital/SaaS team (e.g., national chains with bespoke tech)?
  
  Criteria for HIGH VALUE:
  - Is it a traditional or SMB business using legacy systems?
  - Does it have significant digital friction (e.g., outdated site, no AI tools)?
  
  Return JSON: { 
    "isValid": boolean, 
    "reason": string, 
    "legacyScore": number, 
    "isRejected": boolean, 
    "rejectionReason": string 
  }`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    const text = response.text || "{}";
    const jsonMatch = text.match(/\{.*\}/s);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return { 
        isValid: data.isValid, 
        reason: data.reason, 
        legacyScore: data.legacyScore, 
        isRejected: data.isRejected, 
        rejectionReason: data.rejectionReason 
      };
    }
    return { isValid: false, reason: "Could not validate lead.", legacyScore: 0, isRejected: false, rejectionReason: "Parsing error" };
  } catch (error) {
    console.error("Lead validation error:", error);
    return { isValid: false, reason: "Validation failed.", legacyScore: 0, isRejected: true, rejectionReason: "Validation error" };
  }
}

export async function getPageSpeedData(url: string) {
  if (!GOOGLE_MAPS_PLATFORM_KEY) return null;
  
  try {
    // Normalizing URL to ensure API accepts it
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    const mobileUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(cleanUrl)}&strategy=mobile&key=${GOOGLE_MAPS_PLATFORM_KEY}`;
    const desktopUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(cleanUrl)}&strategy=desktop&key=${GOOGLE_MAPS_PLATFORM_KEY}`;
    
    const [mobileRes, desktopRes] = await Promise.all([
      fetch(mobileUrl).then(r => r.json()),
      fetch(desktopUrl).then(r => r.json())
    ]);

    return {
      mobileScore: (mobileRes.lighthouseResult?.categories?.performance?.score || 0) * 100,
      desktopScore: (desktopRes.lighthouseResult?.categories?.performance?.score || 0) * 100,
    };
  } catch (error) {
    console.error("PageSpeed API error:", error);
    return null;
  }
}

export function calculateDealValue(lead: Lead): number {
  // Automatically assigns revenue potential based on Niche
  const nicheValues: Record<string, number> = {
    'Junk Removal': 147,
    'SaaS': 297,
    'Plumbing': 197,
    'HVAC': 197,
    'Legal': 497,
    'Medical': 497,
    'Default': 97
  };

  const baseValue = nicheValues[lead.niche] || nicheValues['Default'];
  
  // Adjusts by Priority (P8+ leads get a 1.5x multiplier)
  const multiplier = lead.priority >= 8 ? 1.5 : 1.0;
  
  return Math.round(baseValue * multiplier);
}

export async function discoverPartners(city: string, serviceType: string): Promise<Partner[]> {
  if (!GEMINI_API_KEY) return [];

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const prompt = `Find the top 3 high-authority companies in ${city} that provide ${serviceType}. 
  Return the results as a JSON array of objects with the following fields: 
  id (generate a unique one), company, niche, serviceType, city, website, contactEmail, specialization.
  Ensure these companies are likely to be top-tier businesses.
  Format: JSON only.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    // Extract JSON from response (naive extraction)
    const text = response.text || "[]";
    const jsonMatch = text.match(/\[.*\]/s);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (error) {
    console.error("Partner discovery error:", error);
    return [];
  }
}

export interface RevenueLeakageBreakdown {
  total: number;
  starGap: number;
  reviewCountImpact: number;
  mobilePenalty: number;
  trustLoss: number;
  tier: 'Red' | 'Orange' | 'Yellow';
}

export function calculateRevenueLeakage(lead: Lead): RevenueLeakageBreakdown {
  // Enhanced "SaaS Potential" Leakage Calculator
  let rating = 4.5;
  const ratingMatch = lead.evidenceLink?.match(/Rating: ([\d.]+)/i);
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1]);
  } else if (lead.reviewCount < 10) {
    rating = 3.5; // Penalty for low social proof
  }

  const starGap = Math.max(0, 4.5 - rating);
  const reviewCount = Math.max(1, lead.reviewCount);
  
  // Niche-based conversion value (Industry standard estimates)
  const leadValueMap: Record<string, number> = {
    'Legal': 1500,
    'Medical': 1200,
    'HVAC': 800,
    'Plumbing': 600,
    'SaaS': 400,
    'Real Estate': 1000,
    'Default': 300
  };
  const valuePerConversion = leadValueMap[lead.niche] || leadValueMap['Default'];

  // Trust Loss: missing out on clients due to poor reputation
  // Heuristic: (Gap * Reviews) * Value * 0.05 conversion penalty
  const trustLoss = Math.round(starGap * reviewCount * valuePerConversion * 0.05);
  
  // Mobile Friction: High bounce rate from slow loading
  let mobilePenalty = 0;
  const ms = lead.mobileScore || 0;
  if (ms > 0 && ms < 40) mobilePenalty = valuePerConversion * 20; // Estimated 20 missed leads/month
  else if (ms >= 40 && ms < 70) mobilePenalty = valuePerConversion * 8; // Estimated 8 missed leads/month
  else if (ms >= 70 && ms < 85) mobilePenalty = valuePerConversion * 2;
  
  const total = trustLoss + mobilePenalty;
  
  // Tiered logic
  let tier: 'Red' | 'Orange' | 'Yellow' = 'Yellow';
  if (total > 20000 || starGap > 1.2) tier = 'Red';
  else if (total > 8000 || starGap > 0.5) tier = 'Orange';
  
  return {
    total,
    starGap,
    reviewCountImpact: reviewCount,
    mobilePenalty,
    trustLoss,
    tier
  };
}

export function calculateFrictionScore(lead: Lead): number {
  // Exact re-implementation of calcRevLeakageScore from source
  let score = 0;
  
  const ms = lead.mobileScore || 0;
  if (ms > 0 && ms < 50) score += 30;
  else if (ms >= 50 && ms < 70) score += 15;
  
  let rating = 0;
  const ratingMatch = lead.evidenceLink?.match(/Rating: ([\d.]+)/i);
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1]);
  }
  
  if (rating > 0 && rating < 3.5) score += 25;
  else if (rating >= 3.5 && rating < 4.0) score += 12;
  
  if (lead.recentComplaintQuote) score += 15;
  if (lead.painPoints) score += 10;
  
  return Math.min(score, 100);
}
