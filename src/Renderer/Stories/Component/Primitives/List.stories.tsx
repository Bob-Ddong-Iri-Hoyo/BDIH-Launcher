import type { Meta, StoryObj } from "@storybook/react";
import { CalendarDays, FileText, Play, Wine } from "lucide-react";
import {
  Badge,
  Button,
  List,
  ListItem,
  ListItemActions,
  ListItemBody,
  ListItemDescription,
  ListItemIcon,
  ListItemMeta,
  ListItemTitle,
} from "../../../Component/Primitives";

const meta: Meta<typeof List> = {
  title: "Component/Primitives/List",
  component: List,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof List>;

export const Comfortable: Story = {
  render: () => (
    <List className="w-[32rem] rounded-xl border border-white/10 bg-[#08101f] p-2">
      <ListItem className="items-center gap-3">
        <ListItemIcon>
          <Wine size={16} />
        </ListItemIcon>
        <ListItemBody>
          <ListItemTitle>HoyoVerse Bottle</ListItemTitle>
          <ListItemDescription>wine-hoyoverse__genshin-impact.log</ListItemDescription>
        </ListItemBody>
        <ListItemMeta>
          <Badge tone="success">12 lines</Badge>
        </ListItemMeta>
      </ListItem>
      <ListItem tone="selected" interactive className="items-center gap-3">
        <ListItemIcon className="bg-emerald-400/15 text-emerald-100">
          <Play size={16} />
        </ListItemIcon>
        <ListItemBody>
          <ListItemTitle>Running session</ListItemTitle>
          <ListItemDescription>Today 21:02:33</ListItemDescription>
        </ListItemBody>
        <ListItemActions>
          <Button variant="glass" size="xs">Open</Button>
        </ListItemActions>
      </ListItem>
    </List>
  ),
};

export const CompactRows: Story = {
  render: () => (
    <List className="w-[28rem] rounded-xl border border-white/10 bg-[#08101f] p-2">
      {[
        ["App logs", "app.log", "42"],
        ["Renderer", "renderer.log", "18"],
        ["Updater", "updater.log", "3"],
      ].map(([title, description, count]) => (
        <ListItem key={title} density="compact" interactive className="items-center gap-3">
          <ListItemIcon className="h-7 w-7">
            <FileText size={14} />
          </ListItemIcon>
          <ListItemBody>
            <ListItemTitle className="text-xs">{title}</ListItemTitle>
            <ListItemDescription>{description}</ListItemDescription>
          </ListItemBody>
          <ListItemMeta className="tabular-nums">{count}</ListItemMeta>
        </ListItem>
      ))}
    </List>
  ),
};

export const LongTextSafety: Story = {
  render: () => (
    <List className="w-[24rem] rounded-xl border border-white/10 bg-[#08101f] p-2">
      <ListItem interactive className="items-center gap-3">
        <ListItemIcon>
          <CalendarDays size={16} />
        </ListItemIcon>
        <ListItemBody>
          <ListItemTitle>2026-06-23 application lifecycle session with very long title</ListItemTitle>
          <ListItemDescription>/Users/player/Library/Application Support/BDIH Launcher/logs/app.log</ListItemDescription>
        </ListItemBody>
        <ListItemMeta>
          <Badge className="inline-flex h-5 items-center justify-center rounded bg-white/10 px-1.5 text-[11px] tabular-nums text-slate-300">
            999
          </Badge>
        </ListItemMeta>
      </ListItem>
    </List>
  ),
};
