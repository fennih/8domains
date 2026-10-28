// Stroke icons (viewBox 24, stroke 1.5) and short titles for narrow screens, by domain number.
export const DOMAIN_ICON: Record<number, string> = {
  1: 'M12 4v16M7 20h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z',
  2: 'M5 6a7 3 0 1 0 14 0a7 3 0 1 0-14 0M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  3: 'M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  4: 'M3 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 11l10-5M7 13l10 5',
  5: 'M4 15a4 4 0 1 0 8 0a4 4 0 1 0-8 0M11 12l9-9M16 7l3 3M14 9l2 2',
  6: 'M5 11a6 6 0 1 0 12 0a6 6 0 1 0-12 0M20 20l-4.5-4.5',
  7: 'M3 12h4l2-6 4 12 2-6h6',
  8: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
}

export const DOMAIN_SHORT: Record<number, string> = {
  1: 'Security and Risk Management',
  2: 'Asset Security',
  3: 'Architecture and Engineering',
  4: 'Communication and Network',
  5: 'Identity and Access (IAM)',
  6: 'Assessment and Testing',
  7: 'Security Operations',
  8: 'Software Development',
}
