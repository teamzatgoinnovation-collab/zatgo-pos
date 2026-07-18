import { create } from "zustand";
import type { PosDocument } from "@/lib/pos-document";

type LastSaleState = {
  document: PosDocument | null;
  setDocument: (document: PosDocument | null) => void;
};

export const useLastSaleStore = create<LastSaleState>((set) => ({
  document: null,
  setDocument: (document) => set({ document }),
}));
