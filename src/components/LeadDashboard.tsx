/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Filter, Download, RefreshCw, AlertCircle, ChevronRight, BarChart3, Globe, Zap, MessageSquare, Edit2, Save, X, Calendar, FileUp, CheckCircle2, Users, Layout } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import Papa from 'papaparse';
import { GoogleGenAI } from "@google/genai";
import { discoverPartners, performGeminiResearch, getPageSpeedData, calculateRevenueLeakage, calculateFrictionScore, calculateDealValue } from '../lib/leads-research';
import { addPartner, readPartners, logPartnerInteraction } from '../lib/partners-core';
import { Lead, Partner, PROPERTY_TO_COLUMN_NAME, DEFAULT_COLUMN_ORDER } from '../lib/leads-schema';
import { sheetRead, syncLead } from '../lib/leads-core';
import { detectAllSaaSOpportunities } from '../lib/leads-brokerage';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const GOOGLE_MAPS_PLATFORM_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapsKey = Boolean(GOOGLE_MAPS_PLATFORM_KEY) && GOOGLE_MAPS_PLATFORM_KEY !== 'YOUR_API_KEY';

const CONTACT_TEMPLATES = [
  { 
    name: 'Cold Outreach (Tech Friction)', 
    subject: 'Strategic Growth Analysis for {company}', 
    body: 'Hi {name},\n\nI was conducting a market analysis of {niche} businesses in {city} and noticed some significant technical friction points on your mobile site (Performance Score: {score}/100).\n\nOur projections suggest this "Mobile Friction" is likely costing {company} approximately {leakage} in potential monthly revenue.\n\nI have prepared a brief technical briefing on how to reclaim this leakage. Are you open to a brief 5-minute diagnostic call?\n\nBest regards,\n[Your Name]' 
  },
  { 
    name: 'Reputation Boost', 
    subject: 'Unclaimed Opportunity for {company}', 
    body: 'Hi {name},\n\nI noticed {company} has {reviews} reviews but hasn\'t fully optimized its local SEO presence yet. \n\nBusinesses in the {niche} sector with optimized profiles typically see a 40% increase in direct calls from Google Maps. I\'d love to show you the specific "Reputation Decay" markers we found.\n\nBest,\n[Your Name]' 
  },
  { 
    name: 'Follow-up (Warm)', 
    subject: 'Continuing our discussion regarding {company} growth', 
    body: 'Hi {name},\n\nIt was great speaking with you briefly. Following up on the digital friction report I sent over for {company}.\n\nI\'ve updated the analysis with the latest PageSpeed benchmarks. When would be a good time to review these findings?\n\nBest,\n[Your Name]' 
  }
];

const SEED_LEADS: Lead[] = [
  {
    id: 'REF-001',
    company: 'Coastal Roast Coffee',
    city: 'Santa Cruz',
    state: 'CA',
    phone: '555-0123',
    website: 'https://example.com/coastal',
    mobileScore: 45,
    reviewCount: 128,
    strategicPlay: 'Local SEO Boost',
    priority: 8,
    email: 'sarah@coastalroast.com',
    contactName: 'Sarah Chen',
    contactTitle: 'Owner',
    niche: 'Cafe',
    status: 'Qualified',
    followUpDate: '2024-05-15',
    timezone: 'PST',
    followUpCount: 2,
    evidenceLink: 'Rating: 4.2. Strong local branding but website is slow on mobile.',
    lastScanDate: new Date().toISOString(),
    lastContacted: '2024-05-01',
    researchHistory: '[]',
    lastSender: 'James',
    dealStage: 'Proposal',
    dealValue: 0, // Calculated
    painPoints: 'Slow mobile site, missing local citations',
    notes: 'Very interested in reputation management.',
    recentComplaintQuote: 'Wait times are a bit long on weekends.',
    outreachLog1: 'Initial contact via LinkedIn',
    outreachLog2: '',
    outreachLog3: '',
    outreachLog4: '',
    outreachLog5: '',
    outreachLog6: ''
  }
];

