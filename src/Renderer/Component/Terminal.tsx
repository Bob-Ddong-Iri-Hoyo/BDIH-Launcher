import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Box } from "./Primitives";

/** Props for embedding the xterm terminal viewport. */
export interface XTermTerminalProps {
  className?: string;
  height?: string | number;
  welcomeMessage?: string;
}

const XTermTerminal: React.FC<XTermTerminalProps> = ({
  className = "",
  height = "100%",
  welcomeMessage,
}) => {
  const { t, i18n } = useTranslation();
  const terminalRef = useRef<HTMLElement>(null);
  const xterm = useRef<Terminal | null>(null);

  useEffect(() => {
    const container = terminalRef.current;

    if (!container) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      theme: {
        background: "#0b1020",
        foreground: "#d1d5db",
        cursor: "#fb7185",
        green: "#34d399",
      },
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      convertEol: true,
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(container);
    requestAnimationFrame(() => safe_fit_terminal(fitAddon));
    terminal.writeln(`\x1B[1;32m${welcomeMessage ?? t("terminal.defaultWelcome")}\x1B[0m`);
    terminal.writeln(t("terminal.bridgeReady"));
    terminal.write("\r\n$ ");

    const disposable = terminal.onData((data) => {
      const code = data.charCodeAt(0);

      if (code === 13) {
        terminal.write("\r\n$ ");
        return;
      }

      if (code === 127) {
        terminal.write("\b \b");
        return;
      }

      terminal.write(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      safe_fit_terminal(fitAddon);
    });
    resizeObserver.observe(container);
    xterm.current = terminal;

    return () => {
      resizeObserver.disconnect();
      disposable.dispose();
      terminal.dispose();
      xterm.current = null;
    };
  }, [i18n.language, t, welcomeMessage]);

  return (
    <Box
      ref={terminalRef}
      className={`min-h-0 w-full overflow-hidden rounded-lg border border-white/10 bg-[#0b1020] ${className}`}
      style={{ height }}
    />
  );
};

function safe_fit_terminal(fitAddon: FitAddon) {
  try {
    fitAddon.fit();
  } catch (error) {
    console.warn("Failed to fit terminal viewport:", error);
  }
}

export default XTermTerminal;
