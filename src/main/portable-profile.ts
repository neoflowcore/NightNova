import path from 'node:path'

/**
 * Portable builds are unpacked to a temporary directory at runtime, so
 * app.getAppPath() and process.execPath cannot be used for persistent data.
 *
 * electron-builder injects PORTABLE_EXECUTABLE_DIR with the ORIGINAL EXE's
 * directory. Keep the profile beside it; Windows installer users continue
 * using their existing AppData profile unchanged.
 */
export function portableProfileDirectory(
  platform: NodeJS.Platform,
  packaged: boolean,
  executableDir?: string
): string | null {
  if (platform !== 'win32' || !packaged || !executableDir?.trim()) return null
  return path.win32.join(path.win32.resolve(executableDir), 'NightNova-Data')
}
