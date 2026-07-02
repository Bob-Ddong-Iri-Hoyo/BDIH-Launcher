import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { DirectExecutableActionForm } from "../../Component/DirectExecutableActionForm";
import { Surface } from "../../Component/Primitives";
import type { DirectExecutableRunnerController } from "../../Hooks/UseDirectExecutableRunner";

function createRunner(overrides: Partial<DirectExecutableRunnerController> = {}): DirectExecutableRunnerController {
  return {
    executablePath: "C:\\Program Files\\Steam\\",
    executableArgs: "-no-cef-sandbox",
    statusMessage: "",
    canRun: true,
    pathSuggestions: [
      { path: "C:\\Program Files\\Steam\\steam.exe", name: "steam.exe", isDirectory: false },
      { path: "C:\\Program Files\\Steam\\bin\\", name: "bin", isDirectory: true },
      { path: "C:\\Program Files\\Steam\\steamwebhelper.exe", name: "steamwebhelper.exe", isDirectory: false },
    ],
    isPathSuggestionOpen: true,
    selectedSuggestionIndex: 0,
    isPathSuggesting: false,
    pathInputRef: React.createRef<HTMLInputElement>(),
    argsInputRef: React.createRef<HTMLInputElement>(),
    setExecutablePathFromInput: () => undefined,
    setExecutableArgs: () => undefined,
    closePathSuggestions: () => undefined,
    applyPathSuggestion: () => undefined,
    registerExecutable: () => true,
    browseExecutable: async () => undefined,
    runExecutable: async () => undefined,
    handlePathKeyDown: async () => undefined,
    handleArgsKeyDown: async () => undefined,
    ...overrides,
  };
}

const meta: Meta<typeof DirectExecutableActionForm> = {
  title: "Component/DirectExecutableActionForm",
  component: DirectExecutableActionForm,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof DirectExecutableActionForm>;

export const WithSuggestions: Story = {
  render: () => (
    <Surface tone="deep" padding="lg" className="w-[720px] text-slate-100">
      <DirectExecutableActionForm runner={createRunner()} />
    </Surface>
  ),
};

export const WithStatusMessage: Story = {
  render: () => (
    <Surface tone="deep" padding="lg" className="w-[720px] text-slate-100">
      <DirectExecutableActionForm
        runner={createRunner({
          statusMessage: "Wine runtime is not installed or extracted: wine-9.0-stable",
          isPathSuggestionOpen: false,
        })}
      />
    </Surface>
  ),
};
