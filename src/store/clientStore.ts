import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface Client {
  id: string;
  name: string;
  email: string;
  address: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface State {
  clients: Client[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  createClient: (input: { name: string; email?: string; address?: string; notes?: string }) => Promise<Client | null>;
  updateClient: (id: string, patch: Partial<Pick<Client, 'name' | 'email' | 'address' | 'notes' | 'archived'>>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  /** Find or create a client by name (case-insensitive). Used when migrating from free-text clientName. */
  findOrCreateByName: (name: string) => Promise<Client | null>;
  getById: (id: string | null | undefined) => Client | undefined;
}

function rowToClient(r: any): Client {
  return {
    id: r.id,
    name: r.name,
    email: r.email || '',
    address: r.address || '',
    notes: r.notes || '',
    archived: !!r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const useClientStore = create<State>((set, get) => ({
  clients: [],
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { set({ loading: false, loaded: true }); return; }
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });
    set({ clients: (data || []).map(rowToClient), loaded: true, loading: false });
  },

  createClient: async ({ name, email = '', address = '', notes = '' }) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('clients')
      .insert({ user_id: user.id, name: trimmed, email, address, notes })
      .select()
      .single();
    if (error || !data) return null;
    const client = rowToClient(data);
    set(s => ({ clients: [...s.clients, client].sort((a, b) => a.name.localeCompare(b.name)) }));
    return client;
  },

  updateClient: async (id, patch) => {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.address !== undefined) row.address = patch.address;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.archived !== undefined) row.archived = patch.archived;
    const { data, error } = await supabase
      .from('clients')
      .update(row as never)
      .eq('id', id)
      .select()
      .single();
    if (error || !data) return;
    const client = rowToClient(data);
    set(s => ({
      clients: s.clients.map(c => c.id === id ? client : c).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  deleteClient: async (id) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) return;
    set(s => ({ clients: s.clients.filter(c => c.id !== id) }));
  },

  findOrCreateByName: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = get().clients.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    return get().createClient({ name: trimmed });
  },

  getById: (id) => {
    if (!id) return undefined;
    return get().clients.find(c => c.id === id);
  },
}));
