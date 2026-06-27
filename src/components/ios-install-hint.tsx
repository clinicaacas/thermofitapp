import { useEffect, useState } from "react";
import { X, Share } from "lucide-react";

const DISMISS_KEY = "thermofit_ios_install_hint_dismissed";

export function IOSInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
      const ua = window.navigator.userAgent;
      const isIOS = /iPhone|iPad|iPod/.test(ua);
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      if (isIOS && !isStandalone) setShow(true);
    } catch {
      // ignore
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-3 text-left text-[13px] text-neutral-700 shadow-sm">
      <div className="flex items-start gap-2">
        <Share className="mt-0.5 h-4 w-4 flex-none text-[#0B0F14]" aria-hidden />
        <div className="flex-1">
          <p className="font-medium text-[#0B111A]">
            Torne seu acesso mais rápido
          </p>
          <p className="mt-1 leading-snug text-neutral-600">
            Adicione o ThermoFit à Tela de Início e salve sua senha no iPhone
            para entrar com Face ID. Toque no botão{" "}
            <Share className="inline h-3 w-3 align-text-bottom" /> Compartilhar
            do Safari e escolha “Adicionar à Tela de Início”.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar"
          className="rounded p-1 text-neutral-400 hover:text-neutral-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
