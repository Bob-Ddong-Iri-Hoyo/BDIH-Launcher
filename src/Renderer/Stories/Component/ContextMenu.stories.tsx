import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Copy, FolderOpen, Pencil, Play, Settings, Trash2 } from "lucide-react";
import { ContextMenu, ContextMenuPosition } from "../../Component/ContextMenu";

const meta: Meta<typeof ContextMenu> = {
  title: "Component/ContextMenu",
  component: ContextMenu,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof ContextMenu>;

const menuItems = [
  { id: "open", label: "Open bottle", icon: Play, onSelect: () => undefined },
  { id: "recipe", label: "Recipe settings", icon: Settings, onSelect: () => undefined },
  { id: "rename", label: "Rename", icon: Pencil, onSelect: () => undefined },
  { id: "copy-path", label: "Copy path", icon: Copy, onSelect: () => undefined },
  { id: "reveal", label: "Reveal in folder", icon: FolderOpen, disabled: true, onSelect: () => undefined },
  { id: "delete", label: "Delete bottle", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => undefined },
];

export const Open: Story = {
  args: {
    open: true,
    position: { x: 420, y: 220 },
    items: menuItems,
    onClose: () => undefined,
  },
  render: (args) => (
    <div className="min-h-dvh bg-[#0b1020] p-10 text-slate-100">
      <div className="h-48 max-w-md rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <p className="text-sm font-semibold text-white">Bottle card</p>
        <p className="mt-2 text-sm text-slate-400">The context menu is rendered over this surface.</p>
      </div>
      <ContextMenu {...args} />
    </div>
  ),
};

export const RightClick: Story = {
  render: () => <RightClickStory />,
};

function RightClickStory() {
  const [position, setPosition] = React.useState<ContextMenuPosition | undefined>();

  return (
    <div className="min-h-dvh bg-[#0b1020] p-10 text-slate-100">
      <button
        type="button"
        className="h-48 w-72 rounded-lg border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
        onContextMenu={(event) => {
          event.preventDefault();
          setPosition({ x: event.clientX, y: event.clientY });
        }}
      >
        <span className="block text-sm font-semibold text-white">Right-click bottle</span>
        <span className="mt-2 block text-sm text-slate-400">Custom context menu opens at the pointer.</span>
      </button>
      <ContextMenu
        open={Boolean(position)}
        position={position}
        items={menuItems}
        onClose={() => setPosition(undefined)}
      />
    </div>
  );
}
