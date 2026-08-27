/**
 * 设置面板（D007 / D008）：⌘, 打开的模态。三段——brew 路径覆盖、网络代理、
 * 国内镜像源。校验与归一化都在 Rust 侧（settings.rs），本面板只负责收集草稿并
 * 展示后端返回的错误。
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, FolderSearch, Globe2, Loader2, Network, X } from "lucide-react";
import { cx } from "../../lib/cx";
import { ipc } from "../../lib/ipc";
import { useBrewStatus, useSaveSettings, useSettings } from "../../lib/queries";
import { useUiStore } from "../../lib/uiStore";
import type {
  MirrorPreset,
  MirrorSettings,
  MirrorTestResult,
  ProxySettings,
  Settings,
} from "../../types";

/** 仅用于界面预览；权威值由 Rust settings.rs 在保存时回填。 */
const PRESET_PREVIEW: Record<MirrorPreset, string> = {
  official: "https://formulae.brew.sh/api",
  tuna: "https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api",
  ustc: "https://mirrors.ustc.edu.cn/homebrew-bottles/api",
  custom: "",
};

const PRESET_TABS: { value: MirrorPreset; label: string }[] = [
  { value: "official", label: "官方" },
  { value: "tuna", label: "清华 TUNA" },
  { value: "ustc", label: "中科大" },
  { value: "custom", label: "自定义" },
];

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function cloneSettings(s: Settings): Settings {
  return {
    brew_path: s.brew_path,
    proxy: { ...s.proxy },
    mirror: { ...s.mirror },
  };
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 size-4 rounded-full bg-white transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono = true,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <input
        value={value}
        disabled={disabled}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "h-7 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500",
          mono && "font-mono",
        )}
      />
    </label>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
  right,
}: {
  icon: typeof Network;
  title: string;
  hint: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            <Icon className="size-3.5 text-neutral-400" />
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
            {hint}
          </p>
        </div>
        {right}
      </div>
      <div className="mt-3 space-y-2.5">{children}</div>
    </section>
  );
}

