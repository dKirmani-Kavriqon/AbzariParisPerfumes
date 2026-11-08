import { useState, type FormEvent } from 'react'

export default function Contact() {
  const [sent, setSent] = useState(false)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body = `Name: ${f.get('name')}\nPhone: ${f.get('phone')}\n\n${f.get('message')}`
    window.location.href = `mailto:info@abzariparis.com?subject=${encodeURIComponent('Enquiry from abzariparis.com')}&body=${encodeURIComponent(body)}`
    setSent(true)
  }
  return (
    <div className="page wrap contact">
      <div>
        <p className="eyebrow">Contact</p>
        <h1 className="display">Talk to us.</h1>
        <dl className="contact-list">
          <dt>Call or WhatsApp</dt>
          <dd><a href="tel:+918796924324">+91 87969 24324</a></dd>
          <dt>Email</dt>
          <dd><a href="mailto:info@abzariparis.com">info@abzariparis.com</a></dd>
          <dt>Hours</dt>
          <dd>Support every day, around the clock</dd>
          <dt>Address</dt>
          <dd>259A/3 Nayyar Manzil, Noor Nagar, Jamia Nagar, New Delhi 110025</dd>
        </dl>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <label className="field"><span>Name</span><input required name="name" autoComplete="name" /></label>
          <label className="field"><span>Phone</span><input name="phone" type="tel" autoComplete="tel" /></label>
        </div>
        <label className="field"><span>Email</span><input required name="email" type="email" autoComplete="email" /></label>
        <label className="field"><span>Message</span><textarea required name="message" rows={6} /></label>
        <button className="btn btn-dark" type="submit">Send</button>
        {sent && <p className="fine">Your mail app should open with the message ready to send.</p>}
      </form>
    </div>
  )
}
