import Link from 'next/link'
import RawahStory from '../components/RawahStory'
import CategoryGrid from '../components/CategoryGrid'
import Reveal from '../components/Reveal'
import { store } from '../config/store'
import { ArrowIcon, LockIcon, ReturnIcon, SealIcon, TruckIcon } from '../components/Icons'

const [first, second] = store.catalogue.homeSections
const hero = store.catalogue.heroProductSlug

export default function Home() {
  return (
    <>
      <RawahStory />

      <section className="section section-paper">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="eyebrow">{first.eyebrow}</p>
            <h2 className="display">{first.title}</h2>
            <p className="lede">{first.lede}</p>
          </Reveal>
          <CategoryGrid categorySlug={first.categorySlug} exclude={hero} />
        </div>
      </section>

      <section className="feature">
        <div className="feature-media">
          <img src="/products/voyage-hero.webp" alt="Voyage eau de parfum on a stone counter" loading="lazy" />
        </div>
        <Reveal className="feature-copy">
          <p className="eyebrow">Also in the house</p>
          <h2 className="display">Voyage</h2>
          <p className="lede">Frozen apple, Italian bergamot and lemon over a spiced heart and earthy woods. Crisp, then warm.</p>
          <Link href="/product/voyage" className="btn btn-dark">
            Discover Voyage <ArrowIcon size={18} />
          </Link>
        </Reveal>
      </section>

      <section className="section section-ivory">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="eyebrow">{second.eyebrow}</p>
            <h2 className="display">{second.title}</h2>
            <p className="lede">{second.lede}</p>
          </Reveal>
          <CategoryGrid categorySlug={second.categorySlug} exclude={hero} />
        </div>
      </section>

      <section className="promise">
        <div className="wrap promise-grid">
          {[
            { icon: <TruckIcon size={26} />, t: 'Free shipping', d: 'Anywhere in India' },
            { icon: <ReturnIcon size={26} />, t: '7 day returns', d: 'If it is not right, send it back' },
            { icon: <LockIcon size={26} />, t: 'Secure payment', d: 'Encrypted at every step' },
            { icon: <SealIcon size={26} />, t: '100% original', d: 'Straight from the house' },
          ].map((x) => (
            <div key={x.t} className="promise-item">
              {x.icon}
              <strong>{x.t}</strong>
              <span>{x.d}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="founder">
        <Reveal className="wrap founder-inner">
          <p className="founder-quote">“A fragrance is not only worn. It is remembered.”</p>
          <p className="founder-by">Hasan Abbas, Founder</p>
          <Link href="/about" className="link-arrow">
            Read the story <ArrowIcon size={16} />
          </Link>
        </Reveal>
      </section>
    </>
  )
}
