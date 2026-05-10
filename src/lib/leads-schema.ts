/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 51-Column Lead Schema (Single Source of Truth)
// We map internal object keys to Column Labels found in the Google Sheet.

export interface Lead {
  id: string; // 0
  num: string; // 1
  company: string; // 2
  contact: string; // 3
  email: string; // 4
  title: string; // 5
  niche: string; // 6
  status: string; // 7
  decisionMaker: string; // 8
  city: string; // 9
  state: string; // 10
  timezone: string; // 11
  followUpDate: string; // 12
  lastContacted: string; // 13
  lastSender: string; // 14
  followUpCount: number; // 15
  pitchSent: string; // 16
  painPoints: string; // 17
  servicesNeeded: string; // 18
  notes: string; // 19
  outreachLog: string; // 20
  dealStage: string; // 21
  dealValue: number; // 22
  contacts: string; // 23
  subNiche: string; // 24
  intentTrigger: string; // 25
  phone: string; // 26
  website: string; // 27
  linkedinUrl: string; // 28
  evidenceLink: string; // 29
  reviewQuote: string; // 30
  yearEst: string; // 31
  address: string; // 32
  zip: string; // 33
  mobileScore: number; // 34
  serviceFormat: string; // 35
  profileStatus: string; // 36
  leadDestination: string; // 37
  markupLoss: string; // 38
  frictionFees: string; // 39
  reviewDecay: string; // 40
  recentComplaintQuote: string; // 41
  techFriction: string; // 42
  priceRange: string; // 43
  reviewCount: number; // 44
  strategicPlay: string; // 45
  priority: number; // 46
  contactName: string; // 47
  contactTitle: string; // 48
  lastScanDate: string; // 49
  contactLog: string; // 50

  // Internal/calculated fields
  researchHistory?: string; 
  saasOpportunities?: string;
  industryLegacyScore?: number;
  isRejected?: boolean;
  rejectionReason?: string;
  tabName?: string; // Track which tab the lead came from
}

export interface Partner {
  id: string;
  company: string;
  niche: string;
  serviceType: string;
  city: string;
  website: string;
  contactEmail: string;
  specialization: string;
  communicationLog: Array<{ date: string; action: string; notes: string }>;
}

// Property to Human-Readable Column Name Mapping
export const PROPERTY_TO_COLUMN_NAME: Record<keyof Lead, string> = {
  id: 'id',
  num: 'num',
  company: 'company',
  contact: 'contact',
  email: 'email',
  title: 'title',
  niche: 'niche',
  status: 'status',
  decisionMaker: 'decisionMaker',
  city: 'city',
  state: 'state',
  timezone: 'timezone',
  followUpDate: 'followUpDate',
  lastContacted: 'lastContacted',
  lastSender: 'lastSender',
  followUpCount: 'followUpCount',
  pitchSent: 'pitchSent',
  painPoints: 'painPoints',
  servicesNeeded: 'servicesNeeded',
  notes: 'notes',
  outreachLog: 'outreachLog',
  dealStage: 'dealStage',
  dealValue: 'dealValue',
  contacts: 'contacts',
  subNiche: 'subNiche',
  intentTrigger: 'intentTrigger',
  phone: 'phone',
  website: 'website',
  linkedinUrl: 'linkedinUrl',
  evidenceLink: 'evidenceLink',
  reviewQuote: 'reviewQuote',
  yearEst: 'yearEst',
  address: 'address',
  zip: 'zip',
  mobileScore: 'mobileScore',
  serviceFormat: 'serviceFormat',
  profileStatus: 'profileStatus',
  leadDestination: 'leadDestination',
  markupLoss: 'markupLoss',
  frictionFees: 'frictionFees',
  reviewDecay: 'reviewDecay',
  recentComplaintQuote: 'recentComplaintQuote',
  techFriction: 'techFriction',
  priceRange: 'priceRange',
  reviewCount: 'reviewCount',
  strategicPlay: 'strategicPlay',
  priority: 'priority',
  contactName: 'contactName',
  contactTitle: 'contactTitle',
  lastScanDate: 'lastScanDate',
  contactLog: 'contactLog',
  researchHistory: 'researchHistory',
  saasOpportunities: 'saasOpportunities',
  industryLegacyScore: 'industryLegacyScore',
  isRejected: 'isRejected',
  rejectionReason: 'rejectionReason',
  tabName: 'tabName'
};

// Default Column Order
export const DEFAULT_COLUMN_ORDER: (keyof Lead)[] = [
  'id', 'num', 'company', 'contact', 'email', 'title', 'niche', 'status', 'decisionMaker',
  'city', 'state', 'timezone', 'followUpDate', 'lastContacted', 'lastSender', 'followUpCount',
  'pitchSent', 'painPoints', 'servicesNeeded', 'notes', 'outreachLog', 'dealStage', 'dealValue',
  'contacts', 'subNiche', 'intentTrigger', 'phone', 'website', 'linkedinUrl', 'evidenceLink',
  'reviewQuote', 'yearEst', 'address', 'zip', 'mobileScore', 'serviceFormat', 'profileStatus',
  'leadDestination', 'markupLoss', 'frictionFees', 'reviewDecay', 'recentComplaintQuote',
  'techFriction', 'priceRange', 'reviewCount', 'strategicPlay', 'priority', 'contactName',
  'contactTitle', 'lastScanDate', 'contactLog'
];
