import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useServerFn } from "@tanstack/react-start";
import { Download, X, Loader2, AlertTriangle } from "lucide-react";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { fetchWorkoutMaterial } from "@/lib/thermofit-workout-plans.functions";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type Props = {
  open: boolean;
  path: string | null;
  title: string;
  onClose: () => void;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function WorkoutPlanPdfViewer({ open, path, title, onClose }: Props) {
  const fetcher = useServerFn(fetchWorkoutMaterial);
  const containerRef = useRef<HTMLDivElement>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [filename, setFilename] = useState<string>("material.pdf");
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    if (!open || !path) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setBytes(null);
    setNumPages(0);
    setCurrentPage(1);
    fetcher({ data: { path } })
      .then((res: any) => {
        if (!alive) return;
        setBytes(b64ToBytes(res.base64));
        setFilename(res.filename || "material.pdf");
      })
      .catch((e: any) => alive && setError(e?.message || "Falha ao carregar PDF."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, path, fetcher]);

  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.min(900, el.clientWidth - 24));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const fileProp = useMemo(() => (bytes ? { data: bytes } : null), [bytes]);

  function download() {
    if (!bytes) return;
    const blob = new Blob([bytes.slice()], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0F172A]/95 backdrop-blur-sm">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-white">
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          {numPages > 0 && (
            <p className="text-[11px] text-white/70">
              Página {currentPage} de {numPages}
            </p>
          )}
        </div>
        <button
          onClick={download}
          disabled={!bytes}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Baixar PDF
        </button>
      </header>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto px-3 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          const pages = el.querySelectorAll<HTMLDivElement>("[data-page-index]");
          const top = el.scrollTop + 80;
          for (const p of Array.from(pages)) {
            if (p.offsetTop + p.offsetHeight > top) {
              const idx = Number(p.dataset.pageIndex);
              if (idx && idx !== currentPage) setCurrentPage(idx);
              break;
            }
          }
        }}
      >
        {loading && (
          <div className="grid place-items-center py-16 text-white/80">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="mt-2 text-xs">Carregando plano…</p>
          </div>
        )}
        {error && (
          <div className="mx-auto max-w-md rounded-lg bg-white/10 p-4 text-center text-white">
            <AlertTriangle className="mx-auto h-5 w-5" />
            <p className="mt-2 text-sm font-medium">Não foi possível abrir o material</p>
            <p className="mt-1 text-xs text-white/70">{error}</p>
            <button
              onClick={onClose}
              className="mt-3 rounded-md bg-white/20 px-3 py-1.5 text-xs hover:bg-white/30"
            >
              Fechar
            </button>
          </div>
        )}
        {fileProp && (
          <div className="mx-auto flex flex-col items-center gap-3">
            <Document
              file={fileProp}
              onLoadSuccess={(d) => setNumPages(d.numPages)}
              onLoadError={(e) => setError(e?.message || "PDF inválido.")}
              loading={
                <div className="py-10 text-white/70">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </div>
              }
            >
              {Array.from({ length: numPages }, (_, i) => (
                <div
                  key={i}
                  data-page-index={i + 1}
                  className="mb-3 overflow-hidden rounded-md bg-white shadow-lg"
                >
                  <Page
                    pageNumber={i + 1}
                    width={width}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    loading={
                      <div className="grid h-[400px] place-items-center bg-white text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    }
                  />
                </div>
              ))}
            </Document>
          </div>
        )}
      </div>
    </div>
  );
}
