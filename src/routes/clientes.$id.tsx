import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import {
  getClient,
  adminClientStats,
  adminListClientMissionsToday,
  adminCreateMission,
  adminToggleMissionCompletion,
  adminCreateClientAccess,
  adminResetClientPassword,
  adminSetClientAccessStatus,
  updateClient,
} from "@/lib/thermofit-data.functions";
import { ArrowLeft, Edit, KeyRound, Camera, Apple, Dumbbell, Mail, MessageCircle, Plus, Check, Copy, UserPlus, Lock, Unlock } from "lucide-react";
import { useState } from "react";
import { AdminClientPhotosPanel } from "@/components/admin-client-photos-panel";



export const Route = createFileRoute("/clientes/$id")({
  head: () => ({ meta: [{ title: "Perfil da cliente — ThermoFit" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const fetcher = useServerFn(getClient);
  const fetchStats = useServerFn(adminClientStats);
  const fetchMissions = useServerFn(adminListClientMissionsToday);
  const { data, isLoading, error } = useQuery({
    queryKey: ["client", id],
    queryFn: () => fetcher({ data: { id } }),
  });
  const { data: stats } = useQuery({
    queryKey: ["client-stats", id],
    queryFn: () => fetchStats({ data: { clientId: id } }),
  });
  const { data: missionsToday } = useQuery({
    queryKey: ["client-missions-today", id],
    queryFn: () => fetchMissions({ data: { clientId: id } }),
  });

  const qc = useQueryClient();
  const createMission = useServerFn(adminCreateMission);
  const createMissionMut = useMutation({
    mutationFn: (input: { title: string; description?: string | null; miles?: number }) =>
      createMission({ data: { clientId: id, ...input } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-missions-today", id] });
      qc.invalidateQueries({ queryKey: ["client-stats", id] });
    },
  });

  function handleNewMission() {
    const title = window.prompt("Título da missão (para hoje):");
    if (!title || !title.trim()) return;
    const milesStr = window.prompt("Milhas (opcional, ex: 5):", "5") ?? "0";
    const miles = Math.max(0, parseInt(milesStr, 10) || 0);
    createMissionMut.mutate({ title: title.trim(), miles });
  }

  const toggleMission = useServerFn(adminToggleMissionCompletion);
  const toggleMissionMut = useMutation({
    mutationFn: (input: { missionId: string; done: boolean }) =>
      toggleMission({ data: { clientId: id, ...input } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-missions-today", id] });
      qc.invalidateQueries({ queryKey: ["client-stats", id] });
    },
  });

  const createAccess = useServerFn(adminCreateClientAccess);
  const resetAccess = useServerFn(adminResetClientPassword);
  const setAccessStatus = useServerFn(adminSetClientAccessStatus);
  const [accessForm, setAccessForm] = useState<{ open: boolean; email: string; password: string }>({ open: false, email: "", password: "" });
  const [accessResult, setAccessResult] = useState<{ email: string; password: string } | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const createAccessMut = useMutation({
    mutationFn: (input: { email: string; password?: string }) => createAccess({ data: { clientId: id, ...input } }),
    onSuccess: (r: any) => {
      setAccessResult({ email: r.client.accessEmail || accessForm.email, password: r.temporaryPassword });
      setAccessForm({ open: false, email: "", password: "" });
      setAccessError(null);
      qc.invalidateQueries({ queryKey: ["client", id] });
    },
    onError: (e: any) => setAccessError(e?.message ?? "Falha ao criar acesso."),
  });
  const resetAccessMut = useMutation({
    mutationFn: () => resetAccess({ data: { clientId: id } }),
    onSuccess: (r: any) => {
      setAccessResult({ email: (data as any)?.client?.accessEmail ?? "", password: r.temporaryPassword });
      qc.invalidateQueries({ queryKey: ["client", id] });
    },
  });
  const statusMut = useMutation({
    mutationFn: (status: "ativo" | "inativo" | "bloqueado") => setAccessStatus({ data: { clientId: id, status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", id] }),
  });

  const updateClientFn = useServerFn(updateClient);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const updateMut = useMutation({
    mutationFn: (patch: any) => updateClientFn({ data: { id, patch } }),
    onSuccess: () => {
      setEditOpen(false);
      setEditError(null);
      qc.invalidateQueries({ queryKey: ["client", id] });
    },
    onError: (e: any) => setEditError(e?.message ?? "Falha ao salvar."),
  });

  function openEdit() {
    const cli = (data as any)?.client;
    if (!cli) return;
    setEditForm({
      name: cli.name ?? "",
      email: cli.email ?? "",
      phone: cli.phone ?? "",
      birthDate: cli.birthDate ?? "",
      startDate: cli.startDate ?? "",
      plan: cli.plan ?? "",
      goal: cli.goal ?? "",
      complaint: cli.complaint ?? "",
      clinicalNotes: cli.clinicalNotes ?? "",
      hydrationGoalMl: cli.hydrationGoalMl ?? 2000,
      status: cli.status ?? "ativo",
    });
    setEditError(null);
    setEditOpen(true);
  }


  if (isLoading) {
    return <AppShell><p className="text-sm text-muted-foreground">Carregando…</p></AppShell>;
  }

  if (error || !data) {
    return <AppShell><p className="text-sm text-red-600">Cliente não encontrada.</p></AppShell>;
  }

  const c = data.client;
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(c.startDate).getTime()) / (1000 * 60 * 60 * 24)),
  );
  const week = Math.floor(days / 7) + 1;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/clientes" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary text-lg font-semibold">
              {c.avatarInitial}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{c.name}</h1>
              <div className="mt-1 flex gap-2 text-xs">
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{c.plan}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{c.status}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
            >
              <Edit className="h-4 w-4" /> Editar
            </button>

            <button className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">
              <KeyRound className="h-4 w-4" /> Reset senha
            </button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Dias" value={days} />
          <Stat label="Semana" value={week} />
          <Stat label="Milhas" value={stats?.miles ?? 0} />
          <Stat label="Missões hoje" value={`${stats?.missionsDoneToday ?? 0}/${stats?.missionsToday ?? 0}`} />
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <a
            href="#fotos-evolucao"
            className="flex items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-3 text-sm hover:bg-accent"
          >
            <Camera className="h-4 w-4" /> Fotos
          </a>
          <ActionLink to="/clientes/$id/conteudos" params={{ id }} icon={<Apple className="h-4 w-4" />} label="Nutrição" />
          <ActionLink to="/clientes/$id/conteudos" params={{ id }} icon={<Dumbbell className="h-4 w-4" />} label="Treino" />
          <ActionLink to="/clientes/$id/conteudos" params={{ id }} icon={<Mail className="h-4 w-4" />} label="Cartas" />
          <Action icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" />
        </div>

        <div id="fotos-evolucao">
          <AdminClientPhotosPanel clientId={id} />
        </div>


        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Contato">
            <Row label="Email" value={c.email || "—"} />
            <Row label="Telefone" value={c.phone || "—"} />
            <Row label="Nascimento" value={c.birthDate || "—"} />
            <Row label="Início" value={c.startDate} />
          </Card>
          <Card title="Objetivo e queixa">
            <Row label="Objetivo" value={c.goal || "—"} />
            <Row label="Queixa" value={c.complaint || "—"} />
            <Row label="Notas clínicas" value={c.clinicalNotes || "—"} />
            <Row label="Hidratação" value={`${c.hydrationGoalMl} ml/dia`} />
          </Card>
          <Card
            title="Missões de hoje"
            action={
              <button
                type="button"
                onClick={handleNewMission}
                disabled={createMissionMut.isPending}
                className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> Nova
              </button>
            }
          >

            {!missionsToday || missionsToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma missão atribuída hoje.</p>
            ) : (
              <ul className="space-y-2">
                {missionsToday.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "inline-block h-2 w-2 rounded-full " +
                            (m.done ? "bg-emerald-500" : "bg-muted-foreground/40")
                          }
                        />
                        <span
                          className={
                            "truncate font-medium " +
                            (m.done ? "text-muted-foreground line-through" : "text-foreground")
                          }
                        >
                          {m.title}
                        </span>
                      </div>
                      {m.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {m.description}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {m.miles} mi
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          toggleMissionMut.mutate({ missionId: m.id, done: !m.done })
                        }
                        disabled={toggleMissionMut.isPending}
                        className={
                          "inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs disabled:opacity-50 " +
                          (m.done
                            ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
                            : "border-input bg-card hover:bg-accent")
                        }
                        aria-label={m.done ? "Desfazer conclusão" : "Marcar como concluída"}
                        title={m.done ? "Desfazer conclusão" : "Marcar como concluída"}
                      >
                        {m.done ? <Check className="h-3 w-3" /> : null}
                      </button>
                    </div>
                  </li>

                ))}
              </ul>
            )}
          </Card>
          <Card title="Atividade recente">
            <Row
              label="Último pulso"
              value={
                stats?.lastPulse
                  ? `${stats.lastPulse.week_start} · humor ${stats.lastPulse.mood ?? "—"} · energia ${stats.lastPulse.energy ?? "—"}`
                  : "Nenhum pulso registrado"
              }
            />
            <Row label="Cartas não lidas" value={String(stats?.unreadLetters ?? 0)} />
            <Row label="Fotos enviadas" value={String(stats?.photosCount ?? 0)} />
          </Card>
        </div>

        {/* Acesso da Cliente */}
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Acesso da Cliente</h2>
            <span className={
              "rounded-full px-2 py-0.5 text-xs " +
              (c.accessStatus === "ativo"
                ? "bg-emerald-100 text-emerald-700"
                : c.accessStatus === "sem_acesso"
                  ? "bg-muted text-muted-foreground"
                  : "bg-red-100 text-red-700")
            }>
              {c.accessStatus === "sem_acesso" ? "Sem acesso" : c.accessStatus}
            </span>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <Row label="E-mail de acesso" value={c.accessEmail || "—"} />
            <Row label="Último acesso" value={c.lastAccessAt ? new Date(c.lastAccessAt).toLocaleString("pt-BR") : "—"} />
            <Row label="Link" value="https://thermofitapp.lovable.app/login" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {c.accessStatus === "sem_acesso" || !c.authUserId ? (
              <button
                type="button"
                onClick={() => setAccessForm({ open: true, email: c.email || "", password: "" })}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <UserPlus className="h-4 w-4" /> Criar acesso
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => resetAccessMut.mutate()}
                  disabled={resetAccessMut.isPending}
                  className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  <KeyRound className="h-4 w-4" /> Redefinir senha
                </button>
                {c.accessStatus === "ativo" ? (
                  <button
                    type="button"
                    onClick={() => statusMut.mutate("inativo")}
                    disabled={statusMut.isPending}
                    className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    <Lock className="h-4 w-4" /> Inativar acesso
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => statusMut.mutate("ativo")}
                    disabled={statusMut.isPending}
                    className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    <Unlock className="h-4 w-4" /> Reativar acesso
                  </button>
                )}
              </>
            )}
          </div>

          {accessForm.open && (
            <div className="mt-4 rounded-md border border-border bg-muted/40 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  <span className="mb-1 block text-muted-foreground">E-mail</span>
                  <input
                    type="email"
                    value={accessForm.email}
                    onChange={(e) => setAccessForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs">
                  <span className="mb-1 block text-muted-foreground">Senha (opcional, gera automática se vazio)</span>
                  <input
                    type="text"
                    value={accessForm.password}
                    onChange={(e) => setAccessForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
              {accessError && <p className="mt-2 text-xs text-red-600">{accessError}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!accessForm.email || createAccessMut.isPending}
                  onClick={() =>
                    createAccessMut.mutate({
                      email: accessForm.email,
                      password: accessForm.password || undefined,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setAccessForm({ open: false, email: "", password: "" })}
                  className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {accessResult && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="font-medium text-emerald-800">Acesso pronto! Copie e envie para a cliente:</p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-emerald-900">{`Olá, seu acesso ao ThermoFit Acas foi criado.

Acesse pelo link abaixo:
https://thermofitapp.lovable.app/login

E-mail: ${accessResult.email}
Senha: ${accessResult.password}

Ao entrar, você será direcionada automaticamente para o seu painel de acompanhamento.

Importante: este acesso é pessoal e não deve ser compartilhado.`}</pre>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const txt = `Olá, seu acesso ao ThermoFit Acas foi criado.\n\nAcesse pelo link abaixo:\nhttps://thermofitapp.lovable.app/login\n\nE-mail: ${accessResult.email}\nSenha: ${accessResult.password}\n\nAo entrar, você será direcionada automaticamente para o seu painel de acompanhamento.\n\nImportante: este acesso é pessoal e não deve ser compartilhado.`;
                    void navigator.clipboard?.writeText(txt);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs hover:bg-emerald-50"
                >
                  <Copy className="h-3 w-3" /> Copiar dados de acesso
                </button>
                <button
                  type="button"
                  onClick={() => setAccessResult(null)}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </section>

      </div>

      {editOpen && editForm && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => setEditOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-base font-semibold text-foreground">Editar cliente</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome" value={editForm.name} onChange={(v) => setEditForm((f: any) => ({ ...f, name: v }))} />
              <Field label="E-mail" type="email" value={editForm.email} onChange={(v) => setEditForm((f: any) => ({ ...f, email: v }))} />
              <Field label="Telefone" value={editForm.phone} onChange={(v) => setEditForm((f: any) => ({ ...f, phone: v }))} />
              <Field label="Nascimento" type="date" value={editForm.birthDate} onChange={(v) => setEditForm((f: any) => ({ ...f, birthDate: v }))} />
              <Field label="Início" type="date" value={editForm.startDate} onChange={(v) => setEditForm((f: any) => ({ ...f, startDate: v }))} />
              <Field label="Plano" value={editForm.plan} onChange={(v) => setEditForm((f: any) => ({ ...f, plan: v }))} />
              <Field label="Objetivo" value={editForm.goal} onChange={(v) => setEditForm((f: any) => ({ ...f, goal: v }))} />
              <Field label="Queixa" value={editForm.complaint} onChange={(v) => setEditForm((f: any) => ({ ...f, complaint: v }))} />
              <Field
                label="Hidratação (ml/dia)"
                type="number"
                value={String(editForm.hydrationGoalMl)}
                onChange={(v) => setEditForm((f: any) => ({ ...f, hydrationGoalMl: parseInt(v, 10) || 0 }))}
              />
              <label className="text-xs sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">Notas clínicas</span>
                <textarea
                  rows={3}
                  value={editForm.clinicalNotes}
                  onChange={(e) => setEditForm((f: any) => ({ ...f, clinicalNotes: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            {editError && <p className="mt-3 text-xs text-red-600">{editError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={updateMut.isPending}
                onClick={() => updateMut.mutate(editForm)}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {updateMut.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>

  );
}


function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Action({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-3 text-sm hover:bg-accent">
      {icon} {label}
    </button>
  );
}

function ActionLink({
  to,
  params,
  icon,
  label,
}: {
  to: string;
  params: Record<string, string>;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to as any}
      params={params as any}
      className="flex items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-3 text-sm hover:bg-accent"
    >
      {icon} {label}
    </Link>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
