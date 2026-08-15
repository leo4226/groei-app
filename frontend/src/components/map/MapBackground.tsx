interface Props {
  svgFile: string
}

export default function MapBackground({ svgFile }: Props) {
  return (
    <img
      src={`/maps/${svgFile}`}
      alt="Garden map"
      className="w-full h-full block"
      style={{ objectFit: 'contain', objectPosition: 'left top' }}
      draggable={false}
    />
  )
}
