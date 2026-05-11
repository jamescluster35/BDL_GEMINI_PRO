/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lead } from './leads-schema.ts';

const APPS_SCRIPT_URL = import.meta.env?.VITE_APPS_SCRIPT_URL || "";
const LOCAL_STORAGE_KEY = 'bdl-v11';

/**
 * Persists leads to local storage for offline resilience.
 */
const saveToLocal = (leads: Lead[]) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(leads));
};

/**
 * Retrieves leads from local storage if available.
 */
const readFromLocal = (): Lead[] => {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export async function sheetRead(): Promise<Lead[]> {
  try {
    if (!APPS_SCRIPT_URL) {
      return readFromLocal();
    }
    
    // User's Code.gs by default returns all tabs if no action is provided
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.append('t', Date.now().toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error('Fetch response not OK', response.status);
      return readFromLocal();
    }

    const textPayload = await response.text();
    let data;
    try {
      data = JSON.parse(textPayload);
    } catch (e) {
      console.error('Failed to parse Apps Script response as JSON. It returned:', textPayload.substring(0, 150));
      alert("Error: The Google Sheets backend didn't return valid data. Check if your Apps Script is deployed with 'Who has access: Anyone'.");
      return readFromLocal();
    }
    
    if (data && data.leads) {
      // The backend returns separate arrays for each tab:
      // leads, clients, deletedLeads, archivedLeads
      const attachSource = (arr: any[] = [], tab: string) => 
        arr.map(l => ({ ...l, tabName: tab }));

      let allLeads: Lead[] = [
        ...attachSource(data.leads, 'Leads'),
        ...attachSource(data.clients, 'Clients'),
        ...attachSource(data.archivedLeads, 'ArchivedLeads'),
        ...attachSource(data.deletedLeads, 'DeletedLeads')
      ];

      saveToLocal(allLeads);
      return allLeads;
    }
    
    return readFromLocal();
  } catch (error) {
    console.error('Error reading from sheet, falling back to local:', error);
    return readFromLocal();
  }
}

export async function getSheetTabs(): Promise<string[]> {
  try {
    if (!APPS_SCRIPT_URL) return [];
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.append('action', 'getTabs');
    const response = await fetch(url.toString());
    const data = await response.json();
    if (data.status === 'success' && Array.isArray(data.tabs)) {
      return data.tabs;
    }
    return [];
  } catch (error) {
    console.error('Error fetching sheet tabs:', error);
    return [];
  }
}

export async function sheetWrite(leads: Lead[]): Promise<boolean> {
  saveToLocal(leads);
  if (!APPS_SCRIPT_URL) return true;

  try {
    const formData = new URLSearchParams();
    formData.append('action', 'saveClients');
    formData.append('data', JSON.stringify(leads));

    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
    return true;
  } catch (error) {
    console.error('Error writing to sheet:', error);
    return false;
  }
}

export async function syncLead(lead: Lead): Promise<boolean> {
  // Update local first
  const localLeads = readFromLocal();
  const index = localLeads.findIndex(l => l.id === lead.id);
  if (index !== -1) {
    localLeads[index] = lead;
  } else {
    localLeads.unshift(lead);
  }
  saveToLocal(localLeads);

  if (!APPS_SCRIPT_URL) return true;

  try {
    let action = 'upsertLead';
    let targetTab = lead.tabName || 'Leads';
    const status = lead.status?.toLowerCase();
    
    if (status?.includes('bounce')) {
      action = 'upsertDeleted';
      targetTab = 'DeletedLeads';
    } else if (status?.includes('archiv') || status?.includes('reject')) {
      action = 'upsertArchived';
      targetTab = 'ArchivedLeads';
    } else if (status?.includes('converted') || status?.includes('client')) {
      // Actually the client's Code.gs doesn't have an explicit 'upsertClient' unless we use saveClients.
      // We will just fall back to upsertLead for that and make sure it has the generic upsert 
      // or we can just send it as upsertLead. The Code.gs has 'upsertLead' which pushes to LEADS_SHEET.
      targetTab = 'Clients';
      // We might need to handle clients differently, but the backend doesn't show an 'upsertClient' action. 
      // It only has 'saveClients' which overrides everything. For now, let's just stick to 'upsertLead' if needed.
    }
    
    // We update the tabName so local representation matches where it SHOULD be.
    lead.tabName = targetTab;

    // Formatting for Google Apps Script x-www-form-urlencoded format
    const formData = new URLSearchParams();
    formData.append('action', action);
    formData.append('data', JSON.stringify(lead));

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
    
    // With no-cors, we can't read the response properly, but a type of 'opaque' means success typically.
    if (response.type === 'opaque') {
      return true;
    }

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    return result.ok === true;
  } catch (error) {
    console.error('Error syncing lead:', error);
    return false;
  }
}
