
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Partner } from './leads-schema';

const PARTNERS_LOCAL_STORAGE_KEY = 'bdl-partners-v1';

export const savePartners = (partners: Partner[]) => {
  localStorage.setItem(PARTNERS_LOCAL_STORAGE_KEY, JSON.stringify(partners));
};

export const readPartners = (): Partner[] => {
  const data = localStorage.getItem(PARTNERS_LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const addPartner = (partner: Partner) => {
  const partners = readPartners();
  savePartners([partner, ...partners]);
};

export const logPartnerInteraction = (partnerId: string, action: string, notes: string) => {
    const partners = readPartners();
    const partner = partners.find(p => p.id === partnerId);
    if (!partner) return;
    
    if (!partner.communicationLog) {
        partner.communicationLog = [];
    }
    
    partner.communicationLog.unshift({
        date: new Date().toISOString(),
        action,
        notes
    });
    
    savePartners(partners);
};
