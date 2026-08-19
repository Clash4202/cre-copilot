'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ParallaxImage } from './parallax-image'
import { Reveal } from './reveal'
import { SectionShell } from './section-shell'

type StepId = 'upload' | 'ask' | 'answer'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'ask', label: 'Ask' },
  { id: 'answer', label: 'Cited answer' },
]

const QUESTION = 'Does this lease have a renewal option?'
const AUTOPLAY_MS = 4200

function panelMotion(reduceMotion: boolean) {
  return {
    initial: { opacity: 0, y: reduceMotion ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -12 },
    transition: { duration: reduceMotion ? 0.01 : 0.35, ease: [0.22, 1, 0.36, 1] as const },
  }
}

// A code-driven, auto-advancing walkthrough (upload -> ask -> cited answer)
// built in our own browser-chrome mockup style. Not a screen recording and
// not an AI-generated video: this is pixel-accurate to the real product and
// stays accessible (pauses on hover/focus, skips autoplay + typing effects
// entirely under prefers-reduced-motion).
export function ProductTour() {
  const shouldReduceMotion = !!useReducedMotion()
  const [active, setActive] = useState<StepId>('upload')
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (shouldReduceMotion || paused) return
    const currentIndex = STEPS.findIndex((s) => s.id === active)
    const timer = setTimeout(() => {
      setActive(STEPS[(currentIndex + 1) % STEPS.length].id)
    }, AUTOPLAY_MS)
    return () => clearTimeout(timer)
  }, [active, paused, shouldReduceMotion])

  return (
    <SectionShell
      className="py-24 sm:py-32"
      bleed={
        <div className="absolute inset-y-0 right-0 hidden w-64 xl:block">
          <ParallaxImage
            src="/images/data-glow-abstract.jpg"
            className="absolute inset-0 opacity-[0.14] dark:opacity-[0.2]"
            range={20}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-paper/70 to-paper" />
        </div>
      }
    >
      <Reveal duration={0.8}>
        <div className="flex flex-col gap-1 pb-10 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-slate">
            See it in action
          </span>
          <h2 className="font-display text-[clamp(1.75rem,3vw,2.75rem)] font-medium tracking-tight text-ink">
            From upload to a cited answer
          </h2>
        </div>
      </Reveal>

      <Reveal delay={0.15} duration={0.9}>
        <div
          className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-hairline bg-paper shadow-lg transition hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div className="flex items-center gap-1.5 border-b border-hairline px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-hairline" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-hairline" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-hairline" aria-hidden="true" />
            <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-slate">
              cre-copilot: chat
            </span>
          </div>

          <div
            className="flex border-b border-hairline"
            role="tablist"
            aria-label="Product tour steps"
          >
            {STEPS.map((step, i) => (
              <button
                key={step.id}
                type="button"
                role="tab"
                id={`tour-tab-${step.id}`}
                aria-selected={active === step.id}
                aria-controls="tour-panel"
                onClick={() => {
                  setActive(step.id)
                  setPaused(true)
                }}
                className={`relative flex-1 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  active === step.id ? 'text-wine' : 'text-slate hover:text-ink'
                }`}
              >
                <span className="mr-2 text-slate/60">0{i + 1}</span>
                {step.label}
                {active === step.id && (
                  <motion.span
                    layoutId="tour-tab-indicator"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-wine"
                    transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
                  />
                )}
              </button>
            ))}
          </div>

          <div
            id="tour-panel"
            role="tabpanel"
            aria-labelledby={`tour-tab-${active}`}
            aria-live="polite"
            className="relative min-h-[280px] overflow-hidden p-6 sm:min-h-[240px]"
          >
            <AnimatePresence mode="wait">
              {active === 'upload' && (
                <motion.div key="upload" {...panelMotion(shouldReduceMotion)}>
                  <UploadStep reduceMotion={shouldReduceMotion} />
                </motion.div>
              )}
              {active === 'ask' && (
                <motion.div key="ask" {...panelMotion(shouldReduceMotion)}>
                  <AskStep reduceMotion={shouldReduceMotion} />
                </motion.div>
              )}
              {active === 'answer' && (
                <motion.div key="answer" {...panelMotion(shouldReduceMotion)}>
                  <AnswerStep />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  )
}

function UploadStep({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[11px] uppercase tracking-widest text-slate">Vault</p>
      <div className="flex items-center gap-3 rounded-md border border-hairline px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate">PDF</span>
        <div className="flex-1">
          <p className="text-sm text-ink">Sample_Office_Lease.pdf</p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-hairline">
            <motion.div
              className="h-full rounded-full bg-forest"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: reduceMotion ? 0 : 1.6, ease: 'easeOut' }}
            />
          </div>
        </div>
        <motion.span
          className="font-mono text-[10px] uppercase tracking-widest text-forest"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 1.6, duration: 0.3 }}
        >
          Ready
        </motion.span>
      </div>
      <p className="max-w-sm text-sm leading-relaxed text-slate">
        Add leases, offering memoranda, T-12s, and market reports, including scanned PDFs that get
        automatically transcribed.
      </p>
    </div>
  )
}

function AskStep({ reduceMotion }: { reduceMotion: boolean }) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (reduceMotion) return
    let i = 0
    const interval = setInterval(() => {
      i += 1
      setTyped(QUESTION.slice(0, i))
      if (i >= QUESTION.length) clearInterval(interval)
    }, 35)
    return () => clearInterval(interval)
  }, [reduceMotion])

  const display = reduceMotion ? QUESTION : typed

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[11px] uppercase tracking-widest text-slate">Ask a question</p>
      <div className="rounded-md border border-hairline px-4 py-3">
        <p className="min-h-[1.75rem] font-display text-lg font-medium tracking-tight text-ink">
          {display}
          {!reduceMotion && (
            <span
              className="ml-0.5 inline-block h-5 w-[2px] animate-pulse align-middle bg-wine"
              aria-hidden="true"
            />
          )}
        </p>
      </div>
      <p className="max-w-sm text-sm leading-relaxed text-slate">
        Ask the way you&apos;d ask a colleague who already read the file.
      </p>
    </div>
  )
}

function AnswerStep() {
  return (
    <div>
      <span className="mb-3 inline-block rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-slate">
        Example
      </span>
      <p className="font-display text-lg font-medium tracking-tight text-ink">{QUESTION}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
        Yes. Section 4.2 grants the tenant one 5-year renewal option, exercisable with 180
        days&apos; written notice before the expiration date, at 95% of then-prevailing market
        rent.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <details className="group rounded-md border border-hairline px-2 py-1 open:bg-wine/5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-xs text-wine marker:content-none">
            <span className="rounded-full bg-wine px-1.5 text-paper">1</span>
            Sample_Office_Lease.pdf
          </summary>
          <p className="mt-1.5 max-w-sm text-xs text-slate">
            &quot;Tenant shall have one (1) option to renew this Lease for an additional term of
            five (5) years, provided Tenant delivers written notice...&quot;
          </p>
        </details>
      </div>
    </div>
  )
}