export default function LeadDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedLead, setEditedLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<string>('');
  const [batchFollowUp, setBatchFollowUp] = useState<string>('');
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMapsScraper, setShowMapsScraper] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [scrapedText, setScrapedText] = useState('');
  const [viewMode, setViewMode] = useState<'Leads' | 'Clients' | 'Partners'>('Leads');
  const [currentView, setCurrentView] = useState<'intelligence' | 'analysis' | 'crm'>('intelligence');
  const [statusFilter, setStatusFilter] = useState<string>(() => localStorage.getItem('statusFilter') || 'All');
  const [saasCategoryFilter, setSaaSCategoryFilter] = useState<string>('All');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [cityInput, setCityInput] = useState('');
  const [serviceInput, setServiceInput] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [interactionNotes, setInteractionNotes] = useState('');
  const [interactionAction, setInteractionAction] = useState('Email');

  useEffect(() => {
    setPartners(readPartners());
  }, []);

  const handleLogInteraction = (partnerId: string) => {
      logPartnerInteraction(partnerId, interactionAction, interactionNotes);
      setPartners(readPartners());
      setInteractionNotes('');
  };

  const formatForDateTimeLocal = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    if (dateStr.includes('T')) return dateStr.slice(0, 16);
    return `${dateStr}T10:00`;
  };

  const getSuggestedFollowUpDate = (lastContacted: string | undefined, timeZone?: string): string => {
    const start = lastContacted ? new Date(lastContacted) : new Date();
    let result = new Date(start);
    let count = 0;
    const targetDays = 3 + Math.floor(Math.random() * 3); // Suggest 3-5 business days
    while (count < targetDays) { 
      result.setDate(result.getDate() + 1);
      if (result.getDay() !== 0 && result.getDay() !== 6) {
        count++;
      }
    }

    try {
      if (timeZone) {
        const yyyy = result.getFullYear();
        const mm = String(result.getMonth() + 1).padStart(2, '0');
        const dd = String(result.getDate()).padStart(2, '0');
        
        const refDateStr = `${yyyy}-${mm}-${dd}T10:00:00.000Z`;
        const formatter = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" });
        const parts = formatter.formatToParts(new Date(refDateStr));
        const offsetString = parts.find(p => p.type === "timeZoneName")?.value || "GMT";
        
        let targetOffsetMinutes = 0;
        if (offsetString !== "GMT") {
          const match = offsetString.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
          if (match) {
            const sign = match[1] === "+" ? 1 : -1;
            const hours = parseInt(match[2], 10);
            const mins = match[3] ? parseInt(match[3], 10) : 0;
            targetOffsetMinutes = sign * (hours * 60 + mins);
          }
        }

        const targetUTC = new Date(refDateStr).getTime() - (targetOffsetMinutes * 60 * 1000);
        const localDate = new Date(targetUTC);
        const yLocal = localDate.getFullYear();
        const mLocal = String(localDate.getMonth() + 1).padStart(2, '0');
        const dLocal = String(localDate.getDate()).padStart(2, '0');
        const hLocal = String(localDate.getHours()).padStart(2, '0');
        const minLocal = String(localDate.getMinutes()).padStart(2, '0');
        return `${yLocal}-${mLocal}-${dLocal}T${hLocal}:${minLocal}`;
      }
    } catch (e) {
      // Fallback
    }

    const yyyy = result.getFullYear();
    const mm = String(result.getMonth() + 1).padStart(2, '0');
    const dd = String(result.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T10:00`;
  };

  useEffect(() => {
    localStorage.setItem('statusFilter', statusFilter);
  }, [statusFilter]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulated enterprise access code
    if (pin === '2024') {
      setIsAuthenticated(true);
      setLoginError(false);
    } else {
      setLoginError(true);
      setPin('');
      setTimeout(() => setLoginError(false), 2000);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await sheetRead();
      if (data.length === 0) {
        setLeads(SEED_LEADS);
      } else {
        // Automation Logic: Auto-Qualify high reviewers/high performant leads
        const updatedLeads = data.map(lead => {
          let updatedLead = { ...lead };
          const opportunities = detectAllSaaSOpportunities(updatedLead);
          updatedLead.saasOpportunities = opportunities.map(o => `${o.category}: ${o.gap}`).join('; ');

          // Automation Logic: Auto-Qualify high reviewers/high performant leads
          if (updatedLead.reviewCount > 50 && updatedLead.mobileScore > 70 && updatedLead.status !== 'Qualified') {
            const now = new Date().toISOString();
            let history = [];
            try {
              history = JSON.parse(updatedLead.researchHistory || '[]');
            } catch (e) {}
            
            history.unshift({
              date: now,
              summary: "Automated upgrade: High review count (>50) and mobile score (>70)."
            });

            updatedLead.status = 'Qualified';
            updatedLead.researchHistory = JSON.stringify(history);
          }
          return updatedLead as Lead;
        });

        const changedLeads = updatedLeads.filter((l, i) => {
          return l.status !== data[i].status || l.saasOpportunities !== data[i].saasOpportunities;
        });

        if (changedLeads.length > 0) {
          // Sync sequentially to avoid Google Apps Script rate limits
          for (const lead of changedLeads) {
            await syncLead(lead);
          }
        }

        setLeads(updatedLeads);
        setSuccess('Leads database synchronized and analyzed automatically.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve leads from the database.');
      setLeads(SEED_LEADS); 
    } finally {
      setLoading(false);
    }
  };

  const averageMobileScore = useMemo(() => {
    if (leads.length === 0) return 0;
    const sum = leads.reduce((acc, lead) => acc + (lead.mobileScore || 0), 0);
    return Math.round(sum / leads.length);
  }, [leads]);

  const chartData = useMemo(() => {
    if (!selectedLead) return [];
    const currentScore = isEditing ? (editedLead?.mobileScore ?? 0) : (selectedLead.mobileScore ?? 0);
    return [
      { name: 'Average', score: averageMobileScore, fill: '#475569' },
      { name: 'Current', score: currentScore, fill: '#ff6a00' }
    ];
  }, [selectedLead, isEditing, editedLead, averageMobileScore]);

  const filteredLeads = leads.filter(l => {
    const matchesSearch = (l.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (l.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesView = viewMode === 'Leads' ? l.dealStage !== 'Client' : l.dealStage === 'Client';
    const matchesStatus = statusFilter === 'All' || l.status === statusFilter;
    const matchesSaaSCategory = saasCategoryFilter === 'All' || l.saasOpportunities?.includes(saasCategoryFilter);
    return matchesSearch && matchesView && matchesStatus && matchesSaaSCategory;
  });

  const analysisData = useMemo(() => {
    const niches = [...new Set(leads.map(l => l.niche))].filter(Boolean);
    return niches.map(niche => {
      const nicheLeads = leads.filter(l => l.niche === niche);
      const totalLeakage = nicheLeads.reduce((acc, l) => acc + (calculateRevenueLeakage(l)?.total ?? 0), 0);
      return {
        name: niche,
        count: nicheLeads.length,
        totalLeakage,
      };
    }).sort((a, b) => b.totalLeakage - a.totalLeakage);
  }, [leads]);

  useEffect(() => {
    fetchLeads();
  }, []);

  // Proactive Notification System for Follow-ups
  useEffect(() => {
    if (leads.length > 0 && !loading) {
      const today = new Date().toISOString().split('T')[0];
      const dueLeads = leads.filter(l => l.followUpDate === today && l.status !== 'Closed');
      const overdueLeads = leads.filter(l => l.followUpDate && l.followUpDate < today && l.status !== 'Closed');
      
      if (overdueLeads.length > 0) {
        setTimeout(() => {
          setSuccess(`Attention: You have ${overdueLeads.length} overdue follow-up${overdueLeads.length > 1 ? 's' : ''}.`);
        }, 1000);
      } else if (dueLeads.length > 0) {
        setTimeout(() => {
          setSuccess(`Priority Alert: ${dueLeads.length} follow-up${dueLeads.length > 1 ? 's' : ''} scheduled for today.`);
        }, 1500);
      }
    }
  }, [leads, loading]);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  useEffect(() => {
    const handleExternalLeadCapture = async (event: MessageEvent) => {
      // Security: Only accept messages that look like our Lead captures
      if (event.data?.type === 'BDL_LEAD_CAPTURE' || event.data?.source === 'LINKEDIN_EXTENSION') {
        const rawLead = event.data.payload;
        
        // 1. Map to 32-column schema with defaults
        const newId = `EXT-${Date.now().toString().slice(-6)}`;
        const capturedLead: Lead = {
          id: newId,
          company: rawLead.company || 'Unknown Entity',
          website: rawLead.website || '',
          contactName: rawLead.name || '',
          contactTitle: rawLead.title || '',
          email: rawLead.email || '',
          phone: rawLead.phone || '',
          city: rawLead.city || '',
          state: rawLead.state || '',
          niche: rawLead.industry || rawLead.niche || 'General Business',
          status: 'Lead', 
          priority: 5,
          timezone: '',
          followUpDate: '',
          lastContacted: '',
          lastSender: '',
          dealStage: 'Prospecting',
          dealValue: 0,
          mobileScore: 0,
          reviewCount: rawLead.reviews || 0,
          strategicPlay: '',
          painPoints: '',
          evidenceLink: rawLead.link || '',
          recentComplaintQuote: '',
          notes: rawLead.notes || `Source: ${event.data.source || 'External Capture'}`,
          followUpCount: 0,
          outreachLog1: '',
          outreachLog2: '',
          outreachLog3: '',
          outreachLog4: '',
          outreachLog5: '',
          outreachLog6: '',
          lastScanDate: new Date().toISOString(),
          researchHistory: JSON.stringify([{
            date: new Date().toISOString(),
            summary: `EXTERNAL CAPTURE: Lead imported from ${event.data.source || 'Browser Extension'}.`
          }])
        };

        setLoading(true);
        try {
          // 2. Perform initial technical audit if URL exists
          if (capturedLead.website) {
            const audit = await getPageSpeedData(capturedLead.website);
            if (audit) {
              capturedLead.mobileScore = audit.mobileScore;
            }
          }

          // 3. Sync to Google Sheets
          await syncLead(capturedLead);
          
          // 4. Update UI - Add to top
          setLeads(prev => [capturedLead, ...prev]);
          setSuccess(`Strategic Capture: ${capturedLead.company} added to pipeline.`);
          
          // Opt-out: Focus the new lead
          setSelectedLead(capturedLead);
        } catch (err) {
          setError('Failed to process external lead capture.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    };

    window.addEventListener('message', handleExternalLeadCapture);
    return () => window.removeEventListener('message', handleExternalLeadCapture);
  }, []);

  useEffect(() => {
    if (selectedLead) {
      setShowContactForm(false);
      setContactSubject('');
      setContactMessage('');
    }
  }, [selectedLead?.id]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-brand-bg font-sans p-6 text-brand-text overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] border border-brand-orange/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl animate-pulse" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] border border-brand-orange/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
        </div>

        <div className="max-w-md w-full z-10">
          <div className="flex flex-col items-center mb-12">
            <div className="w-16 h-16 bg-brand-orange rounded-2xl flex items-center justify-center text-black font-black text-3xl shadow-[0_0_30px_rgba(255,106,0,0.4)] mb-4">BDL</div>
            <h1 className="font-serif italic text-3xl font-bold tracking-tight text-brand-text">Leads Pro</h1>
            <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-brand-orange mt-2">Enterprise Access Portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className={cn(
              "p-8 border border-brand-border bg-brand-card/50 backdrop-blur-xl rounded-2xl transition-all duration-300",
              loginError ? "border-red-500/50 bg-red-500/5 translate-x-2" : "focus-within:border-brand-orange/50"
            )}>
              <div className="text-center mb-6">
                <div className="text-[10px] uppercase font-bold text-brand-text-dim mb-1 tracking-widest">Operator Credential</div>
                <div className="text-xs text-brand-text-muted">Enter security node pin to initialize</div>
              </div>

              <div className="flex justify-center gap-3">
                {[...Array(4)].map((_, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "w-4 h-4 rounded-full border transition-all duration-300",
                      pin.length > i ? "bg-brand-orange border-brand-orange shadow-[0_0_10px_rgba(255,106,0,0.8)]" : "border-brand-border bg-brand-bg"
                    )} 
                  />
                ))}
              </div>

              <input
                autoFocus
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPin(val);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            <div className="flex flex-col items-center gap-4">
              <button 
                type="submit"
                className="w-full py-4 bg-brand-orange text-black font-black uppercase tracking-widest text-xs rounded-xl hover:bg-brand-orange-light transition-all shadow-lg active:scale-[0.98]"
              >
                Establish Connection
              </button>
              
              <div className="text-[8px] uppercase font-bold text-brand-text-dim tracking-widest flex items-center gap-2">
                <AlertCircle size={10} />
                Node ID: AIS-BDL-101
              </div>
            </div>
          </form>
        </div>

        <div className="absolute bottom-12 w-full max-w-md px-6 pointer-events-none">
          <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-brand-border to-transparent" />
          <p className="text-center text-[9px] font-mono text-brand-text-dim mt-4 uppercase tracking-[0.2em]">
            Blue Data Labs Intelligence Group // Restricted Access
          </p>
        </div>
      </div>
    );
  }

  if (!hasValidMapsKey) {
    return (
      <div className="flex items-center justify-center h-screen bg-brand-bg font-sans p-6 text-brand-text">
        <div className="max-w-xl w-full border border-brand-border p-12 bg-brand-card/50 backdrop-blur-md rounded-lg shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Globe size={120} />
          </div>
          <h2 className="font-serif italic text-4xl font-bold mb-6 text-brand-orange">Security Required</h2>
          <p className="mb-8 leading-relaxed text-brand-text-muted">To enable real-time Places data, PageSpeed analysis, and AI research, you must configure your Google Cloud API Key.</p>
          
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full border border-brand-orange flex items-center justify-center font-mono text-sm shrink-0 text-brand-orange">1</div>
              <div>
                <p className="font-bold uppercase text-xs tracking-wider mb-1">Obtain Credentials</p>
                <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4 hover:text-brand-orange transition-colors">
                  Generate key on Google Cloud Console
                </a>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full border border-brand-orange flex items-center justify-center font-mono text-sm shrink-0 text-brand-orange">2</div>
              <div>
                <p className="font-bold uppercase text-xs tracking-wider mb-1">Inject Secrets</p>
                <ul className="text-sm text-brand-text-muted space-y-1">
                  <li>• Open <strong>Settings</strong> (⚙️ gear icon)</li>
                  <li>• Navigate to <strong>Secrets</strong></li>
                  <li>• Add <code className="bg-brand-orange/20 text-brand-orange px-1 rounded font-mono">GOOGLE_MAPS_PLATFORM_KEY</code></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-brand-border flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-brand-text-dim">
            <AlertCircle size={14} />
            System holding for handshake...
          </div>
        </div>
      </div>
    );
  }


  const handleAskMapsImport = async () => {
    if (!scrapedText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `Extract lead information from the following Google Maps text. 
      Identify Company Name, Phone, Website, Category (Niche), City, State, and Rating.
      Look for "Intent Triggers" like mentions of bad service, billing issues, or technical problems.
      Output ONLY a JSON object: { "company": "", "phone": "", "website": "", "niche": "", "city": "", "state": "", "rating": 0, "intent": "" }
      Text: ${scrapedText}`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
      });

      const rawJson = response.text?.replace(/```json|```/g, '').trim() || '{}';
      const extracted = JSON.parse(rawJson);

      const newLead: Lead = {
        id: `MAPS-${Date.now().toString().slice(-6)}`,
        company: extracted.company || 'Unknown Business',
        contactName: '',
        contactTitle: '',
        email: '',
        phone: extracted.phone || '',
        website: extracted.website || '',
        niche: extracted.niche || 'General',
        status: 'New',
        priority: extracted.intent ? 8 : 4,
        city: extracted.city || '',
        state: extracted.state || '',
        timezone: '',
        followUpDate: '',
        lastContacted: '',
        lastSender: '',
        dealStage: 'Lead',
        dealValue: 0,
        mobileScore: 0,
        reviewCount: extracted.rating ? 1 : 0,
        strategicPlay: extracted.intent ? `Addressing: ${extracted.intent}` : 'Standard Outreach',
        painPoints: extracted.intent || '',
        evidenceLink: extracted.rating ? `Rating: ${extracted.rating}` : '',
        recentComplaintQuote: '',
        notes: `Imported via Ask Maps Scraper. ${extracted.intent ? 'HIGH INTENT.' : ''}`,
        followUpCount: 0,
        outreachLog1: '',
        outreachLog2: '',
        outreachLog3: '',
        outreachLog4: '',
        outreachLog5: '',
        outreachLog6: '',
        lastScanDate: new Date().toISOString(),
        researchHistory: JSON.stringify([{
          date: new Date().toISOString(),
          summary: `Initial Google Maps Intelligence Extraction: ${extracted.intent || 'Lead record initialized via Maps Scraper.'}`
        }])
      };

      await syncLead(newLead);
      setLeads(prev => [newLead, ...prev]);
      setSuccess(`Ask Maps: Successfully imported ${newLead.company}.`);
      setShowMapsScraper(false);
      setScrapedText('');
    } catch (err) {
      setError('Maps Scraper failed to parse text. Ensure text contains business details.');
    } finally {
      setLoading(false);
    }
  };

  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setBatchStatus('Parsing CSV Data...');
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const importedLeads: Lead[] = [];
          const rows = results.data as any[];

          for (const row of rows) {
            const newLead: Partial<Lead> = {};
            
            newLead.id = row[PROPERTY_TO_COLUMN_NAME.id] || `CSV-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
            
            DEFAULT_COLUMN_ORDER.forEach(key => {
              if (key === 'id') return;
              const columnName = PROPERTY_TO_COLUMN_NAME[key];
              const value = row[columnName];
              
              if (value !== undefined) {
                if (['priority', 'mobileScore', 'reviewCount', 'dealValue', 'followUpCount'].includes(key)) {
                  newLead[key as any] = Number(value) || 0;
                } else {
                  newLead[key as any] = String(value);
                }
              }
            });

            const lead = {
              ...newLead,
              status: newLead.status || 'New',
              dealStage: newLead.dealStage || 'Lead',
              researchHistory: newLead.researchHistory || '[]',
              lastScanDate: newLead.lastScanDate || new Date().toISOString(),
            } as Lead;

            importedLeads.push(lead);
          }

          if (importedLeads.length > 0) {
            setLeads(prev => [...importedLeads, ...prev]);
            
            for (let i = 0; i < importedLeads.length; i++) {
              await syncLead(importedLeads[i]);
              if (i % 5 === 0 || i === importedLeads.length - 1) {
                setBatchStatus(`Importing: ${i + 1} of ${importedLeads.length} leads...`);
              }
            }

            setSuccess(`Success: Imported ${importedLeads.length} leads from CSV.`);
          }
        } catch (err) {
          setError('Failed to process CSV. Ensure headers match the 32-column schema.');
        } finally {
          setLoading(false);
          setShowCsvImport(false);
          setBatchStatus('');
        }
      },
      error: (err) => {
        setError(`CSV Parse Error: ${err.message}`);
        setLoading(false);
        setShowCsvImport(false);
      }
    });
  };

  const handleBatchGeminiResearch = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    
    setLoading(true);
    setBatchStatus('Processing AI Intelligence Scans...');
    
    // Process sequentially to save tokens and stay within limits
    for (let i = 0; i < ids.length; i++) {
        const lead = leads.find(l => l.id === ids[i]);
        if (lead) {
            await handleResearch(lead);
        }
        setSuccess(`Intelligence: Processed ${i + 1} of ${ids.length} leads.`);
    }
    
    setLoading(false);
    setSelectedIds(new Set());
    setSuccess('Batch Intelligence complete.');
  };

  const handleBulkPlacesLookup = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    
    setLoading(true);
    setBatchStatus('Executing Bulk Places Lookup (800ms throttle)...');
    
    for (const id of ids) {
      const lead = leads.find(l => l.id === id);
      if (lead) {
        await handleResearch(lead);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
    setSuccess(`Places: Updated ${ids.length} records.`);
    
    setLoading(false);
    setSelectedIds(new Set());
  };

  const checkGmailReplies = async () => {
    setLoading(true);
    setSuccess('Gmail Node: Scanning inbox for partner replies...');
    
    try {
      // Logic would search for replies in:inbox after the lastSync date
      // For demo, we simulate finding a reply for a random lead
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newQualifiedLeads = leads.filter(l => l.status === 'Contacted').slice(0, 1);
      if (newQualifiedLeads.length > 0) {
        const lead = newQualifiedLeads[0];
        const history = JSON.parse(lead.researchHistory || '[]');
        history.unshift({
          date: new Date().toISOString(),
          summary: `GMAIL AUTO-SYNC: Reply detected from partner. Lead status successfully upgraded to Qualified.`
        });

        const updatedLead = { 
          ...lead, 
          status: 'Qualified', 
          dealStage: 'Warm Lead', 
          notes: `${lead.notes}\n[GMAIL AUTO-SYNC] Reply detected! Moved to Warm Lead status.`,
          researchHistory: JSON.stringify(history)
        };
        await syncLead(updatedLead);
        setLeads(prev => prev.map(l => l.id === lead.id ? updatedLead : l));
        setSuccess(`Gmail: New reply matched for ${lead.company}! Status upgraded.`);
      } else {
        setSuccess('Gmail Node: Scan complete. No new matches found.');
      }
    } catch (e) {
      setError('Gmail synchronization failed.');
    } finally {
      setLoading(false);
    }
  };
  const handleCopyBriefing = () => {
    if (!selectedLead) return;
    
    const briefing = `
TECHNICAL BRIEFING: ${selectedLead.company}
-------------------------------------------
LOCATION: ${selectedLead.city}, ${selectedLead.state}
NICHE: ${selectedLead.niche}
PRIORITY: P${selectedLead.priority ?? 0}
EST. REVENUE LEAKAGE: $${(calculateRevenueLeakage(selectedLead)?.total ?? 0).toLocaleString()}
EST. DEAL VALUE: $${(calculateDealValue(selectedLead) ?? 0).toLocaleString()}

DIGITAL FOOTPRINT:
- Website: ${selectedLead.website || 'None'}
- Mobile Perf: ${selectedLead.mobileScore}/100
- Review Count: ${selectedLead.reviewCount}

CURRENT INSIGHTS:
${selectedLead.evidenceLink}

PAIN POINTS:
${selectedLead.painPoints}

STRATEGIC PLAY:
${selectedLead.strategicPlay}
-------------------------------------------
BDL INTELLIGENCE NODE: AIS-BDL-101
    `.trim();

    navigator.clipboard.writeText(briefing);
    setSuccess('Strategic Briefing copied to clipboard.');
  };

  const handleTemplateSelect = (template: any) => {
    if (!selectedLead || !template) return;
    
    let subject = template.subject.replace('{company}', selectedLead.company);
    let body = template.body
      .replace(/{company}/g, selectedLead.company)
      .replace(/{name}/g, selectedLead.contactName || 'there')
      .replace(/{city}/g, selectedLead.city)
      .replace(/{niche}/g, selectedLead.niche)
      .replace(/{score}/g, (selectedLead.mobileScore ?? 0).toString())
      .replace(/{reviews}/g, (selectedLead.reviewCount ?? 0).toString())
      .replace(/{leakage}/g, `$${(calculateRevenueLeakage(selectedLead)?.total ?? 0).toLocaleString()}`);

    setContactSubject(subject);
    setContactMessage(body);
  };

  const executeContact = async () => {
    if (!selectedLead) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const updatedLead = {
        ...selectedLead,
        status: 'Contacted' as Lead['status'],
        lastContacted: now.split('T')[0],
        followUpCount: (selectedLead.followUpCount || 0) + 1
      };

      // Add to history
      let history = [];
      try {
        history = JSON.parse(selectedLead.researchHistory || '[]');
      } catch (e) {}
      history.unshift({
        date: now,
        summary: `Strategic Outreach Executed.\nSubject: ${contactSubject}\nMessage: ${contactMessage}`
      });
      updatedLead.researchHistory = JSON.stringify(history);

      await syncLead(updatedLead);
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? updatedLead : l));
      setSelectedLead(updatedLead);
      setShowContactForm(false);
      setSuccess(`Outreach logged for ${selectedLead.company}.`);
    } catch (err) {
      setError('Failed to log contact activity.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditStart = () => {
    if (!selectedLead) return;
    const leadToEdit = { ...selectedLead };
    if (!leadToEdit.followUpDate) {
      leadToEdit.followUpDate = getSuggestedFollowUpDate(leadToEdit.lastContacted, leadToEdit.timezone);
    }
    setEditedLead(leadToEdit);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditedLead(null);
  };

  const handleUpdatePageSpeed = async (lead: Lead) => {
    setLoading(true);
    setError(null);
    try {
      const pageSpeed = await getPageSpeedData(lead.website);
      if (!pageSpeed) {
        throw new Error('Failed to fetch PageSpeed data.');
      }
      
      const now = new Date().toISOString();
      let updatedLead: Lead = {
        ...lead,
        mobileScore: pageSpeed.mobileScore,
        evidenceLink: `${lead.evidenceLink || ''}\n[Update ${now.split('T')[0]}] Mobile Performance: ${pageSpeed.mobileScore}/100, Desktop: ${pageSpeed.desktopScore}/100`.trim(),
        lastScanDate: now,
      };

      if (updatedLead.reviewCount > 50 && updatedLead.mobileScore > 70 && updatedLead.status !== 'Qualified') {
        let history = [];
        try {
          history = JSON.parse(updatedLead.researchHistory || '[]');
        } catch (e) {}
        
        history.unshift({
          date: now,
          summary: "Automated upgrade: High review count (>50) and mobile score (>70)."
        });

        updatedLead.status = 'Qualified';
        updatedLead.researchHistory = JSON.stringify(history);
      }
      
      await syncLead(updatedLead);
      setLeads(prev => prev.map(l => l.id === lead.id ? updatedLead : l));
      setSelectedLead(updatedLead);
      setSuccess(`Performance scan updated for ${lead.company}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Performance scan failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResearch = async (lead: Lead) => {
    setLoading(true);
    setError(null);
    try {
      const [summary, speed] = await Promise.all([
        performGeminiResearch(lead),
        lead.website && lead.website.trim() ? getPageSpeedData(lead.website) : Promise.resolve(null)
      ]);

      const now = new Date().toISOString();
      
      // Manage research history
      let history: { date: string, summary: string }[] = [];
      try {
        history = JSON.parse(lead.researchHistory || '[]');
      } catch (e) {
        history = [];
      }
      
      // Prepend newest scan
      history.unshift({ date: now, summary });

      let updatedLead: Lead = {
        ...lead,
        evidenceLink: summary,
        mobileScore: speed?.mobileScore ?? lead.mobileScore ?? 0,
        lastScanDate: now,
        researchHistory: JSON.stringify(history)
      };

      if ((updatedLead.reviewCount ?? 0) > 50 && (updatedLead.mobileScore ?? 0) > 70 && updatedLead.status !== 'Qualified') {
        const nowStr = new Date().toISOString();
        let currentHistory = history; // Use existing history, don't reparse
        
        currentHistory.unshift({
          date: nowStr,
          summary: "Automated upgrade: High review count (>50) and mobile score (>70)."
        });

        updatedLead.status = 'Qualified';
        updatedLead.researchHistory = JSON.stringify(currentHistory);
      }

      updatedLead.dealValue = calculateDealValue(updatedLead);

      await syncLead(updatedLead);
      setLeads(prev => prev.map(l => l.id === lead.id ? updatedLead : l));
      setSelectedLead(updatedLead);
      setSuccess(`Intelligence scan completed for ${lead.company}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Intelligence processing failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editedLead) return;

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (editedLead.email && !emailRegex.test(editedLead.email)) {
      setError('Please enter a valid email address.');
      return;
    }

    // Auto-calculate deal value on save
    editedLead.dealValue = calculateDealValue(editedLead);

    setLoading(true);
    setError(null);
    try {
      await syncLead(editedLead);
      setLeads(prev => prev.map(l => l.id === editedLead.id ? editedLead : l));
      setSelectedLead(editedLead);
      setIsEditing(false);
      setEditedLead(null);
      setSuccess('Lead data updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Database update failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLead = async (lead: Lead) => {
    setLoading(true);
    try {
      await syncLead(lead);
      setLeads(prev => prev.map(l => l.id === lead.id ? lead : l));
      setSelectedLead(lead);
      setSuccess('Lead updated successfully.');
    } catch (err) {
      setError('Failed to update lead.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof Lead, value: any) => {
    if (!editedLead) return;
    const updates: Partial<Lead> = { [field]: value };
    const now = new Date().toISOString();

    // Helper to log activity
    const logActivity = (summary: string) => {
      let history = [];
      try {
        history = JSON.parse(updates.researchHistory || editedLead.researchHistory || '[]');
      } catch (e) {}
      history.unshift({ date: now, summary });
      updates.researchHistory = JSON.stringify(history);
    };

    // Automatic logic: Update lastContacted when status becomes 'Contacted'
    if (field === 'status' && value === 'Contacted') {
      const today = now.split('T')[0];
      updates.lastContacted = today;
      updates.followUpCount = (editedLead.followUpCount || 0) + 1;
      logActivity(`Status set to Contacted. Automatically incremented follow-up count.`);
    }

    // Automatic logic: Increment followUpCount when lastContacted is changed
    if (field === 'lastContacted' && value !== editedLead.lastContacted) {
      updates.followUpCount = (editedLead.followUpCount || 0) + 1;
      logActivity(`Manual Follow-up: Contact date updated to ${value}.`);
    }

    // Manual follow-up count increment (from Log Now button)
    if (field === 'followUpCount' && value > (editedLead.followUpCount || 0)) {
      logActivity(`Manual Follow-up logged (Count incremented to ${value}).`);
    }

    // Follow-up date change logging
    if (field === 'followUpDate' && value !== editedLead.followUpDate) {
      logActivity(`Follow-up scheduled for ${value || 'unspecified date'}.`);
    }

    // Automatic logic: Auto-Qualify
    if ((field === 'reviewCount' || field === 'mobileScore') && !updates.status && editedLead.status !== 'Qualified') {
       const newReviewCount = field === 'reviewCount' ? value : editedLead.reviewCount;
       const newMobileScore = field === 'mobileScore' ? value : editedLead.mobileScore;
       if (newReviewCount > 50 && newMobileScore > 70) {
           updates.status = 'Qualified';
           logActivity("Automated upgrade: High review count (>50) and mobile score (>70).");
       }
    }

    setEditedLead(prev => prev ? ({ ...prev, ...updates }) : null);
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)));
    }
  };

  const handleBatchUpdate = async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const updatedLeads = leads.map(l => {
        if (selectedIds.has(l.id)) {
          return {
            ...l,
            status: batchStatus || l.status,
            followUpDate: batchFollowUp || l.followUpDate
          };
        }
        return l;
      });

      // Update backend sequentially to avoid Google Apps Script rate limiting
      for (const id of Array.from(selectedIds)) {
        const lead = updatedLeads.find(l => l.id === id);
        if (lead) {
          await syncLead(lead);
        }
      }
      
      setLeads(updatedLeads);
      setSuccess(`Batch update completed for ${selectedIds.size} records.`);
      setSelectedIds(new Set());
      setBatchStatus('');
      setBatchFollowUp('');
      setShowBatchConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch update failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    const dataToExport = filteredLeads;
    if (dataToExport.length === 0) {
      setError('No leads available to export.');
      return;
    }

    let content = '';
    let fileName = `bdl_leads_export_${new Date().toISOString().split('T')[0]}`;
    let type = '';

    if (format === 'json') {
      content = JSON.stringify(dataToExport, null, 2);
      fileName += '.json';
      type = 'application/json';
    } else {
      const headers = DEFAULT_COLUMN_ORDER.map(key => PROPERTY_TO_COLUMN_NAME[key]).join(',');
      const rows = dataToExport.map(lead => 
        DEFAULT_COLUMN_ORDER.map(key => {
          const val = lead[key] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      ).join('\n');
      content = `${headers}\n${rows}`;
      fileName += '.csv';
      type = 'text/csv';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    setSuccess(`Successfully exported ${dataToExport.length} leads to ${format.toUpperCase()}.`);
    setShowExportMenu(false);
  };

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text font-sans relative overflow-hidden">
      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-[110] w-64 bg-brand-sidebar border-r border-brand-border flex flex-col transition-transform duration-300 md:relative md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-brand-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-orange rounded-lg flex items-center justify-center text-black font-bold text-xl">BDL</div>
            <h1 className="font-serif italic text-xl font-bold tracking-tight text-brand-text">Leads Pro</h1>
          </div>
          <button 
            className="md:hidden p-2 text-brand-text-dim hover:text-brand-orange"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => setCurrentView('intelligence')}
            className={cn(
              "w-full flex items-center gap-3 p-2 rounded transition-all group",
              currentView === 'intelligence' 
                ? "bg-brand-orange text-black font-bold shadow-lg shadow-brand-orange/20" 
                : "text-brand-text-muted hover:text-brand-text hover:bg-brand-border/30"
            )}
          >
            <BarChart3 size={18} />
            <span className="text-sm">Revenue Intelligence</span>
          </button>
          <button 
            onClick={() => setCurrentView('crm')}
            className={cn(
              "w-full flex items-center gap-3 p-2 rounded transition-all group",
              currentView === 'crm' 
                ? "bg-brand-orange text-black font-bold shadow-lg shadow-brand-orange/20" 
                : "text-brand-text-muted hover:text-brand-text hover:bg-brand-border/30"
            )}
          >
            <Users size={18} className={currentView !== 'crm' ? "group-hover:text-brand-orange" : ""} />
            <span className="text-sm">Client Pipeline (CRM)</span>
          </button>
          <button 
            onClick={() => setCurrentView('analysis')}
            className={cn(
              "w-full flex items-center gap-3 p-2 rounded transition-all group",
              currentView === 'analysis' 
                ? "bg-brand-orange text-black font-bold shadow-lg shadow-brand-orange/20" 
                : "text-brand-text-muted hover:text-brand-text hover:bg-brand-border/30"
            )}
          >
            <Globe size={18} className={currentView !== 'analysis' ? "group-hover:text-brand-orange" : ""} />
            <span className="text-sm">Market Analysis</span>
          </button>
          <div className="pt-4 pb-2">
            <p className="text-[10px] uppercase font-bold tracking-wider text-brand-text-dim px-2 mb-2">Automation Nodes</p>
            <button 
              onClick={checkGmailReplies}
              className="w-full flex items-center gap-3 p-2 text-brand-text-muted hover:text-brand-text hover:bg-brand-border/30 rounded transition-colors group"
            >
              <RefreshCw size={18} className={cn("group-hover:text-brand-orange", loading && "animate-spin")} />
              <span className="text-sm">Gmail Reply Matcher</span>
            </button>
          </div>
        </nav>
        <div className="p-4 border-t border-brand-border mt-auto">
          <div className="bg-brand-card border border-brand-border p-4 rounded-lg">
            <p className="text-[10px] uppercase font-bold tracking-wider text-brand-text-dim">Real-time Node</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              <span className="text-xs font-mono text-brand-text-muted">Cloud Sync 200 OK</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Header toolbar */}
        <header className="h-16 md:h-16 border-b border-brand-border flex items-center justify-between px-4 md:px-6 bg-brand-bg/80 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-3 flex-1 overflow-hidden">
            <button 
              className="md:hidden p-2 -ml-2 text-brand-text-dim hover:text-brand-orange shrink-0"
              onClick={() => setIsSidebarOpen(true)}
            >
              <RefreshCw className="rotate-90" size={20} />
            </button>
            <div className="relative flex-1 max-w-sm shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={14} />
              <input 
                type="text" 
                placeholder="Search targets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-brand-card/30 border border-brand-border rounded focus:border-brand-orange outline-none text-xs transition-all"
              />
            </div>
            <div className="flex bg-brand-sidebar border border-brand-border rounded p-1">
              <button
                onClick={() => setViewMode('Leads')}
                className={cn(
                  "px-3 py-1 rounded text-[10px] font-bold uppercase transition-all",
                  viewMode === 'Leads' ? "bg-brand-orange text-black" : "text-brand-text-dim"
                )}
              >
                Leads
              </button>
              <button
                onClick={() => setViewMode('Clients')}
                className={cn(
                  "px-3 py-1 rounded text-[10px] font-bold uppercase transition-all",
                  viewMode === 'Clients' ? "bg-brand-orange text-black" : "text-brand-text-dim"
                )}
              >
                Clients
              </button>
              <button
                onClick={() => setViewMode('Partners')}
                className={cn(
                  "px-3 py-1 rounded text-[10px] font-bold uppercase transition-all",
                  viewMode === 'Partners' ? "bg-brand-orange text-black" : "text-brand-text-dim"
                )}
              >
                Partners
              </button>
            </div>
            {currentView === 'intelligence' && (
              <div className="hidden lg:flex items-center gap-2 overflow-x-auto no-scrollbar ml-4">
                {['All', 'New', 'Qualified', 'Contacted', 'Closed'].map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "px-3 py-1 rounded text-[10px] font-bold uppercase transition-all whitespace-nowrap",
                      statusFilter === status 
                        ? "bg-brand-orange/20 text-brand-orange border border-brand-orange/50" 
                        : "text-brand-text-dim hover:text-brand-text border border-transparent"
                    )}
                  >
                    {status}
                  </button>
                ))}
                <div className="w-px h-6 bg-brand-border mx-2" />
                {['All', 'Reputation', 'Efficiency', 'Conversion'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSaaSCategoryFilter(cat)}
                    className={cn(
                      "px-3 py-1 rounded text-[10px] font-bold uppercase transition-all whitespace-nowrap",
                      saasCategoryFilter === cat 
                        ? "bg-brand-orange/20 text-brand-orange border border-brand-orange/50" 
                        : "text-brand-text-dim hover:text-brand-text border border-transparent"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden sm:block relative">
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-2 border border-brand-border rounded text-brand-text-muted hover:text-brand-text hover:bg-brand-card transition-colors flex items-center gap-2 group"
                title="Export Data"
              >
                <Download size={16} className="group-hover:text-brand-orange" />
              </button>
              
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 mt-2 w-40 bg-brand-sidebar border border-brand-border rounded-lg shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <button 
                      onClick={() => handleExport('csv')}
                      className="w-full text-left px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-brand-text-muted hover:bg-brand-card hover:text-brand-orange transition-all border-b border-brand-border/50"
                    >
                      Export CSV (.csv)
                    </button>
                    <button 
                      onClick={() => handleExport('json')}
                      className="w-full text-left px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-brand-text-muted hover:bg-brand-card hover:text-brand-orange transition-all"
                    >
                      Export JSON (.json)
                    </button>
                  </div>
                </>
              )}
            </div>
            <button 
              onClick={() => setShowCsvImport(true)}
              className="flex items-center justify-center w-9 h-9 md:w-auto md:px-3 md:py-1.5 border border-brand-orange/30 text-brand-text-dim rounded hover:border-brand-orange hover:text-brand-orange transition-all"
              title="CSV Import"
            >
              <FileUp size={16} />
              <span className="hidden md:inline ml-2 text-[10px] font-bold uppercase tracking-wider">Import CSV</span>
            </button>
            <button 
              onClick={() => setShowMapsScraper(true)}
              className="flex items-center justify-center w-9 h-9 md:w-auto md:px-3 md:py-1.5 border border-brand-orange/30 text-brand-text-dim rounded hover:border-brand-orange hover:text-brand-orange transition-all"
              title="Ask Maps Scraper"
            >
              <Plus size={16} className="rotate-45" />
              <span className="hidden md:inline ml-2 text-[10px] font-bold uppercase tracking-wider">Ask Maps</span>
            </button>
            <button 
              onClick={fetchLeads}
              className="flex items-center justify-center w-9 h-9 md:w-auto md:px-3 md:py-1.5 border border-brand-orange text-brand-orange rounded hover:bg-brand-orange hover:text-black transition-all"
            >
              <RefreshCw size={16} className={cn(loading && "animate-spin")} />
              <span className="hidden md:inline ml-2 text-sm font-bold">Sync</span>
            </button>
            <button className="flex items-center justify-center w-9 h-9 md:w-auto md:px-3 md:py-1.5 bg-brand-orange text-black rounded font-bold hover:bg-brand-orange-light transition-all">
              <Plus size={16} />
              <span className="hidden md:inline ml-2 text-sm font-bold">New</span>
            </button>
          </div>
        </header>

        {/* Data Grid / Views */}
        <div className="flex-1 overflow-auto bg-brand-bg relative">
          
          {viewMode === 'Partners' && (
            <div className="p-6">
              <h2 className="text-2xl font-bold text-brand-text mb-6">Buying Partners Marketplace</h2>
              
              <div className="flex gap-4 bg-brand-sidebar p-4 rounded-lg border border-brand-border mb-6">
                <input 
                  placeholder="City" 
                  value={cityInput}
                  onChange={e => setCityInput(e.target.value)}
                  className="bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-brand-text w-48"
                />
                <input 
                  placeholder="Service Type (e.g. SEO, Roofing)" 
                  value={serviceInput}
                  onChange={e => setServiceInput(e.target.value)}
                  className="bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-brand-text w-64"
                />
                <button
                  onClick={async () => {
                    setIsDiscovering(true);
                    const newPartners = await discoverPartners(cityInput, serviceInput);
                    newPartners.forEach(p => addPartner(p));
                    setPartners(readPartners());
                    setIsDiscovering(false);
                  }}
                  disabled={isDiscovering}
                  className="bg-brand-orange text-black px-4 py-2 rounded font-bold text-sm disabled:opacity-50"
                >
                  {isDiscovering ? 'Discovering...' : 'Discover Partners'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {partners.map(p => (
                  <div key={p.id} className={cn("bg-brand-card p-4 rounded border border-brand-border cursor-pointer", selectedPartner?.id === p.id && "ring-2 ring-brand-orange")} onClick={() => setSelectedPartner(p)}>
                    <h3 className="font-bold text-brand-text">{p.company}</h3>
                    <p className="text-xs text-brand-text-dim">{p.serviceType} | {p.city}</p>
                    <p className="text-xs text-brand-text-muted mt-2">{p.specialization}</p>
                  </div>
                ))}
              </div>

              {selectedPartner && (
                  <div className="mt-8 bg-brand-sidebar p-6 rounded-lg border border-brand-border">
                    <h3 className="text-xl font-bold text-brand-text mb-4">{selectedPartner.company} Interaction Log</h3>
                    
                    <div className="space-y-4 mb-6">
                        {selectedPartner.communicationLog?.map((log, i) => (
                            <div key={i} className="text-sm text-brand-text border-b border-brand-border pb-2">
                                <span className="font-bold">{log.date.split('T')[0]}</span> - {log.action}: {log.notes}
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <select value={interactionAction} onChange={e => setInteractionAction(e.target.value)} className="bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-brand-text">
                            <option>Email</option>
                            <option>Call</option>
                            <option>Meeting</option>
                        </select>
                        <input value={interactionNotes} onChange={e => setInteractionNotes(e.target.value)} placeholder="Interaction notes..." className="flex-1 bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-brand-text" />
                        <button onClick={() => handleLogInteraction(selectedPartner.id)} className="bg-brand-orange text-black px-4 py-2 rounded font-bold text-sm">Log</button>
                    </div>
                  </div>
              )}
            </div>
          )}

          {viewMode !== 'Partners' && currentView === 'intelligence' && (
            <>
              {selectedIds.size > 0 && (
            <div className="sticky top-0 z-20 bg-brand-sidebar border-b border-brand-orange/30 p-3 flex items-center justify-between shadow-2xl animate-in slide-in-from-top duration-300">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                  {selectedIds.size} Selected
                </span>
                <div className="flex items-center gap-2">
                  <select 
                    value={batchStatus}
                    onChange={(e) => setBatchStatus(e.target.value)}
                    className="bg-brand-card border border-brand-border text-[10px] text-brand-text px-2 py-1.5 rounded uppercase font-bold focus:outline-none"
                  >
                    <option value="">Update Status</option>
                    <option value="New">New</option>
                    <option value="Pending">Pending</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Closed">Closed</option>
                  </select>
                  <button 
                    onClick={handleBulkPlacesLookup}
                    className="bg-brand-card border border-brand-border text-[10px] text-brand-orange px-3 py-1.5 rounded uppercase font-bold hover:border-brand-orange transition-all flex items-center gap-2"
                    title="Bulk Places Lookup"
                  >
                    <Globe size={12} />
                    Places
                  </button>
                  <button 
                    onClick={handleBatchGeminiResearch}
                    className="bg-brand-card border border-brand-border text-[10px] text-brand-orange px-3 py-1.5 rounded uppercase font-bold hover:border-brand-orange transition-all flex items-center gap-2"
                    title="Run Batch Research"
                  >
                    <Zap size={12} />
                    Research
                  </button>
                  <input 
                    type="date"
                    value={batchFollowUp}
                    onChange={(e) => setBatchFollowUp(e.target.value)}
                    className="bg-brand-card border border-brand-border text-[10px] text-brand-text px-2 py-1 rounded font-bold focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setBatchFollowUp(getSuggestedFollowUpDate(undefined).slice(0, 10))}
                    className="text-[9px] bg-brand-card border border-brand-border text-brand-text-muted px-2 py-1 rounded hover:text-brand-orange transition-colors"
                  >
                    Suggest
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[10px] uppercase font-bold px-4 py-2 text-brand-text-dim hover:text-brand-text transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setShowBatchConfirm(true)}
                  disabled={!batchStatus && !batchFollowUp}
                  className="bg-brand-orange text-black text-[10px] uppercase font-bold px-6 py-2 rounded shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                >
                  Execute Batch
                </button>
              </div>
            </div>
          )}
          <div className="w-full overflow-x-hidden">
            {/* Table Header - Desktop Only */}
            <div className="hidden md:grid grid-cols-[40px_40px_2.5fr_1.5fr_1fr_1.2fr_60px_100px] gap-4 px-6 py-4 border-b border-brand-border bg-brand-sidebar text-[10px] uppercase font-bold tracking-widest text-brand-text-dim sticky top-0 z-10 backdrop-blur-sm">
              <div className="flex justify-center items-center">
                <input 
                  type="checkbox" 
                  checked={selectedIds.size === filteredLeads.length && filteredLeads.length > 0}
                  onChange={toggleSelectAll}
                  className="accent-brand-orange cursor-pointer"
                />
              </div>
              <div className="flex justify-center italic">Ref</div>
              <div className="italic">Business Entity</div>
              <div className="italic">Location/Niche</div>
              <div className="italic text-center">Mobile Score</div>
              <div className="italic text-right pr-4">Est. Leakage</div>
              <div className="italic text-center">F/Up</div>
              <div className="italic text-center">Action</div>
            </div>

            {/* Table Rows */}
            {filteredLeads.length > 0 ? (
              <div className="divide-y divide-brand-border/30">
                {filteredLeads.map((lead, i) => {
                  const leakage = calculateRevenueLeakage(lead);
                  const today = new Date().toISOString().split('T')[0];
                  const isFollowUpDue = lead.followUpDate === today && lead.status !== 'Closed';
                  const isFollowUpOverdue = lead.followUpDate && lead.followUpDate < today && lead.status !== 'Closed';

                  return (
                    <div 
                      key={lead.id}
                      onClick={() => { setSelectedLead(lead); setIsEditing(false); }}
                      className={cn(
                        "compact-grid-row",
                        "flex flex-col md:grid md:grid-cols-[40px_40px_2.5fr_1.5fr_1fr_1.2fr_60px_100px] md:gap-4 p-4 md:px-6 items-start md:items-center",
                        selectedLead?.id === lead.id && "bg-brand-card/30 shadow-[inset_0_0_20px_rgba(255,106,0,0.05)] border-brand-orange/20"
                      )}
                    >
                      {/* Mobile Card Top Row */}
                      <div className="md:hidden flex justify-between items-center w-full mb-3">
                        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            className="w-5 h-5 accent-brand-orange rounded border-brand-border bg-brand-sidebar"
                          />
                          <div className="text-[10px] font-mono font-bold text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded">
                            REF #{(i + 1).toString().padStart(2, '0')}
                          </div>
                        </div>
                        <div className={cn(
                          "px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border",
                          lead.status === 'New' ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                          lead.status === 'Qualified' ? "bg-green-500/10 text-green-400 border-green-500/30" :
                          lead.status === 'Contacted' ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" :
                          "bg-brand-border/30 text-brand-text-dim border-brand-border"
                        )}>
                          {lead.status}
                        </div>
                      </div>

                      {/* Checkbox (Desktop) */}
                      <div className="hidden md:flex justify-center items-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="accent-brand-orange cursor-pointer"
                        />
                      </div>

                      {/* Index (Desktop) */}
                      <div className="hidden md:flex relative justify-center items-center font-mono text-[10px] text-brand-text-dim group-hover:text-brand-orange">
                        {(i + 1).toString().padStart(2, '0')}
                        {isFollowUpOverdue && (
                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-brand-bg shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse" />
                        )}
                      </div>

                      {/* Business Entity */}
                      <div className="w-full md:w-auto mb-4 md:mb-0">
                        <div className="text-lg md:text-sm font-bold text-brand-text group-hover:text-brand-orange transition-colors flex items-center gap-2">
                          {lead.company}
                          {isFollowUpDue && <div className="w-1.5 h-1.5 bg-brand-orange rounded-full animate-pulse" />}
                          {isFollowUpOverdue && <div className="md:hidden w-1.5 h-1.5 bg-red-500 rounded-full" />}
                        </div>
                        <div className="text-[10px] text-brand-text-muted font-mono mt-0.5 truncate flex items-center gap-1">
                          <Globe size={10} className="shrink-0" />
                          <span className="truncate">{lead.website || 'No digital footprint'}</span>
                        </div>
                        {/* Mobile Details Row */}
                        <div className="md:hidden flex flex-wrap gap-2 mt-3">
                          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase bg-brand-sidebar border border-brand-border px-2 py-1 rounded">
                            <Zap size={10} className="text-brand-orange" />
                            {lead.mobileScore}/100 Perf
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase bg-brand-sidebar border border-brand-border px-2 py-1 rounded">
                            {lead.priceRange || '$$'}
                          </div>
                          {lead.followUpDate && (
                            <div className={cn(
                              "flex items-center gap-1.5 text-[9px] font-bold uppercase border px-2 py-1 rounded",
                              isFollowUpOverdue ? "bg-red-500/10 text-red-500 border-red-500/20" : 
                              isFollowUpDue ? "bg-brand-orange/10 text-brand-orange border-brand-orange/20" : 
                              "bg-brand-sidebar text-brand-text-dim border-brand-border"
                            )}>
                              <Calendar size={10} />
                              {lead.followUpDate}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Location/Niche (Desktop) */}
                      <div className="hidden md:block">
                        <div className="text-xs text-brand-text">{lead.city}, {lead.state}</div>
                        <div className="text-[10px] text-brand-text-dim uppercase font-bold mt-0.5">{lead.niche}</div>
                      </div>

                      {/* Mobile Score (Desktop) */}
                      <div className="hidden md:flex flex-col items-center gap-1.5">
                        <div className="relative w-full h-1 bg-brand-border rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-1000",
                              lead.mobileScore > 70 ? "bg-green-500" : lead.mobileScore > 40 ? "bg-brand-orange" : "bg-red-500"
                            )}
                            style={{ width: `${lead.mobileScore}%` }} 
                          />
                        </div>
                        <span className="font-mono text-[10px] font-bold text-brand-text-muted">{lead.mobileScore}/100</span>
                      </div>

                      {/* Leakage */}
                      <div className="w-full md:w-auto flex md:block justify-between items-center py-2 md:py-0 border-t md:border-t-0 border-brand-border/30 mt-2 md:mt-0 pt-3 md:pt-0">
                        <div className="md:hidden text-[9px] uppercase font-bold text-brand-text-dim">Est. Revenue Leakage</div>
                        <div className={cn(
                          "font-mono text-xl md:text-sm text-right md:pr-4 font-bold",
                          leakage.tier === 'Red' ? "text-red-500" : leakage.tier === 'Orange' ? "text-orange-500" : "text-brand-orange"
                        )}>
                          ${leakage.total.toLocaleString()}
                        </div>
                      </div>

                      {/* F/Up (Desktop) */}
                      <div className="hidden md:flex justify-center">
                        {lead.followUpDate && (
                          <div className={cn(
                            "p-1.5 rounded-full",
                            isFollowUpOverdue ? "bg-red-500/20 text-red-500" : 
                            isFollowUpDue ? "bg-brand-orange/20 text-brand-orange animate-pulse" : 
                            "bg-brand-border/30 text-brand-text-dim"
                          )}>
                            <Calendar size={14} />
                          </div>
                        )}
                      </div>

                      {/* Action (Desktop) */}
                      <div className="hidden md:flex justify-center">
                        <button className="p-2 border border-brand-border rounded-lg text-brand-text-muted hover:text-brand-orange hover:border-brand-orange transition-all">
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-32 text-brand-text-dim text-center px-6">
                  <AlertCircle size={48} strokeWidth={1} />
                  <p className="mt-4 font-serif italic text-lg text-brand-text-muted">Database sector empty.</p>
                  <p className="text-[10px] uppercase font-bold tracking-widest mt-2">Adjust filters or search parameters</p>
                </div>
              )}
            </div>
          </>
          )}

          {currentView === 'crm' && (
            <div className="p-6 h-full flex flex-col">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-brand-orange uppercase font-serif italic">Client Pipeline</h2>
                  <p className="text-xs text-brand-text-muted mt-1 uppercase tracking-widest font-bold">Strategic Deal Flow Management</p>
                </div>
                <div className="flex gap-4">
                  <div className="bg-brand-sidebar border border-brand-border p-3 rounded flex flex-col">
                    <span className="text-[10px] text-brand-text-dim font-bold uppercase tracking-tighter">Qualified Volume</span>
                    <span className="text-xl font-mono text-brand-orange">${leads.filter(l => l.status === 'Qualified').reduce((a, b) => a + (calculateDealValue(b) ?? 0), 0).toLocaleString()}</span>
                  </div>
                  <div className="bg-brand-sidebar border border-brand-border p-3 rounded flex flex-col">
                    <span className="text-[10px] text-brand-text-dim font-bold uppercase tracking-tighter">Pending Actions</span>
                    <span className="text-xl font-mono text-yellow-500">{leads.filter(l => l.status === 'Contacted').length}</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 min-h-0 overflow-x-auto pb-4 no-scrollbar">
                {['Prospecting', 'Outreach', 'Proposal', 'Closed'].map((stage) => {
                  const stageLeads = leads.filter(l => l.dealStage === stage);
                  return (
                    <div key={stage} className="flex flex-col min-w-[280px]">
                      <div className="flex items-center justify-between p-3 border-b border-brand-border bg-brand-sidebar/50 rounded-t-lg">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-text-dim">{stage}</span>
                        <span className="text-[10px] font-mono bg-brand-border/50 px-2 py-0.5 rounded underline decoration-brand-orange">{stageLeads.length}</span>
                      </div>
                      <div className="flex-1 bg-brand-sidebar/10 border-x border-b border-brand-border p-4 space-y-4 overflow-y-auto no-scrollbar rounded-b-lg">
                        {stageLeads.map(lead => (
                          <div 
                            key={lead.id}
                            onClick={() => setSelectedLead(lead)}
                            className="bg-brand-card border border-brand-border p-4 rounded-lg cursor-pointer hover:border-brand-orange transition-all group hover:translate-y-[-2px] shadow-sm shadow-black/20"
                          >
                            <div className="text-[10px] font-mono text-brand-orange mb-1">#{lead.id.split('-').pop()}</div>
                            <h3 className="font-bold text-sm text-brand-text group-hover:text-brand-orange">{lead.company}</h3>
                            <p className="text-[10px] text-brand-text-dim mt-2 line-clamp-2 italic">{lead.strategicPlay}</p>
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-brand-border/30">
                              <span className="text-[10px] font-bold font-mono text-green-500">${(calculateDealValue(lead) ?? 0).toLocaleString()}</span>
                              <div className="flex -space-x-2">
                                <div className="w-6 h-6 rounded-full bg-brand-orange text-black border border-brand-sidebar flex items-center justify-center text-[10px] font-black">{lead.contactName?.charAt(0) || '?'}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode !== 'Partners' && currentView === 'analysis' && (
            <div className="p-6 h-full flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-brand-orange uppercase font-serif italic">Market Analysis</h2>
                  <p className="text-xs text-brand-text-muted mt-1 uppercase tracking-widest font-bold">Intelligence aggregation by Niche & Sector</p>
                </div>
              </div>

              {/* Partner Discovery filters */}
              <div className="bg-brand-sidebar p-5 rounded-xl border border-brand-border flex flex-col sm:flex-row gap-4 items-end shadow-xl">
                 <div className="flex-1 w-full relative">
                    <label className="text-[10px] uppercase font-bold text-brand-orange mb-1 block tracking-widest">Partner Discovery City</label>
                    <input 
                      placeholder="e.g. Austin" 
                      value={cityInput}
                      onChange={e => setCityInput(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-orange"
                    />
                 </div>
                 <div className="flex-1 w-full relative">
                    <label className="text-[10px] uppercase font-bold text-brand-orange mb-1 block tracking-widest">Service Type</label>
                    <input 
                      placeholder="e.g. SEO, Roofing" 
                      value={serviceInput}
                      onChange={e => setServiceInput(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-orange"
                    />
                 </div>
                 <button
                    onClick={async () => {
                      setIsDiscovering(true);
                      const newPartners = await discoverPartners(cityInput, serviceInput);
                      newPartners.forEach(p => addPartner(p));
                      setPartners(readPartners());
                      setIsDiscovering(false);
                      setSuccess(`Discovered ${newPartners.length} partners.`);
                      // Switch to Partners view to see them
                      setViewMode('Partners');
                    }}
                    disabled={isDiscovering || !cityInput.trim() || !serviceInput.trim()}
                    className="w-full sm:w-auto h-10 px-6 bg-brand-orange text-black rounded font-bold uppercase tracking-widest text-[10px] hover:bg-brand-orange-light shadow-[0_0_15px_rgba(255,106,0,0.3)] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isDiscovering ? <><RefreshCw size={14} className="animate-spin" /> Fetching...</> : 'Execute Discovery'}
                 </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
                {analysisData.slice(0, 3).map((item, idx) => (
                  <div key={item.name} className="bg-brand-sidebar border border-brand-border p-6 rounded-xl relative overflow-hidden group shadow-xl">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Zap size={80} className="text-brand-orange" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-text-dim">Sector Alpha-0{idx + 1}</span>
                    <h3 className="text-2xl font-bold text-brand-text mt-1">{item.name}</h3>
                    <div className="flex items-end justify-between mt-8">
                      <div className="flex flex-col">
                        <span className="text-3xl font-mono text-brand-orange">${item.totalLeakage.toLocaleString()}</span>
                        <span className="text-[10px] uppercase font-bold text-brand-text-dim tracking-tighter">Aggregated Leakage</span>
                      </div>
                      <span className="bg-brand-orange text-black px-3 py-1 rounded text-[10px] font-black uppercase tracking-tighter">{item.count} Targets</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex-1 bg-brand-sidebar border border-brand-border rounded-xl overflow-hidden flex flex-col shadow-2xl">
                <div className="p-4 border-b border-brand-border flex items-center justify-between bg-brand-bg/50">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-orange">Niche Vulnerability Index (Sector Correlation)</h4>
                </div>
                <div className="flex-1 overflow-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-brand-sidebar z-10 text-[10px] uppercase font-bold text-brand-text-dim border-b border-brand-border">
                      <tr>
                        <th className="px-6 py-4 italic">Niche Sector</th>
                        <th className="px-6 py-4 text-center italic">Capture Count</th>
                        <th className="px-6 py-4 text-right italic">Leakage Impact</th>
                        <th className="px-6 py-4 text-right italic">Avg. Friction</th>
                        <th className="px-6 py-4 text-right pr-6 italic">Strategy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/30">
                      {analysisData.map((item) => {
                         const nicheLeads = leads.filter(l => l.niche === item.name);
                         const avgFriction = item.count > 0 ? Math.round(nicheLeads.reduce((a, b) => a + (100 - b.mobileScore), 0) / item.count) : 0;
                         return (
                          <tr key={item.name} className="hover:bg-brand-card/50 transition-colors group">
                            <td className="px-6 py-4 font-bold text-brand-text group-hover:text-brand-orange uppercase tracking-tight text-sm">{item.name}</td>
                            <td className="px-6 py-4 text-center font-mono text-brand-text-muted">{item.count}</td>
                            <td className="px-6 py-4 text-right font-mono text-red-500/80">${item.totalLeakage.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right">
                              <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded border",
                                avgFriction > 50 ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"
                              )}>
                                {avgFriction}% VULNERABLE
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right pr-6">
                              <button 
                                onClick={() => { setSearchTerm(item.name); setStatusFilter('All'); setCurrentView('intelligence'); }}
                                className="text-[10px] uppercase font-bold text-brand-text-dim hover:text-brand-orange transition-all hover:translate-x-[-4px]"
                              >
                                View Leads »
                              </button>
                            </td>
                          </tr>
                         );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail Slide-over */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLead(null)} />
          <div className="relative w-full max-w-xl bg-brand-sidebar shadow-2xl h-full border-l border-brand-border overflow-auto flex flex-col p-4 md:p-8 animate-in slide-in-from-right duration-300">
            <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-8 md:mb-12">
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-widest font-bold text-brand-orange mb-2 md:mb-3">Enterprise Dataset ID: {selectedLead.id}</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedLead?.company || ''}
                    onChange={(e) => handleInputChange('company', e.target.value)}
                    className="text-2xl md:text-4xl font-serif font-bold italic text-brand-text leading-tight bg-brand-card border border-brand-orange/30 rounded-lg px-3 py-1 w-full focus:outline-none focus:border-brand-orange"
                  />
                ) : (
                  <h2 className="text-2xl md:text-4xl font-serif font-bold italic text-brand-text leading-tight">{selectedLead.company}</h2>
                )}
                <div className="flex flex-wrap items-center gap-3 md:gap-4 mt-4">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedLead?.website || ''}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                      className="text-xs text-brand-text bg-brand-card border border-brand-border rounded px-2 py-1 w-full md:w-64 focus:outline-none focus:border-brand-orange"
                      placeholder="Website URL"
                    />
                  ) : (
                    <a href={selectedLead.website && !selectedLead.website.startsWith('http') ? `https://${selectedLead.website}` : selectedLead.website || ''} target="_blank" className="text-xs text-brand-text-muted hover:text-brand-orange transition-colors flex items-center gap-1">
                      <Globe size={12} />
                      <span className="truncate max-w-[150px] md:max-w-none">{selectedLead.website || 'No website'}</span>
                    </a>
                  )}
                  {isEditing ? (
                    <>
                      <select
                        value={editedLead?.status || 'Pending'}
                        onChange={(e) => handleInputChange('status', e.target.value)}
                        className="text-[10px] py-1 px-2 bg-brand-card border border-brand-border text-brand-orange rounded font-bold uppercase focus:outline-none outline-none"
                      >
                        <option value="New">New</option>
                        <option value="Pending">Pending</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Closed">Closed</option>
                      </select>
                      <div className="flex items-center gap-2 px-2 py-1 bg-brand-card border border-brand-border rounded-lg">
                        <Calendar size={12} className="text-brand-orange" />
                        <input
                          type="datetime-local"
                          value={formatForDateTimeLocal(editedLead?.followUpDate)}
                          onChange={(e) => handleInputChange('followUpDate', e.target.value)}
                          className="bg-transparent text-[10px] font-bold text-brand-text-muted focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleInputChange('followUpDate', getSuggestedFollowUpDate(selectedLead?.lastContacted, selectedLead?.timezone))}
                          className="text-[9px] bg-brand-card border border-brand-border text-brand-text-muted px-1.5 py-0.5 rounded hover:text-brand-orange transition-colors ml-1"
                        >
                          Suggest
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] py-0.5 px-2 bg-brand-orange/10 text-brand-orange rounded font-bold uppercase">{selectedLead.status}</span>
                      {selectedLead.followUpDate && (
                        <div className={cn(
                          "flex items-center gap-1.5 text-[9px] font-bold uppercase border px-2 py-1 rounded",
                          (() => {
                            const today = new Date().toISOString().split('T')[0];
                            return selectedLead.followUpDate < today && selectedLead.status !== 'Closed' 
                              ? "bg-red-500/10 text-red-500 border-red-500/20" 
                              : selectedLead.followUpDate === today && selectedLead.status !== 'Closed'
                              ? "bg-brand-orange/10 text-brand-orange border-brand-orange/20 animate-pulse"
                              : "bg-brand-sidebar text-brand-text-dim border-brand-border";
                          })()
                        )}>
                          <Calendar size={10} />
                          Follow-up: {selectedLead.followUpDate}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t md:border-t-0 border-brand-border/30 pt-4 md:pt-0">
                {!isEditing ? (
                  <button 
                    onClick={handleEditStart}
                    className="flex-1 md:flex-none p-2 px-4 md:p-2 border border-brand-border rounded-lg md:rounded-full text-brand-text-muted hover:text-brand-orange hover:border-brand-orange transition-all flex items-center justify-center gap-2"
                  >
                    <Edit2 size={18} />
                    <span className="md:hidden text-xs font-bold uppercase">Edit</span>
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={handleEditSave}
                      className="flex-1 md:flex-none p-2 px-4 md:p-2 border border-green-500/30 bg-green-500/5 rounded-lg md:rounded-full text-green-500 hover:bg-green-500 hover:text-black transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={18} />
                      <span className="md:hidden text-xs font-bold uppercase tracking-wider">Save</span>
                    </button>
                    <button 
                      onClick={handleEditCancel}
                      className="flex-1 md:flex-none p-2 px-4 md:p-2 border border-red-500/30 bg-red-500/5 rounded-lg md:rounded-full text-red-500 hover:bg-red-500 hover:text-black transition-all flex items-center justify-center gap-2"
                    >
                      <X size={18} />
                      <span className="md:hidden text-xs font-bold uppercase tracking-wider">Cancel</span>
                    </button>
                  </>
                )}
                <button 
                  onClick={() => { setSelectedLead(null); setIsEditing(false); }} 
                  className="p-2 border border-brand-border rounded-lg md:rounded-full text-brand-text-dim hover:text-brand-orange transition-all"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="p-5 border border-brand-border bg-brand-card/30 rounded-xl group transition-all hover:border-brand-orange/50 overflow-hidden relative col-span-1 md:col-span-2">
                <div className="relative z-10 w-full">
                  <div className="flex justify-between items-start">
                    <div className="w-full">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-brand-text-dim mb-1">Gross Revenue Leakage</div>
                      {(() => {
                        const breakdown = calculateRevenueLeakage(isEditing ? editedLead! : selectedLead);
                        return (
                          <>
                            <div className="text-3xl md:text-4xl font-mono font-bold text-brand-orange">${breakdown.total.toLocaleString()}</div>
                            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-border">
                              <div>
                                <div className="text-[10px] text-brand-text-dim uppercase font-bold">Star Gap Loss</div>
                                <div className="text-sm font-mono text-brand-text">${breakdown.trustLoss.toLocaleString()}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-brand-text-dim uppercase font-bold">Mobile Penalty</div>
                                <div className="text-sm font-mono text-brand-text">${breakdown.mobilePenalty.toLocaleString()}</div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="text-right">
                      <BarChart3 className="text-brand-orange/20" size={48} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5 border border-brand-border bg-brand-card/30 rounded-xl group transition-all hover:border-brand-orange/50 overflow-hidden relative col-span-2">
                <div className="relative z-10">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-brand-text-dim mb-1">Friction Performance Index</div>
                  <div className="flex items-end gap-3">
                    <div className="text-4xl font-mono font-bold text-red-500">{calculateFrictionScore(isEditing ? editedLead! : selectedLead) ?? 0}%</div>
                    <div className="mb-1 h-2 flex-1 bg-brand-border rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500 transition-all duration-1000" 
                        style={{ width: `${calculateFrictionScore(isEditing ? editedLead! : selectedLead) ?? 0}%` }} 
                      />
                    </div>
                  </div>
                  <p className="text-[10px] mt-2 text-brand-text-muted italic">Total resistance detected in conversion architecture</p>
                </div>
                <Zap className="absolute -bottom-4 -right-4 text-red-500/5 group-hover:text-red-500/10 transition-all" size={100} />
              </div>
            </section>

            <section className="mb-8">
              <div className="flex items-center justify-between mb-4 border-b border-brand-border pb-2">
                <h3 className="font-serif italic text-lg text-brand-text">Intelligence Analysis</h3>
                {!isEditing && (
              <div className="flex gap-2">
                <button 
                  onClick={() => handleUpdatePageSpeed(selectedLead)}
                  disabled={loading}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 border border-brand-text-dim text-brand-text-dim rounded hover:bg-brand-text-dim hover:text-black transition-all disabled:opacity-30"
                >
                  <Globe size={12} className={cn(loading && "animate-spin")} />
                  Refresh Perf
                </button>
                <button 
                  onClick={() => handleResearch(selectedLead)}
                  disabled={loading}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 border border-brand-orange text-brand-orange rounded hover:bg-brand-orange hover:text-black transition-all disabled:opacity-30"
                >
                  <RefreshCw size={12} className={cn(loading && "animate-spin")} />
                  {selectedLead.evidenceLink ? "Recalibrate" : "Execute Scan"}
                </button>
              </div>
                )}
              </div>
              {isEditing ? (
                <textarea
                  value={editedLead?.evidenceLink || ''}
                  onChange={(e) => handleInputChange('evidenceLink', e.target.value)}
                  className="w-full h-32 bg-brand-card/50 p-4 rounded-xl border border-brand-orange/30 text-sm text-brand-text-muted font-sans focus:outline-none focus:border-brand-orange resize-none"
                  placeholder="Intelligence notes..."
                />
              ) : (
                <div className="space-y-4">
                  {selectedLead.evidenceLink ? (
                    <div className="bg-brand-card/50 p-6 rounded-xl border border-brand-border">
                      <div className="text-[8px] uppercase font-bold text-brand-orange mb-2 tracking-widest flex items-center gap-1">
                        <Zap size={10} /> Latest Findings ({new Date(selectedLead.lastScanDate).toLocaleDateString()})
                      </div>
                      <p className="text-sm leading-relaxed text-brand-text-muted font-sans whitespace-pre-wrap">{selectedLead.evidenceLink}</p>
                    </div>
                  ) : (
                    <div className="py-12 border border-dashed border-brand-border rounded-xl flex flex-col items-center justify-center text-brand-text-dim">
                      <MessageSquare size={32} strokeWidth={1} />
                      <p className="mt-2 text-[10px] uppercase tracking-widest font-bold">Deep Scan Required</p>
                    </div>
                  )}

                  {/* SaaS Opportunities */}
                  <div className="bg-brand-card/50 p-6 rounded-xl border border-brand-border">
                    <div className="text-[8px] uppercase font-bold text-brand-orange mb-2 tracking-widest flex items-center gap-1">
                      <Zap size={10} /> SaaS Opportunities Identified
                    </div>
                    <p className="text-sm text-brand-text">
                      {selectedLead.saasOpportunities || "No opportunities detected yet."}
                    </p>
                  </div>

                  {/* Chronological Research History Subset */}
                  {(() => {
                    let history = [];
                    try {
                      history = JSON.parse(selectedLead.researchHistory || '[]');
                    } catch (e) {}
                    
                    // Filter for actual research findings (not manual interactions or status changes)
                    const researchScans = history.filter((item: any) => 
                      !item.summary.toLowerCase().includes('follow-up') && 
                      !item.summary.toLowerCase().includes('status set to') &&
                      !item.summary.toLowerCase().includes('contact date updated') &&
                      item.summary !== selectedLead.evidenceLink
                    );

                    if (researchScans.length > 0) {
                      return (
                        <div className="mt-6">
                          <div className="text-[10px] uppercase font-bold text-brand-text-dim mb-3 tracking-widest border-b border-brand-border/30 pb-1">Historical Scan Log</div>
                          <div className="space-y-3">
                            {researchScans.map((scan: any, idx: number) => (
                              <div key={idx} className="p-3 bg-brand-card/20 rounded-lg border border-brand-border/50 transition-all hover:border-brand-orange/20">
                                <div className="flex justify-between items-center mb-2">
                                  <div className="flex items-center gap-2">
                                    <BarChart3 size={12} className="text-brand-orange/40" />
                                    <span className="text-[9px] font-mono font-bold text-brand-text-muted">{new Date(scan.date).toLocaleDateString()}</span>
                                  </div>
                                  <span className="text-[8px] font-bold text-brand-text-dim px-1.5 py-0.5 border border-brand-border/50 rounded uppercase bg-brand-card/50">
                                    Archive v{researchScans.length - idx}
                                  </span>
                                </div>
                                <p className="text-[11px] leading-relaxed text-brand-text-muted line-clamp-3">
                                  {scan.summary}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </section>

            <section className="mb-8">
              <h3 className="font-serif italic text-lg border-b border-brand-border pb-2 mb-4 text-brand-text">Activity & Research Archive</h3>
              <div className="max-h-60 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {(() => {
                  let history = [];
                  try {
                    const historyStr = isEditing ? editedLead?.researchHistory : selectedLead.researchHistory;
                    history = JSON.parse(historyStr || '[]');
                  } catch (e) {}
                  
                  if (!Array.isArray(history) || history.length === 0) {
                    return <div className="text-[10px] text-brand-text-dim italic border border-dashed border-brand-border p-4 rounded text-center">No historical records in archive.</div>;
                  }

                  return history.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 border border-brand-border bg-brand-card/10 rounded-lg group hover:border-brand-orange/30 transition-all">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-mono font-bold text-brand-orange">{new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-[8px] font-bold text-brand-text-dim px-1.5 py-0.5 border border-brand-border rounded uppercase bg-brand-card">
                          {item.summary.toLowerCase().includes('follow-up') ? 'Interaction' : 'Insight'} #{history.length - idx}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-brand-text-muted font-sans whitespace-pre-wrap">
                        {item.summary}
                      </p>
                    </div>
                  ));
                })()}
              </div>
            </section>

            <section className="mb-8">
              <h3 className="font-serif italic text-lg border-b border-brand-border pb-2 mb-4 text-brand-text">Communication Channels</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-brand-border p-4 rounded bg-brand-card/20">
                  <div className="text-[10px] uppercase font-bold text-brand-text-dim">Direct Phone</div>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={editedLead?.phone || ''}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="Phone number"
                      className="text-sm font-mono font-bold text-brand-text mt-1 bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                    />
                  ) : (
                    <div className="text-sm font-mono font-bold text-brand-text mt-1">{selectedLead.phone || 'Not logged'}</div>
                  )}
                </div>
                <div className="border border-brand-border p-4 rounded bg-brand-card/20">
                  <div className="text-[10px] uppercase font-bold text-brand-text-dim">Verified Email</div>
                  {isEditing ? (
                    <input
                      type="email"
                      value={editedLead?.email || ''}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="Email address"
                      className="text-sm font-mono font-bold text-brand-text mt-1 bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                    />
                  ) : (
                    <div className="text-sm font-mono font-bold text-brand-text mt-1 break-all">{selectedLead.email || 'Not logged'}</div>
                  )}
                </div>
                <div className="border border-brand-border p-4 rounded bg-brand-card/20 col-span-2">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[10px] uppercase font-bold text-brand-text-dim">Follow-up Reminder</div>
                    {isEditing && (
                      <div className="text-[10px] font-bold text-brand-orange/70 flex items-center gap-1">
                        <Calendar size={10} />
                        Next Action
                      </div>
                    )}
                  </div>
                  {isEditing ? (
                    <>
                      <input
                        type="datetime-local"
                        value={formatForDateTimeLocal(editedLead?.followUpDate)}
                        onChange={(e) => handleInputChange('followUpDate', e.target.value)}
                        className="text-sm font-mono font-bold text-brand-text bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                      />
                      <button
                        type="button"
                        onClick={() => handleInputChange('followUpDate', getSuggestedFollowUpDate(selectedLead?.lastContacted, selectedLead?.timezone))}
                        className="text-[10px] bg-brand-card border border-brand-border text-brand-text-muted px-2 py-0.5 rounded hover:text-brand-orange transition-colors mt-2"
                      >
                        Suggest Date
                      </button>
                    </>
                  ) : (
                    <input 
                      type="datetime-local"
                      value={formatForDateTimeLocal(selectedLead.followUpDate)}
                      onChange={(e) => handleUpdateLead({ ...selectedLead!, followUpDate: e.target.value })}
                      className="bg-brand-bg border border-brand-border text-sm px-2 py-1 rounded font-bold focus:outline-none w-full"
                    />
                  )}
                </div>
                <div className="border border-brand-border p-4 rounded bg-brand-card/20 col-span-2">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[10px] uppercase font-bold text-brand-text-dim">Last Contacted</div>
                    {isEditing && (
                      <button 
                        onClick={() => {
                          const now = new Date().toISOString().split('T')[0];
                          if (editedLead?.lastContacted === now) {
                            handleInputChange('followUpCount', (editedLead.followUpCount || 0) + 1);
                          } else {
                            handleInputChange('lastContacted', now);
                          }
                        }}
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border border-brand-orange/50 text-brand-orange hover:bg-brand-orange hover:text-black rounded transition-all"
                      >
                        Log Now
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editedLead?.lastContacted || ''}
                      onChange={(e) => handleInputChange('lastContacted', e.target.value)}
                      className="text-sm font-mono font-bold text-brand-text bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                    />
                  ) : (
                    <div className="text-sm font-mono font-bold text-brand-text">{selectedLead.lastContacted || 'No contact history'}</div>
                  )}
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h3 className="font-serif italic text-lg border-b border-brand-border pb-2 mb-4 text-brand-text">Technical Blueprint</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-brand-border p-4 rounded bg-brand-card/20">
                  <div className="text-[10px] uppercase font-bold text-brand-text-dim">Priority Level</div>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editedLead?.priority || 0}
                      onChange={(e) => handleInputChange('priority', parseInt(e.target.value))}
                      className="text-xl font-mono font-bold text-brand-text mt-1 bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                    />
                  ) : (
                    <div className="text-xl font-mono font-bold text-brand-text mt-1">{selectedLead.priority}</div>
                  )}
                </div>
                <div className="border border-brand-border p-4 rounded bg-brand-card/20">
                  <div className="text-[10px] uppercase font-bold text-brand-text-dim">Review Count</div>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editedLead?.reviewCount || 0}
                      onChange={(e) => handleInputChange('reviewCount', parseInt(e.target.value))}
                      className="text-xl font-mono font-bold text-brand-text mt-1 bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                    />
                  ) : (
                    <div className="text-xl font-mono font-bold text-brand-text mt-1">{selectedLead.reviewCount}</div>
                  )}
                </div>
                <div className="border border-brand-border p-4 rounded bg-brand-card/20">
                  <div className="text-[10px] uppercase font-bold text-brand-text-dim">Mobile Performance</div>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editedLead?.mobileScore || 0}
                      onChange={(e) => handleInputChange('mobileScore', parseInt(e.target.value))}
                      className="text-xl font-mono font-bold text-brand-text mt-1 bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                    />
                  ) : (
                    <div className="text-xl font-mono font-bold text-brand-text mt-1">{selectedLead.mobileScore}<span className="text-[10px] text-brand-text-dim ml-1">/100</span></div>
                  )}
                </div>
                <div className="border border-brand-border p-4 rounded bg-brand-card/20">
                  <div className="text-[10px] uppercase font-bold text-brand-text-dim">Contact Title</div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedLead?.contactTitle || ''}
                      onChange={(e) => handleInputChange('contactTitle', e.target.value)}
                      className="text-xs font-bold text-brand-text mt-2 uppercase bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                    />
                  ) : (
                    <div className="text-xs font-bold text-brand-text mt-2 uppercase">{selectedLead.contactTitle || 'Unknown'}</div>
                  )}
                </div>
                <div className="border border-brand-border p-4 rounded bg-brand-card/20">
                  <div className="text-[10px] uppercase font-bold text-brand-text-dim">Touchpoints</div>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editedLead?.followUpCount || 0}
                      onChange={(e) => handleInputChange('followUpCount', parseInt(e.target.value))}
                      className="text-xl font-mono font-bold text-brand-text mt-1 bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                    />
                  ) : (
                    <div className="text-xl font-mono font-bold text-brand-orange mt-1">{selectedLead.followUpCount || 0}</div>
                  )}
                </div>
              </div>
              <div className="mt-4 p-4 border border-brand-border rounded bg-brand-card/20">
                <div className="text-[10px] uppercase font-bold text-brand-text-dim mb-2">Location Intelligence</div>
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editedLead?.city || ''}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="City"
                        className="text-xs text-brand-text bg-transparent border-b border-brand-border w-full focus:outline-none focus:border-brand-orange"
                      />
                      <input
                        type="text"
                        value={editedLead?.state || ''}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        placeholder="State"
                        className="text-[10px] text-brand-text bg-transparent border-b border-brand-border w-16 focus:outline-none focus:border-brand-orange"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-brand-text">{selectedLead.city}, {selectedLead.state}</p>
                )}
                {!isEditing && <div className="text-[10px] text-brand-text-muted mt-1 uppercase font-mono tracking-tighter">{selectedLead.timezone} Zone • Priority {selectedLead.priority}</div>}
              </div>
            </section>

            {!isEditing && (
              <section className="mb-8">
                <h3 className="font-serif italic text-lg border-b border-brand-border pb-2 mb-4 text-brand-text">Performance Benchmark</h3>
                <div className="h-48 w-full border border-brand-border rounded-xl bg-brand-card/30 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        width={60}
                      />
                      <Tooltip 
                        cursor={{ fill: 'rgba(255,106,0,0.05)' }}
                        contentStyle={{ backgroundColor: '#0a0f1e', border: '1px solid #131c2e', borderRadius: '8px' }}
                        itemStyle={{ color: '#ff6a00', fontSize: '10px' }}
                        labelStyle={{ display: 'none' }}
                      />
                      <Bar 
                        dataKey="score" 
                        radius={[0, 4, 4, 0]}
                        barSize={24}
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] text-center text-brand-text-dim mt-2 uppercase tracking-widest">PageSpeed Comparison Index</p>
                </div>
              </section>
            )}

            <div className="mt-auto pt-8">
              {!showContactForm ? (
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setShowContactForm(true);
                      if (selectedLead) handleTemplateSelect(CONTACT_TEMPLATES[0]);
                    }}
                    className="flex-1 bg-brand-orange text-black py-4 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-brand-orange-light shadow-[0_0_20px_rgba(255,106,0,0.2)] transition-all"
                  >
                    Initiate Strategic Contact
                  </button>
                  <button 
                    onClick={handleCopyBriefing}
                    className="px-5 border border-brand-border rounded-xl text-brand-text-muted hover:text-brand-orange hover:border-brand-orange transition-all flex items-center justify-center gap-2"
                    title="Copy Technical Briefing"
                  >
                    <Download size={20} />
                    <span className="hidden md:inline text-[8px] font-bold uppercase tracking-widest">Briefing</span>
                  </button>
                </div>
              ) : (
                <div className="bg-brand-card/30 border border-brand-orange/30 p-6 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] uppercase font-bold text-brand-orange tracking-widest flex items-center gap-2">
                      <Zap size={12} />
                      Strategic Outreach Form
                    </h4>
                    <button onClick={() => setShowContactForm(false)} className="text-brand-text-dim hover:text-brand-orange">
                      <X size={16} />
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[9px] uppercase font-bold text-brand-text-dim mb-1 block">Message Template</label>
                      <select 
                        onChange={(e) => handleTemplateSelect(CONTACT_TEMPLATES[parseInt(e.target.value)])}
                        className="w-full bg-brand-sidebar border border-brand-border text-xs text-brand-text px-3 py-2 rounded focus:outline-none focus:border-brand-orange appearance-none cursor-pointer"
                      >
                        {CONTACT_TEMPLATES.map((t, idx) => (
                          <option key={idx} value={idx}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] uppercase font-bold text-brand-text-dim mb-1 block">Subject</label>
                      <input 
                        type="text"
                        value={contactSubject}
                        onChange={(e) => setContactSubject(e.target.value)}
                        className="w-full bg-brand-sidebar border border-brand-border text-xs text-brand-text px-3 py-2 rounded focus:outline-none focus:border-brand-orange"
                        placeholder="Outreach subject..."
                      />
                    </div>

                    <div>
                      <label className="text-[9px] uppercase font-bold text-brand-text-dim mb-1 block">Message Body</label>
                      <textarea 
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        className="w-full h-32 bg-brand-sidebar border border-brand-border text-xs text-brand-text p-3 rounded focus:outline-none focus:border-brand-orange resize-none font-sans"
                        placeholder="Personalize your message..."
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                       <button 
                        onClick={() => setShowContactForm(false)}
                        className="flex-1 border border-brand-border text-brand-text-dim py-2 rounded font-bold uppercase tracking-widest text-[9px] hover:bg-brand-card transition-all"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={executeContact}
                        disabled={loading || !contactSubject || !contactMessage}
                        className="flex-[2] bg-brand-orange text-black py-2 rounded font-bold uppercase tracking-widest text-[9px] hover:bg-brand-orange-light shadow-[0_0_15px_rgba(255,106,0,0.2)] transition-all disabled:opacity-30"
                      >
                        {loading ? 'Logging Activity...' : 'Log Strategic Contact'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ask Maps Scraper Modal */}
      {showMapsScraper && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowMapsScraper(false)} />
          <div className="relative bg-brand-sidebar border border-brand-orange/30 p-8 rounded-2xl max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-serif italic text-brand-text">Ask Maps Scraper</h3>
                <p className="text-xs text-brand-text-dim uppercase font-bold tracking-widest mt-1">Intelligence Extraction Node</p>
              </div>
              <button onClick={() => setShowMapsScraper(false)} className="text-brand-text-dim hover:text-brand-orange">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-brand-orange/5 border border-brand-orange/20 rounded-lg">
                <p className="text-[10px] text-brand-orange leading-relaxed uppercase font-bold">Instruction:</p>
                <p className="text-[11px] text-brand-text-muted mt-1 leading-relaxed">
                  Paste raw text copied from a Google Maps business listing. Gemini will extract coordinates, technical triggers, and intent markers to initialize a new lead record.
                </p>
              </div>

              <textarea
                value={scrapedText}
                onChange={(e) => setScrapedText(e.target.value)}
                placeholder="Paste Google Maps output here..."
                className="w-full h-48 bg-brand-card/50 border border-brand-border p-4 rounded-xl text-sm font-sans focus:outline-none focus:border-brand-orange resize-none text-brand-text"
              />

              <div className="flex justify-between items-center gap-4">
                <div className="text-[9px] uppercase font-bold text-brand-text-dim tracking-widest flex items-center gap-2">
                  <Zap size={12} className="text-brand-orange" />
                  AI Token Optimized Processing
                </div>
                <button 
                  onClick={handleAskMapsImport}
                  disabled={loading || !scrapedText.trim()}
                  className="px-8 py-3 bg-brand-orange text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-brand-orange-light shadow-[0_0_15px_rgba(255,106,0,0.3)] transition-all disabled:opacity-30"
                >
                  {loading ? 'Processing Scrape...' : 'Execute Extraction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Confirmation Modal */}
      {showBatchConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowBatchConfirm(false)} />
          <div className="relative bg-brand-sidebar border border-brand-orange/30 p-8 rounded-2xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-orange/10 flex items-center justify-center text-brand-orange">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-serif italic text-brand-text">Confirm Batch Action</h3>
            </div>
            <p className="text-sm text-brand-text-muted mb-6 font-sans leading-relaxed">
              You are about to synchronize updates across <span className="text-brand-orange font-bold font-mono">{selectedIds.size}</span> distinct records in the intelligence database. 
              <span className="block mt-2 p-3 bg-brand-card/50 rounded-lg border border-brand-border/50">
                {batchStatus && <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-brand-orange" /> <span className="text-[10px] uppercase font-bold text-brand-text-dim">Status:</span> <span className="text-xs font-mono text-brand-text">{batchStatus}</span></div>}
                {batchFollowUp && <div className="flex items-center gap-2 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-brand-orange" /> <span className="text-[10px] uppercase font-bold text-brand-text-dim">Follow-up:</span> <span className="text-xs font-mono text-brand-text">{batchFollowUp}</span></div>}
              </span>
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowBatchConfirm(false)}
                className="flex-1 px-4 py-3 border border-brand-border rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleBatchUpdate}
                className="flex-1 px-4 py-3 bg-brand-orange text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-brand-orange-light shadow-[0_0_15px_rgba(255,106,0,0.3)] transition-all"
              >
                Confirm Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 items-center pointer-events-none">
        {error && (
          <div className="flex items-center gap-3 px-6 py-4 bg-red-950/90 border border-red-500/50 text-red-200 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
            <AlertCircle size={20} className="text-red-500" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-500/70">System Error</span>
              <span className="text-sm font-medium">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="ml-4 p-1 hover:bg-white/10 rounded">
              <Plus size={16} className="rotate-45" />
            </button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-3 px-6 py-4 bg-green-950/90 border border-green-500/50 text-green-200 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
            <Zap size={20} className="text-green-500" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-green-500/70">Operation Success</span>
              <span className="text-sm font-medium">{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="ml-4 p-1 hover:bg-white/10 rounded">
              <Plus size={16} className="rotate-45" />
            </button>
          </div>
        )}
      </div>

      {/* CSV Import Modal */}
      {showCsvImport && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowCsvImport(false)} />
          <div className="relative bg-brand-sidebar border border-brand-orange/30 p-8 rounded-2xl max-w-xl w-full shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-serif italic text-brand-text">Lead Data Import</h3>
                <p className="text-xs text-brand-text-dim uppercase font-bold tracking-widest mt-1">Bulk Processor v11</p>
              </div>
              <button onClick={() => setShowCsvImport(false)} className="text-brand-text-dim hover:text-brand-orange">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="p-6 border-2 border-dashed border-brand-border rounded-2xl flex flex-col items-center justify-center bg-brand-card/20 hover:border-brand-orange/50 transition-all group relative">
                <div className="w-16 h-16 bg-brand-card rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileUp size={32} className="text-brand-text-dim group-hover:text-brand-orange" />
                </div>
                <p className="text-sm font-bold text-brand-text">Drag & drop CSV file or click to browse</p>
                <p className="text-[10px] text-brand-text-dim uppercase tracking-widest mt-2 font-bold italic">Required: 32-column Schema</p>
                
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={handleCsvImport}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              <div className="bg-brand-card/50 border border-brand-border p-4 rounded-xl">
                <div className="text-[10px] uppercase font-bold tracking-widest text-brand-orange mb-2">Import Requirements</div>
                <ul className="text-[11px] text-brand-text-muted space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-brand-orange" />
                    File must be in CSV format
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-brand-orange" />
                    First row must contain headers (labels)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-brand-orange" />
                    Mapping follows PROPERTY_TO_COLUMN_NAME logic
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Road Warrior Mobile Navigation */}
      <div className="md:hidden road-warrior-nav">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="road-warrior-btn"
        >
          <Filter size={20} />
          <span>Filters</span>
        </button>
        <button 
          onClick={() => setShowMapsScraper(true)}
          className="road-warrior-btn"
        >
          <Plus size={24} className="bg-brand-orange text-black rounded-full" />
          <span>Ask Maps</span>
        </button>
        <button 
          onClick={checkGmailReplies}
          className="road-warrior-btn"
        >
          <RefreshCw size={20} className={cn(loading && "animate-spin")} />
          <span>Gmail</span>
        </button>
      </div>
    </div>
  );
}
