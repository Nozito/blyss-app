import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:rounded-lg group-[.toaster]:shadow-lg group-[.toaster]:shadow-black/5",
          title: "group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:!text-success-foreground [&_[data-icon]]:!text-success",
          error: "group-[.toaster]:!text-destructive [&_[data-icon]]:!text-destructive",
          warning: "group-[.toaster]:!text-warning-foreground [&_[data-icon]]:!text-warning",
          info: "group-[.toaster]:!text-info-foreground [&_[data-icon]]:!text-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
