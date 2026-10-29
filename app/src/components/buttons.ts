// Shared D+ button styles: one accent primary, flat secondaries, 44px+ touch targets.
const base = 'inline-flex min-h-[46px] items-center justify-center rounded-[10px] px-4 text-sm font-bold md:min-h-[50px] md:px-6 md:text-base'

export const btnPrimary = `${base} bg-accent text-accent-fg`
export const btnSecondary = `${base} border border-line bg-surface text-fg hover:border-muted`
export const btnDomain = `${base} border border-dc-edge bg-surface text-dc-ink hover:border-dc`
export const btnDanger = `${base} border border-danger bg-surface text-danger`
