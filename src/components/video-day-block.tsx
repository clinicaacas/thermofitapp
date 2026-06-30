import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Play, Info, Sparkles, Flag } from "lucide-react";
import { getClientVideoDayState } from "@/lib/thermofit-video-day.functions";

type Props = {
  clientId: string;
  identityKey: { tenantId?: string | null; clientId?: string | null; journeyId?: string | null } | null;
  onOpenVideo: (id: string) => void;
};

export function VideoDayBlock({ clientId, identityKey, onOpenVideo }: Props) {
  const fetcher = useServerFn(getClientVideoDayState);
  const { data, isLoading } = useQuery({
    queryKey: [
      "client-video-day-state",
      identityKey?.tenantId,
      identityKey?.clientId,
      identityKey?.journeyId,
    ],
    queryFn: () => fetcher({ data: { clientId } }),
    enabled: !!clientId && !!identityKey,
    staleTime: 0,
  });

  if (isLoading || !data) {
    return (
      <section className="mt-3">
        <Title />
        <div className="rounded-2xl bg-white p-3 text-sm" style={{ border: "1px solid #E5D6BD", color: "#6B7280" }}>
          Carregando…
        </div>
      </section>
    );
  }

  const { state, todayVideos, nextReleaseDay, pendingPriorVideos } = data as any;

  return (
    <section className="mt-2">
      <Title plural={todayVideos.length > 1} />
      {(state === "video_available" || state === "video_done") && (
        <ul className="space-y-1">
          {todayVideos.map((v: any) => (
            <li key={v.videoId}>
              <button
                onClick={() => onOpenVideo(v.videoId)}
                className="flex w-full items-center gap-2 rounded-xl bg-white p-2 text-left"
                style={{ border: `1px solid ${v.completed ? "#BFD8B7" : "#E5D6BD"}`, background: v.completed ? "#F1F8EF" : "#FFFFFF" }}
              >
                <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md" style={{ background: "#F3E8D2" }}>
                  {v.thumbnailUrl ? (
                    <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center">
                      <Play className="h-3.5 w-3.5" style={{ color: "#8A6A3D" }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight" style={{ color: "#1F2933" }}>
                    {v.title}
                  </p>
                  <p className="truncate text-[10px] capitalize leading-tight mt-0.5" style={{ color: "#6B7280" }}>
                    {v.category || "geral"} · {v.minCompletionPct}%
                  </p>
                </div>
                {v.completed ? (
                  <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#E8F2E5", color: "#3F7A3A" }}>
                    <Check className="h-3 w-3" /> {v.miles > 0 ? `+${v.miles}` : "Ok"}
                  </span>
                ) : v.miles > 0 ? (
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#F3E8D2", color: "#8A6A3D" }}>
                    +{v.miles}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}


      {state === "no_video_today" && (
        <InfoCard icon={<Info className="h-4 w-4" style={{ color: "#8A6A3D" }} />}>
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Hoje não há um vídeo programado para esta etapa.
          </p>
          <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
            Continue com suas outras missões e acompanhe os próximos conteúdos da sua jornada.
            {nextReleaseDay ? ` Seu próximo vídeo será liberado no dia ${nextReleaseDay} da jornada.` : ""}
          </p>
        </InfoCard>
      )}

      {state === "prior_pending" && (
        <InfoCard icon={<Info className="h-4 w-4" style={{ color: "#8A6A3D" }} />}>
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Hoje não há um vídeo programado para esta etapa.
          </p>
          <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
            Veja seus conteúdos anteriores na aba Vídeos.
          </p>
        </InfoCard>
      )}

      {state === "all_completed" && (
        <InfoCard icon={<Sparkles className="h-4 w-4" style={{ color: "#3F7A3A" }} />} tint="success">
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Você concluiu todos os vídeos planejados para esta jornada.
          </p>
          <p className="text-xs mt-1" style={{ color: "#6B7280" }}>Parabéns por manter sua evolução em dia.</p>
        </InfoCard>
      )}

      {state === "journey_finished" && (
        <InfoCard icon={<Flag className="h-4 w-4" style={{ color: "#8A6A3D" }} />}>
          <p className="text-sm font-semibold" style={{ color: "#1F2933" }}>
            Seu Plano de Voo foi concluído.
          </p>
          <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
            Continue acompanhando as orientações da clínica para manter seus resultados.
          </p>
        </InfoCard>
      )}
    </section>
  );
}

function Title({ plural }: { plural?: boolean } = {}) {
  return (
    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: "#8A6A3D" }}>
      {plural ? "Vídeos do dia" : "Vídeo do dia"}
    </h3>
  );
}

function InfoCard({
  icon,
  children,
  tint,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tint?: "success";
}) {
  const bg = tint === "success" ? "#F1F8EF" : "#FFFFFF";
  const border = tint === "success" ? "#BFD8B7" : "#E5D6BD";
  return (
    <div className="rounded-2xl p-3" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
