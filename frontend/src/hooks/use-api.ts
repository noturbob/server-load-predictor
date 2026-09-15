"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { ClusterConfigUpdate, Metric } from "@/lib/types";

const POLL_MS = 5000;

/** The simulation clock drives every other query: when "now" moves, dependent data refetches. */
export function useSimulation() {
  return useQuery({
    queryKey: ["simulation"],
    queryFn: api.simulation,
    refetchInterval: 2000,
  });
}

function useNow() {
  return useSimulation().data?.now;
}

function live<T>(key: unknown[], fn: () => Promise<T>, now: string | undefined, enabled = true) {
  return {
    queryKey: [...key, now],
    queryFn: fn,
    enabled: enabled && !!now,
    placeholderData: keepPreviousData,
    refetchInterval: POLL_MS,
  };
}

export function useClusters() {
  const now = useNow();
  return useQuery(live(["clusters"], api.clusters, now));
}

export function useCluster(id: string) {
  const now = useNow();
  return useQuery(live(["cluster", id], () => api.cluster(id), now));
}

export function useUsage(id: string, metric: Metric, hours: number) {
  const now = useNow();
  return useQuery(live(["usage", id, metric, hours], () => api.usage(id, metric, hours), now));
}

export function useForecast(id: string, metric: Metric, horizon: number) {
  const now = useNow();
  return useQuery(live(["forecast", id, metric, horizon], () => api.forecast(id, metric, horizon), now));
}

export function useHistoryVsPredicted(id: string, metric: Metric, hours: number) {
  const now = useNow();
  return useQuery(
    live(["history", id, metric, hours], () => api.historyVsPredicted(id, metric, hours), now),
  );
}

export function useRecommendations(id: string, horizon: number) {
  const now = useNow();
  return useQuery(live(["recommendations", id, horizon], () => api.recommendations(id, horizon), now));
}

export function useModelMetrics() {
  return useQuery({ queryKey: ["model-metrics"], queryFn: api.modelMetrics, refetchInterval: 30_000 });
}

export function useUpdateConfig(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ClusterConfigUpdate) => api.updateConfig(id, body),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "simulation" }),
  });
}

export function useSimulationControls() {
  const qc = useQueryClient();
  const onSuccess = (state: Awaited<ReturnType<typeof api.simulation>>) => {
    qc.setQueryData(["simulation"], state);
  };
  return {
    play: useMutation({ mutationFn: () => api.simulationAction("play"), onSuccess }),
    pause: useMutation({ mutationFn: () => api.simulationAction("pause"), onSuccess }),
    reset: useMutation({ mutationFn: () => api.simulationAction("reset"), onSuccess }),
    step: useMutation({ mutationFn: (hours: number) => api.simulationStep(hours), onSuccess }),
  };
}
