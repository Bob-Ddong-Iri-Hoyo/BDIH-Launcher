import { BTIH_API, BTIH_ENV } from "./preload"; // Preload bridge type exports.

declare global {
    interface Window {
        /**
         * Typed Electron IPC bridge exposed by the preload script.
         */
        readonly BTIH_API: BTIH_API;
        /**
         * Read-only environment values exposed by the preload script.
         */
        readonly BTIH_ENV: BTIH_ENV;
    }
}

export { };
