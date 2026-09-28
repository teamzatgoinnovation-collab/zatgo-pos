import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  posRepo,
  type KdsTicket,
  type KitchenStation,
  type OrderRecord,
  type TableRecord,
  type TableStatus,
} from "@/lib/pos-repo";

/**
 * Order-level actions shared by SellPage, OrdersPage, and KdsPage.
 * Each mutation carries the common invalidate + toast + error-toast behavior;
 * callers can still layer page-specific onSuccess/onError via mutate(vars, { onSuccess, onError }).
 */
export function usePosOrderActions() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["pos"] });

  const send = useMutation({
    mutationFn: (orderId: string) => posRepo.sendOrder(orderId),
    onSuccess: () => {
      invalidate();
      toast.success("Sent to kitchen");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNote = useMutation({
    mutationFn: ({ orderId, note }: { orderId: string; note: string }) =>
      posRepo.setOrderNote(orderId, note),
    onSuccess: () => {
      invalidate();
      toast.success("Note saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidOrder = useMutation({
    mutationFn: (orderId: string) => posRepo.voidOrder(orderId),
    onSuccess: () => {
      invalidate();
      toast.success("Order voided");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const giveToDelivery = useMutation({
    mutationFn: (orderId: string) => posRepo.giveToDelivery(orderId),
    onSuccess: (updated: OrderRecord) => {
      invalidate();
      toast.success(`Order #${updated.number} given to Delivery`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { send, saveNote, voidOrder, giveToDelivery, invalidate };
}

/** KDS ticket actions shared by SellPage and KdsPage. */
export function usePosKdsActions() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["pos"] });

  const advance = useMutation({
    mutationFn: (itemId: string) => posRepo.advanceKdsItem(itemId),
    onSuccess: (item: KdsTicket) => {
      invalidate();
      toast.success(`${item.name} → ${item.status}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recall = useMutation({
    mutationFn: (itemId: string) => posRepo.recallKdsItem(itemId),
    onSuccess: (item: KdsTicket) => {
      invalidate();
      toast.success(`Recalled ${item.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bump = useMutation({
    mutationFn: (station: KitchenStation) => posRepo.bumpStationReady(station),
    onSuccess: ({ count }: { count: number }) => {
      invalidate();
      toast.success(count ? `Bumped ${count} ready` : "Nothing ready to bump");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { advance, recall, bump, invalidate };
}

/** Table actions shared by SellPage and FloorPage. */
export function usePosTableActions() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["pos"] });

  const seat = useMutation({
    mutationFn: ({ tableId, covers }: { tableId: string; covers: number }) =>
      posRepo.seatTable(tableId, covers),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearTable = useMutation({
    mutationFn: (tableId: string) => posRepo.setTableStatus(tableId, "free" as TableStatus),
    onSuccess: () => {
      invalidate();
      toast.success("Table cleared");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestBill = useMutation({
    mutationFn: (orderId: string) => posRepo.markBilling(orderId),
    onSuccess: () => {
      invalidate();
      toast.success("Table marked for billing");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { seat, clearTable, requestBill, invalidate };
}

export type { OrderRecord, TableRecord };
