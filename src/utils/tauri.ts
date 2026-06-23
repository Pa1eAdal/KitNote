export const isTauriRuntime = (): boolean => Boolean("__TAURI_INTERNALS__" in window);

export const invokeCommand = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  if (!isTauriRuntime()) {
    throw new Error(`The ${command} command is only available inside KitNote desktop.`);
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
};
