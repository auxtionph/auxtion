import { create } from 'zustand';

interface ActiveAuction {
  id: string;
  title: string;
  streamUrl: string;
  shopItems: { id: string; title: string; status: string }[];
}

interface RejoinStore {
  activeAuction: ActiveAuction | null;
  setActiveAuction: (auction: ActiveAuction | null) => void;
}

export const useRejoinStore = create<RejoinStore>((set) => ({
  activeAuction: null,
  setActiveAuction: (auction) => set({ activeAuction: auction }),
}));