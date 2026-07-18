import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useHasFeature } from "@/hooks/useHasFeature";
import type { PosFeature } from "@/lib/verticals";

export function RequireFeature({
  feature,
  children,
  fallback = "/",
}: {
  feature: PosFeature;
  children: ReactNode;
  fallback?: string;
}) {
  const enabled = useHasFeature(feature);
  if (!enabled) {
    return <Navigate to={fallback} replace />;
  }
  return children;
}
