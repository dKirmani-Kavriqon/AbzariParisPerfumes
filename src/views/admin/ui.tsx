'use client'

import { cloneElement, isValidElement, useCallback, useEffect, useId, useState, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { parseMoney, toDecimalString } from '../../commerce/catalog/money'
import { adminApi, type ApiResult } from './client'

/**
 * A labelled form control. The label holds only the label text; the hint and the error are
 * linked to the control with aria-describedby (and aria-invalid when there is an error), so
 * screen readers announce them properly.
 */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactElement<Record<string, unknown>> }) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && !error && (
        <span id={`${id}-hint`} className="muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} />
}

export function Badge({ status }: { status: string }) {
  return <span className={`admin-badge ${status}`}>{status}</span>
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  if (!children) return null
  return (
    <div className={`notice ${kind === 'info' ? '' : kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

/**
 * Money field: shows and accepts a normal amount ("1499.50") and reports integer minor units
 * (149950) or null while the text is not a valid amount. No floating point is involved.
 */
export function MoneyInput({ value, currency, onChange, required, ...rest }: { value: number | null; currency: string; onChange: (minor: number | null, valid: boolean) => void; required?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value == null ? '' : toDecimalString(value, currency))
  useEffect(() => {
    setText((t) => {
      const current = t.trim() === '' ? null : parseMoney(t, currency)
      return current === value ? t : value == null ? '' : toDecimalString(value, currency)
    })
  }, [value, currency])
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        if (e.target.value.trim() === '') onChange(null, !required)
        else {
          const minor = parseMoney(e.target.value, currency)
          onChange(minor, minor !== null)
        }
      }}
      {...rest}
    />
  )
}

/** Loads data from the admin API, with a reload function. */
export function useAdminData<T>(path: string | null) {
  const [state, setState] = useState<{ loading: boolean; result: ApiResult<T> | null }>({ loading: true, result: null })
  const load = useCallback(async () => {
    if (!path) return
    setState((s) => ({ ...s, loading: true }))
    const result = await adminApi<T>(path)
    setState({ loading: false, result })
  }, [path])
  useEffect(() => {
    void load()
  }, [load])
  return { ...state, data: state.result?.ok ? state.result.data : null, error: state.result && !state.result.ok ? state.result.message : null, reload: load }
}

export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
