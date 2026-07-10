import { useState } from 'react'
import { t } from '@/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CaptainChip } from '@/components/CaptainChip'
import { CaptainSearchResult, CreateCaptainRow } from '@/components/CaptainSearchResult'
import { ConnectivityBanner } from '@/components/ConnectivityBanner'
import { EmptyState } from '@/components/EmptyState'
import { FieldCard } from '@/components/FieldCard'
import { PinPad } from '@/components/PinPad'
import { QueueRow } from '@/components/QueueRow'
import { showUndoToast, UndoToaster } from '@/components/UndoToast'

/**
 * Component showcase — temporary dev harness so `pnpm dev` renders every shared
 * component in every state. Replaced by the real app shell in the app build phase.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-accent" dir="ltr">{title}</h2>
      {children}
    </section>
  )
}

export default function App() {
  const [pinFilled, setPinFilled] = useState(2)

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 p-4 pb-20">
      <h1 className="text-xl font-bold">ניהול תורים — רכיבים משותפים</h1>

      <Section title="FieldCard">
        <FieldCard status="live" fieldName="מגרש ראשי" captainA="דניאל" captainB="נועם" secondsLeft={277} />
        <FieldCard status="paused" fieldName="מגרש ראשי" captainA="דניאל" captainB="נועם" secondsLeft={131} />
        <FieldCard status="live" fieldName="מגרש קטן" captainA="יוסי" captainB="רון" secondsLeft={23} />
        <FieldCard status="live" fieldName="מגרש קטן" captainA="יוסי" captainB="רון" secondsLeft={0} />
        <FieldCard status="free" fieldName="מגרש קטן" nextUp={{ captainA: 'יוסי', captainB: 'רון' }} />
      </Section>

      <Section title="QueueRow">
        <QueueRow position={1} captainA="יוסי" captainB="רון" next />
        <QueueRow position={2} captainA="עומר" captainB="איתי" />
        <QueueRow position={3} captainA="אלון" captainB="שחר" dragging />
        <QueueRow position={4} captainA="גיא" captainB="טל" removing />
      </Section>

      <Section title="CaptainSearchResult / CreateCaptainRow">
        <div className="rounded-xl border border-line bg-surface px-2">
          <CaptainSearchResult name="דניאל" gamesToday={3} lastPlayedAt="18:42" onSelect={() => {}} />
          <CaptainSearchResult name="דניאל" nickname="הקטן" gamesToday={0} onSelect={() => {}} />
          <CreateCaptainRow name="דניאל" duplicate />
        </div>
      </Section>

      <Section title="CaptainChip">
        <div className="flex gap-2">
          <CaptainChip name="דניאל" gamesToday={3} onRemove={() => {}} />
          <CaptainChip empty />
        </div>
      </Section>

      <Section title="Buttons + Badges">
        <Button variant="primary" size="big">▶ {t('action.start')}</Button>
        <div className="flex gap-2">
          <Button>{t('action.extendMinute')}</Button>
          <Button variant="danger">{t('action.finish')}</Button>
          <Button disabled>{t('action.start')}</Button>
        </div>
        <div className="flex gap-2">
          <Badge state="live">{t('field.state.live')}</Badge>
          <Badge state="paused">{t('field.state.paused')}</Badge>
          <Badge state="ending">{t('field.state.ending')}</Badge>
          <Badge state="free">{t('field.state.free')}</Badge>
        </div>
      </Section>

      <Section title="ConnectivityBanner">
        <ConnectivityBanner status="offline" />
        <ConnectivityBanner status="resynced" />
      </Section>

      <Section title="UndoToast">
        <Button onClick={() => showUndoToast('toast.removedFromQueue', () => {})}>
          {t('queue.remove')} → toast
        </Button>
      </Section>

      <Section title="EmptyState">
        <EmptyState
          icon="⚽"
          title={t('empty.noSession.title')}
          hint={t('empty.noSession.hint')}
          action={<Button variant="primary" className="min-w-44">{t('empty.noSession.cta')}</Button>}
        />
        <EmptyState title={t('empty.queue')} />
      </Section>

      <Section title="PinPad">
        <PinPad filled={pinFilled} onDigit={() => setPinFilled((n) => Math.min(4, n + 1))} onDelete={() => setPinFilled((n) => Math.max(0, n - 1))} />
        <PinPad filled={0} lockedForSec={47} />
      </Section>

      <UndoToaster />
    </main>
  )
}
