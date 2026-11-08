import Reveal from '../components/Reveal'

const pillars = [
  { t: 'A family trade', d: 'Abzari grew out of a family perfume business. The knowledge of materials and makers came first; the brand came after.' },
  { t: 'Made for occasions', d: 'Ten signature scents, each built for a kind of day, from an ordinary Tuesday to a wedding.' },
  { t: 'Chosen ingredients', d: 'Materials are picked for how long they last on skin and how they change over the hours.' },
  { t: 'Not mass made', d: 'Small runs, so each scent can keep its own character.' },
]

export default function About() {
  return (
    <div className="page">
      <section className="wrap narrow about-head">
        <p className="eyebrow">About Abzari</p>
        <h1 className="display">Heritage, with a modern hand.</h1>
      </section>
      <section className="wrap narrow prose">
        <Reveal>
          <p>
            At Abzari we think of fragrance as identity. It is a memory and a quiet signature. As an MBA graduate from
            Taylor’s Business School, I did not come to perfume by chance. I grew up in a family that has worked in the
            perfume business for years, and learned early how notes behave, why craft matters and how strongly a scent
            can hold a moment.
          </p>
          <p>
            Tradition alone was not enough for me. I wanted a house that joins that heritage with modern luxury: precise,
            familiar, and still new. Abzari came from that idea.
          </p>
          <p>
            Our debut collection has ten signature creations, each made for a particular occasion. Every bottle carries
            our standard for quality and care. This is the start, and every scent has a story worth keeping.
          </p>
          <p className="signature">
            Hasan Abbas
            <span>Founder and CEO, Abzari</span>
          </p>
        </Reveal>
      </section>
      <section className="wrap pillars">
        {pillars.map((p, i) => (
          <Reveal key={p.t} className="pillar" delay={i * 80}>
            <h3>{p.t}</h3>
            <p>{p.d}</p>
          </Reveal>
        ))}
      </section>
    </div>
  )
}
