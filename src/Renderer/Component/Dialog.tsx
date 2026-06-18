import React from "react";
import { AlertTriangle, CheckCircle2, Info, LucideIcon, X } from "lucide-react";
import { Box, Button, Inline, Stack, Surface, Text } from "./Primitives";

/** Visual tone applied to dialog chrome, icon treatment, and action emphasis. */
export type DialogTone = "neutral" | "info" | "success" | "warning" | "danger";
/** Button treatment for dialog actions. Use `danger` only for destructive confirmation. */
export type DialogActionVariant = "primary" | "secondary" | "danger";
/** Dialog placement preset. `center` is best for decisions; `top` is best for lightweight notices. */
export type DialogPlacement = "top" | "center";

/**
 * Declarative action shown in a dialog footer.
 *
 * Prefer actions over embedding custom buttons in dialog content so keyboard
 * focus, visual hierarchy, and disabled states remain consistent.
 */
export interface DialogAction {
  label: string;
  icon?: LucideIcon;
  variant?: DialogActionVariant;
  disabled?: boolean;
  autoFocus?: boolean;
  onClick: () => void;
}

/**
 * Props for the shared launcher dialog.
 *
 * Use Dialog for modal choices, confirmations, and compact detail panels. Keep
 * long-running workflows in the parent and pass status through content/actions.
 */
export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  tone?: DialogTone;
  icon?: LucideIcon;
  children?: React.ReactNode;
  actions?: DialogAction[];
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  placement?: DialogPlacement;
  widthClassName?: string;
  className?: string;
}

/**
 * Props for rendering a route-owned dialog beside normal page content.
 *
 * Use DialogHost when a view needs to keep its content mounted while layering a
 * single optional dialog over it.
 */
export interface DialogHostProps {
  children: React.ReactNode;
  dialog?: React.ReactNode;
}

const TONE_CLASS_MAP: Record<DialogTone, { icon: string; iconBox: string; border: string; defaultIcon: LucideIcon }> = {
  neutral: {
    icon: "text-slate-200",
    iconBox: "border-white/10 bg-white/[0.05]",
    border: "border-white/10",
    defaultIcon: Info,
  },
  info: {
    icon: "text-sky-200",
    iconBox: "border-sky-400/25 bg-sky-400/10",
    border: "border-sky-400/25",
    defaultIcon: Info,
  },
  success: {
    icon: "text-emerald-200",
    iconBox: "border-emerald-400/25 bg-emerald-400/10",
    border: "border-emerald-400/25",
    defaultIcon: CheckCircle2,
  },
  warning: {
    icon: "text-amber-200",
    iconBox: "border-amber-400/25 bg-amber-400/10",
    border: "border-amber-400/25",
    defaultIcon: AlertTriangle,
  },
  danger: {
    icon: "text-red-200",
    iconBox: "border-red-400/25 bg-red-400/10",
    border: "border-red-400/25",
    defaultIcon: AlertTriangle,
  },
};

const ACTION_CLASS_MAP: Record<DialogActionVariant, string> = {
  primary: "",
  secondary: "",
  danger: "border-red-400/25 bg-red-500/15 text-red-100 hover:bg-red-500/25",
};

/**
 * Simple host that renders page content and an optional dialog sibling.
 *
 * This keeps dialog ownership near the feature while avoiding repeated fragment
 * boilerplate in high-level views.
 */
export function DialogHost({ children, dialog }: DialogHostProps) {
  return (
    <>
      {children}
      {dialog}
    </>
  );
}

/**
 * Shared modal dialog component.
 *
 * Use it for focused decisions or detail views that should block interaction
 * with the underlying page until the user closes or completes the dialog.
 */
export function Dialog({
  open,
  title,
  description,
  tone = "neutral",
  icon,
  children,
  actions = [],
  onClose,
  closeOnBackdrop = true,
  showCloseButton = true,
  placement = "top",
  widthClassName = "max-w-lg",
  className = "",
}: DialogProps) {
  React.useEffect(() => {
    if (!open || !onClose) {
      return undefined;
    }

    const handle_key_down = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handle_key_down);
    return () => window.removeEventListener("keydown", handle_key_down);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const toneClasses = TONE_CLASS_MAP[tone];
  const Icon = icon ?? toneClasses.defaultIcon;
  const placementClass = placement === "center" ? "items-center pb-16" : "items-start pt-24";

  function handle_backdrop_click(event: React.MouseEvent<HTMLDivElement>) {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose?.();
    }
  }

  return (
    <Box
      className={`fixed inset-0 z-[100] flex justify-center bg-black/45 px-4 backdrop-blur-sm ${placementClass}`}
      role="presentation"
      onMouseDown={handle_backdrop_click}
    >
      <Surface
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        tone="deep"
        padding="lg"
        className={`w-full ${widthClassName} border ${toneClasses.border} bg-[#0f172a] text-slate-100 shadow-2xl shadow-black/45 ${className}`}
      >
        <Inline align="start" gap="md">
          <Box className={`grid h-10 w-10 shrink-0 place-items-center rounded-md border ${toneClasses.iconBox}`}>
            <Icon size={20} className={toneClasses.icon} />
          </Box>

          <Stack gap="xs" className="min-w-0 flex-1">
            <Text id="dialog-title" tone="strong" size="base" weight="semibold">
              {title}
            </Text>
            {description ? (
              <Text id="dialog-description" tone="muted" size="sm">
                {description}
              </Text>
            ) : null}
          </Stack>

          {showCloseButton ? (
            <Button
              variant="ghost"
              size="xs"
              className="w-8 px-0 text-slate-400 hover:bg-white/5 hover:text-white"
              aria-label="Close dialog"
              icon={<X size={16} />}
              onClick={onClose}
            />
          ) : null}
        </Inline>

        {children ? <Box className="mt-4 text-sm leading-6 text-slate-300">{children}</Box> : null}

        {actions.length > 0 ? (
          <Inline justify="end" gap="sm" wrap className="mt-5 flex-col-reverse sm:flex-row">
            {actions.map((action) => {
              const ActionIcon = action.icon;
              const variant = action.variant ?? "secondary";

              return (
                <Button
                  key={action.label}
                  autoFocus={action.autoFocus}
                  disabled={action.disabled}
                  variant={variant === "primary" ? "primary" : "glass"}
                  size="md"
                  className={`px-4 text-sm ${ACTION_CLASS_MAP[variant]}`}
                  icon={ActionIcon ? <ActionIcon size={16} /> : undefined}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              );
            })}
          </Inline>
        ) : null}
      </Surface>
    </Box>
  );
}
