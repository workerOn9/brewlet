/**
 * Full-screen guide when Homebrew is not found (or the check failed).
 * GUI never touches credentials — we only point to the official installer.
 */
import { Settings as SettingsIcon, TerminalSquare } from "lucide-react";

export function BrewMissing({
  checkError,
  onOpenSettings,
}: {
  checkError?: string;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-neutral-50 p-8 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
            <TerminalSquare className="size-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              未检测到 Homebrew
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Brewlet 需要本机安装 Homebrew 才能工作
            </p>
          </div>
        </div>

        <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
          <li>打开「终端」(Terminal.app)</li>
          <li>粘贴并运行官方安装命令：</li>
        </ol>
        <pre className="mt-3 select-all overflow-x-auto rounded-lg bg-neutral-100 p-3 font-mono text-xs leading-relaxed text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
          {'/bin/bash -c "$(curl -fsSL\n  https://raw.githubusercontent.com/\n  Homebrew/install/HEAD/install.sh)"'}
        </pre>
        <ol
          className="mt-3 list-decimal space-y-2 pl-5 text-sm text-neutral-600 dark:text-neutral-300"
          start={3}
        >
          <li>安装完成后重新启动 Brewlet</li>
        </ol>

        {checkError !== undefined && (
          <p className="mt-4 break-words rounded-lg bg-red-500/10 p-3 font-mono text-xs text-red-700 dark:text-red-400">
            检测失败：{checkError}
          </p>
        )}

        <p className="mt-4 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
          提示：Apple Silicon 上 Homebrew 默认安装在
          <span className="font-mono"> /opt/homebrew</span>。
        </p>

        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-4 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-300 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <SettingsIcon className="size-3.5" />
          已经装了？手动指定 brew 路径
        </button>
      </div>
    </div>
  );
}