export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const settings = useSettings();
  const brewStatus = useBrewStatus();
  const save = useSaveSettings();

  const [draft, setDraft] = useState<Settings | null>(null);
  const [probe, setProbe] = useState<{ ok: boolean; text: string } | null>(null);
  const [probing, setProbing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingMirror, setTestingMirror] = useState(false);
  const [mirrorTest, setMirrorTest] = useState<MirrorTestResult | null>(null);

  // 打开时（或保存回写后）从后端真值重置草稿。
  useEffect(() => {
    if (open && settings.data !== undefined) {
      setDraft(cloneSettings(settings.data));
      setProbe(null);
      setSaved(false);
      setMirrorTest(null);
    }
  }, [open, settings.data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open || draft === null) return null;

  const patchProxy = (patch: Partial<ProxySettings>) =>
    setDraft((d) => (d === null ? d : { ...d, proxy: { ...d.proxy, ...patch } }));
  const patchMirror = (patch: Partial<MirrorSettings>) =>
    setDraft((d) =>
      d === null ? d : { ...d, mirror: { ...d.mirror, ...patch } },
    );

  const onProbe = () => {
    const candidate = draft.brew_path ?? "";
    setProbing(true);
    setProbe(null);
    void ipc
      .probeBrewPath(candidate)
      .then((status) =>
        setProbe({
          ok: true,
          text: `可用：brew ${status.version ?? "?"} @ ${status.path ?? candidate}`,
        }),
      )
      .catch((e: unknown) => setProbe({ ok: false, text: errorMessage(e) }))
      .finally(() => setProbing(false));
  };

  const customMirror = draft.mirror.preset === "custom";
  const mirrorPreview =
    draft.mirror.preset === "custom"
      ? draft.mirror.api_domain
      : PRESET_PREVIEW[draft.mirror.preset];

  const onTestMirror = () => {
    const base =
      draft.mirror.preset === "custom"
        ? draft.mirror.api_domain
        : PRESET_PREVIEW[draft.mirror.preset];
    setTestingMirror(true);
    setMirrorTest(null);
    void ipc
      .testMirror(base, draft.proxy)
      .then((r) => setMirrorTest(r))
      .catch((e: unknown) =>
        setMirrorTest({
          ok: false,
          latency_ms: null,
          code: null,
          message: errorMessage(e),
        }),
      )
      .finally(() => setTestingMirror(false));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-10 backdrop-blur-[1px]">
      <div className="flex max-h-full w-[600px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex shrink-0 items-center justify-between px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              设置
            </h2>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              仅作用于 Brewlet 发起的 brew 调用，不改动你的终端环境
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-500/10 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section
            icon={FolderSearch}
            title="Homebrew 位置"
            hint={`留空则自动探测（ARM /opt/homebrew → Intel /usr/local）。当前生效：${
              brewStatus.data?.path ?? "未检测到"
            }`}
          >
            <TextField
              label="brew 可执行文件绝对路径"
              value={draft.brew_path ?? ""}
              placeholder="/opt/homebrew/bin/brew"
              onChange={(v) =>
                setDraft((d) => (d === null ? d : { ...d, brew_path: v }))
              }
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onProbe}
                disabled={probing || (draft.brew_path ?? "").trim() === ""}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {probing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                校验
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => (d === null ? d : { ...d, brew_path: "" }))
                }
                className="text-[11px] text-neutral-400 underline-offset-2 hover:underline dark:text-neutral-500"
              >
                清空（回到自动探测）
              </button>
            </div>
            {probe !== null && (
              <p
                className={cx(
                  "break-all rounded-md p-2 font-mono text-[11px] leading-relaxed",
                  probe.ok
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-500/10 text-red-700 dark:text-red-400",
                )}
              >
                {probe.text}
              </p>
            )}
          </Section>

          <Section
            icon={Network}
            title="网络代理"
            hint="以环境变量注入 brew 子进程与目录抓取；不写入你的 shell 配置"
            right={
              <Switch
                label="启用代理"
                checked={draft.proxy.enabled}
                onChange={(enabled) => patchProxy({ enabled })}
              />
            }
          >
            <div className="space-y-2.5">
              <TextField
                label="代理地址（同时用于 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY）"
                value={draft.proxy.http || draft.proxy.https || draft.proxy.all}
                placeholder="http://127.0.0.1:7890"
                onChange={(v) => patchProxy({ http: v, https: v, all: v })}
              />
              <TextField
                label="NO_PROXY（不走代理的地址，逗号分隔）"
                value={draft.proxy.no_proxy}
                placeholder="localhost,127.0.0.1"
                onChange={(no_proxy) => patchProxy({ no_proxy })}
              />
            </div>
          </Section>

          <Section
            icon={Globe2}
            title="镜像源（国内加速）"
            hint="切换 HOMEBREW_API_DOMAIN / BOTTLE_DOMAIN / GIT_REMOTE，目录抓取同步走镜像"
            right={
              <Switch
                label="启用镜像"
                checked={draft.mirror.enabled}
                onChange={(enabled) => patchMirror({ enabled })}
              />
            }
          >
            <div className="flex rounded-lg bg-neutral-500/10 p-0.5">
              {PRESET_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() =>
                    patchMirror({
                      preset: tab.value,
                      enabled: tab.value !== "official",
                    })
                  }
                  className={cx(
                    "flex-1 rounded-[7px] px-2 py-1 text-xs font-medium transition-colors",
                    draft.mirror.preset === tab.value
                      ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                      : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {customMirror ? (
              <div className="space-y-2.5">
                <TextField
                  label="HOMEBREW_API_DOMAIN"
                  value={draft.mirror.api_domain}
                  disabled={!draft.mirror.enabled}
                  placeholder="https://example.com/homebrew-bottles/api"
                  onChange={(api_domain) => patchMirror({ api_domain })}
                />
                <TextField
                  label="HOMEBREW_BOTTLE_DOMAIN"
                  value={draft.mirror.bottle_domain}
                  disabled={!draft.mirror.enabled}
                  placeholder="https://example.com/homebrew-bottles"
                  onChange={(bottle_domain) => patchMirror({ bottle_domain })}
                />
                <TextField
                  label="HOMEBREW_BREW_GIT_REMOTE"
                  value={draft.mirror.brew_git_remote}
                  disabled={!draft.mirror.enabled}
                  placeholder="https://example.com/brew.git"
                  onChange={(brew_git_remote) => patchMirror({ brew_git_remote })}
                />
                <TextField
                  label="HOMEBREW_CORE_GIT_REMOTE"
                  value={draft.mirror.core_git_remote}
                  disabled={!draft.mirror.enabled}
                  placeholder="https://example.com/homebrew-core.git"
                  onChange={(core_git_remote) => patchMirror({ core_git_remote })}
                />
              </div>
            ) : (
              <p className="break-all rounded-md bg-neutral-500/5 p-2 font-mono text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                目录源：{mirrorPreview}
                <br />
                另外三个 HOMEBREW_* 变量会在保存时按预设自动填好。
              </p>
            )}
          </Section>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={onTestMirror}
            disabled={testingMirror || mirrorPreview.trim() === ""}
            title="用当前代理设置测试镜像源连通性"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {testingMirror ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            测试连通性
          </button>
          <div className="min-w-0 flex-1">
            {save.isError ? (
              <p className="break-all font-mono text-[11px] text-red-600 dark:text-red-400">
                {errorMessage(save.error)}
              </p>
            ) : mirrorTest !== null ? (
              <p
                className={cx(
                  "break-all font-mono text-[11px]",
                  mirrorTest.ok
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {mirrorTest.message}
              </p>
            ) : saved ? (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                已保存，目录会在下次刷新时走新配置。
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-7 shrink-0 rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              setSaved(false);
              save.mutate(draft, { onSuccess: () => setSaved(true) });
            }}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {save.isPending && <Loader2 className="size-3.5 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
