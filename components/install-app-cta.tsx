"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstalledRelatedApp = { platform: string };
type InstallAwareNavigator = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<InstalledRelatedApp[]>;
};

let deferredInstallPrompt: InstallPromptEvent | null = null;
let knownInstalled = false;
const installStateListeners = new Set<() => void>();

function notifyInstallState() {
  installStateListeners.forEach(listener => listener());
}

function isIosDevice() {
  return typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
}

function isStandalone() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const currentNavigator = navigator as InstallAwareNavigator;
  return window.matchMedia("(display-mode: standalone)").matches || currentNavigator.standalone === true;
}

function getInstallSnapshot() {
  if (typeof window === "undefined") return 0;
  return Number(isIosDevice()) | (Number(Boolean(deferredInstallPrompt)) << 1)
    | (Number(knownInstalled || isStandalone()) << 2);
}

function subscribeInstallState(listener: () => void) {
  installStateListeners.add(listener);
  return () => installStateListeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", event => {
    const installEvent = event as InstallPromptEvent;
    installEvent.preventDefault();
    deferredInstallPrompt = installEvent;
    notifyInstallState();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    knownInstalled = true;
    notifyInstallState();
  });
}

export function InstallAppCta() {
  const installSnapshot = useSyncExternalStore(subscribeInstallState, getInstallSnapshot, () => 0);
  const ios = Boolean(installSnapshot & 1);
  const installAvailable = Boolean(installSnapshot & 2);
  const installed = Boolean(installSnapshot & 4);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    const currentNavigator = navigator as InstallAwareNavigator;
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const refreshInstallState = () => notifyInstallState();
    standaloneQuery.addEventListener("change", refreshInstallState);

    void currentNavigator.getInstalledRelatedApps?.()
      .then(apps => {
        if (apps.some(app => app.platform === "webapp")) {
          knownInstalled = true;
          notifyInstallState();
        }
      })
      .catch(() => undefined);

    return () => {
      standaloneQuery.removeEventListener("change", refreshInstallState);
    };
  }, []);

  const install = async () => {
    if (ios) {
      setShowIosInstructions(current => !current);
      return;
    }

    const promptEvent = deferredInstallPrompt;
    if (!promptEvent) return;

    deferredInstallPrompt = null;
    notifyInstallState();
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        knownInstalled = true;
        notifyInstallState();
      }
    } catch {
      // The browser owns the installation flow and may dismiss it at any time.
    }
  };

  const visible = !installed && (installAvailable || ios);

  return (
    <div className="pwa-install-slot" aria-live="polite">
      {visible && (
        <button
          className="pwa-install-button"
          type="button"
          onClick={install}
          aria-expanded={ios ? showIosInstructions : undefined}
          aria-controls={ios ? "ios-install-instructions" : undefined}
        >
          Instalar CheckFlow
        </button>
      )}
      {ios && showIosInstructions && !installed && (
        <p className="pwa-install-instructions" id="ios-install-instructions" role="status">
          No Safari, toque em <strong>Compartilhar</strong> e escolha <strong>Adicionar à Tela de Início</strong>.
        </p>
      )}
    </div>
  );
}
