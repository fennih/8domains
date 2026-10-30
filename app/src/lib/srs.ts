import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade, type IPreview } from 'ts-fsrs'

// One 10m learning step: "Again" comes back within the session, "Good" on a new card graduates (about 2 days)
// instead of returning 10 minutes later. Cards are graded right after their story, so that is the first exposure.
const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9, learning_steps: ['10m'] }))

export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: Rating.Again, label: 'Again', key: '1' },
  { grade: Rating.Hard, label: 'Hard', key: '2' },
  { grade: Rating.Good, label: 'Good', key: '3' },
  { grade: Rating.Easy, label: 'Easy', key: '4' },
]

export function preview(card: Card | undefined, now: Date): IPreview {
  return scheduler.repeat(card ?? createEmptyCard(now), now)
}

export function review(card: Card | undefined, grade: Grade, now: Date): Card {
  return scheduler.next(card ?? createEmptyCard(now), now, grade).card
}

export function isLearned(card: Card | undefined): boolean {
  return card?.state === State.Review
}
