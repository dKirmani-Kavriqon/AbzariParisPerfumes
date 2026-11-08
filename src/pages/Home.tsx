import { Link } from 'react-router-dom'
import RawahStory from '../components/RawahStory'
import ProductCard from '../components/ProductCard'
import Reveal from '../components/Reveal'
import { products } from '../data/products'
import { ArrowIcon, LockIcon, ReturnIcon, SealIcon, TruckIcon } from '../components/Icons'

const parfums = products.filter((p) => p.category === 'parfum' && p.slug !== 'rawah')
const oils = products.filter((p) => p.category === 'oil')

export default function Home() {
  return (
    <>
      <RawahStory />

      <section className="section section-paper">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="eyebrow">Eau de Parfum</p>
            <h2 className="display">Ten bottles, ten occasions.</h2>
            <p className="lede">Each one made for a moment: an office morning, a wedding night, a long drive out of the city.</p>
          </Reveal>
          <div className="grid">
            {parfums.map((p, i) => (
              <Reveal key={p.slug} delay={(i % 4) * 70}>
                <ProductCard p={p} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="feature">
        <div className="feature-media">
          <img src={`${import.meta.env.BASE_URL}products/voyage-hero.webp`} alt="Voyage eau de parfum on a stone counter" loading="lazy" />
        </div>
        <Reveal className="feature-copy">
          <p className="eyebrow">Also in the house</p>
          <h2 className="display">Voyage</h2>
          <p className="lede">Frozen apple, Italian bergamot and lemon over a spiced heart and earthy woods. Crisp, then warm.</p>
          <Link to="/product/voyage" className="btn btn-dark">
            Discover Voyage <ArrowIcon size={18} />
          </Link>
        </Reveal>
      </section>

      <section className="section section-ivory">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="eyebrow">Perfume Oils</p>
            <h2 className="display">Concentrated, alcohol free, close to the skin.</h2>
            <p className="lede">Roll-on oils in the attar tradition. Apply to the wrist and the pulse points.</p>
          </Reveal>
          <div className="grid">
            {oils.map((p, i) => (
              <Reveal key={p.slug} delay={(i % 4) * 70}>
                <ProductCard p={p} />
              </Reveal>
            ))}
          </div>
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
          <Link to="/about" className="link-arrow">
            Read the story <ArrowIcon size={16} />
          </Link>
        </Reveal>
      </section>
    </>
  )
}
