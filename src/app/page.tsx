import GravitySandbox from '@/components/gravity-sandbox'
import BrowserSupportGate from '@/components/browser-support-gate'

export default function Home() {
  return (
    <BrowserSupportGate>
      <GravitySandbox />
    </BrowserSupportGate>
  )
}
