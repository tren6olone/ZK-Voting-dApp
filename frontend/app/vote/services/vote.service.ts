import { ZKProofData } from "../types";

// --- THE UPGRADE: A Safe Fetch Wrapper ---
// This prevents the frontend from crashing if the backend sends an empty or HTML response.
async function safeFetch(url: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // 1. Read the raw response as text first
    const text = await response.text();

    // 2. If the server sent absolutely nothing, catch it
    if (!text) {
      return { success: false, error: `Backend crashed silently (Status: ${response.status}). Check server terminal.` };
    }

    // 3. Try to parse the JSON. If the server sent HTML (like a 500 error page), catch it!
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error(`Invalid JSON from ${url}:`, text);
      return { success: false, error: `Backend returned invalid data. Check browser console for raw text.` };
    }
    
  } catch (networkError: unknown) {
    const msg = networkError instanceof Error ? networkError.message : String(networkError);
    return { success: false, error: `Network Error: ${msg}` };
  }
}

// --- THE SERVICES ---

export const submitVoteToRelayer = async (proposalId: number, zkData: ZKProofData) => {
  return safeFetch('/api/relayer-vote', { proposalId, ...zkData });
};

export const finalizeProposalTally = async (proposalId: number, totalMembers: number) => {
  return safeFetch('/api/finalize-tally', { proposalId, totalMembers });
};