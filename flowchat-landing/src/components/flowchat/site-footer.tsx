export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
        <span className="font-medium text-foreground">Flowchat</span>
        <div className="flex gap-6">
          <a href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </a>
          <a href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </a>
        </div>
        <span>© {new Date().getFullYear()} Flowchat</span>
      </div>
    </footer>
  );
}
