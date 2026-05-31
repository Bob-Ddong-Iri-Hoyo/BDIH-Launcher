import type { Meta, StoryObj } from "@storybook/react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MainFrame } from "../../Component/MainFrame";

const meta: Meta<typeof MainFrame> = {
  title: "Component/MainFrame",
  component: MainFrame,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    activeView: "dashboard",
    onViewChange: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof MainFrame>;

export const Default: Story = {
  render: (args) => (
    <MainFrameStoryContent {...args} />
  ),
};

function MainFrameStoryContent(args: React.ComponentProps<typeof MainFrame>) {
  const { t } = useTranslation();

  return (
    <MainFrame
      {...args}
      title={t("navigation.dashboard.label")}
      subtitle={t("navigation.dashboard.subtitle")}
      actions={
        <button
          type="button"
          className="accent-primary inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold"
        >
          <Download size={16} />
          {t("common.actions.install")}
        </button>
      }
    >
      <div className="p-6">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-300">
          MainFrame
        </div>
      </div>
    </MainFrame>
  );
}

export const LogsSelected: Story = {
  args: {
    activeView: "logs",
  },
  render: (args) => {
    const { t } = useTranslation();

    return (
      <MainFrame {...args} title={t("navigation.logs.label")} subtitle={t("navigation.logs.subtitle")}>
        <div className="p-6 text-sm text-slate-300">Logs View content</div>
      </MainFrame>
    );
  },
};
