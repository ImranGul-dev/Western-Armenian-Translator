"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_SYSTEM_FEATURE_TOGGLES,
  loadSystemFeatureToggles,
  normalizeSystemFeatureToggles,
  type SystemFeatureToggle,
  type SystemFeatureToggles,
} from "@/lib/system-feature-toggles";

export const SYSTEM_FEATURE_TOGGLES_UPDATED_EVENT =
  "tun-system-feature-toggles-updated";

interface SystemFeatureToggleContextValue {
  toggles: SystemFeatureToggles;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SystemFeatureToggleContext =
  createContext<SystemFeatureToggleContextValue | null>(
    null,
  );

export function SystemFeatureToggleProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [toggles, setToggles] =
    useState<SystemFeatureToggles>(
      DEFAULT_SYSTEM_FEATURE_TOGGLES,
    );

  const [loading, setLoading] =
    useState(true);

  const refresh =
    useCallback(async () => {
      try {
        const next =
          await loadSystemFeatureToggles();

        setToggles(next);
      } catch (error) {
        console.error(
          "System feature toggles could not be loaded",
          error,
        );

        // Fail open so a settings lookup problem does not create a site-wide outage.
        setToggles(
          DEFAULT_SYSTEM_FEATURE_TOGGLES,
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleUpdate = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<unknown>;

      setToggles(
        normalizeSystemFeatureToggles(
          customEvent.detail,
        ),
      );

      setLoading(false);
    };

    window.addEventListener(
      SYSTEM_FEATURE_TOGGLES_UPDATED_EVENT,
      handleUpdate,
    );

    return () => {
      window.removeEventListener(
        SYSTEM_FEATURE_TOGGLES_UPDATED_EVENT,
        handleUpdate,
      );
    };
  }, []);

  const value =
    useMemo(
      () => ({
        toggles,
        loading,
        refresh,
      }),
      [
        toggles,
        loading,
        refresh,
      ],
    );

  return (
    <SystemFeatureToggleContext.Provider
      value={value}
    >
      {children}
    </SystemFeatureToggleContext.Provider>
  );
}

export function useSystemFeatureToggles() {
  const context =
    useContext(
      SystemFeatureToggleContext,
    );

  if (!context) {
    throw new Error(
      "useSystemFeatureToggles must be used within SystemFeatureToggleProvider.",
    );
  }

  return context;
}

export function useSystemFeatureEnabled(
  feature: SystemFeatureToggle,
) {
  const {
    toggles,
    loading,
  } = useSystemFeatureToggles();

  return {
    enabled:
      toggles[feature],
    loading,
  };
}
