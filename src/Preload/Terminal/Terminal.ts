import { contextBridge, ipcRenderer } from 'electron';

/**
 * Dedicated bridge for PTY terminal traffic.
 *
 * This stays separate from BTIH_API because terminal streams use a compact pair
 * of channels that are consumed directly by the terminal component.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    sendToPty: (data: string) => ipcRenderer.send('terminal-keystroke', data),
    onPtyData: (callback: (data: string) => void) =>
        ipcRenderer.on('terminal-incoming-data', (_event, data) => callback(data)),
});
