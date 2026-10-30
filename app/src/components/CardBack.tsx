import { Inline } from './Inline'

export function CardBack({ back }: { back: string | string[] }) {
  if (typeof back === 'string') return <Inline text={back} />
  return (
    <ol className="ol-num">
      {back.map((item, i) => (
        <li key={i}>
          <Inline text={item} />
        </li>
      ))}
    </ol>
  )
}
