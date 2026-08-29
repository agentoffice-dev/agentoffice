import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation()

  return (
    <label className={`inline-flex items-center gap-2 text-muted-foreground ${className}`}>
      <Languages className="h-4 w-4" />
      <select
        value={i18n.resolvedLanguage === 'zh-TW' ? 'zh-TW' : 'en'}
        onChange={event => void i18n.changeLanguage(event.target.value)}
        className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        aria-label={t('language.label')}
      >
        <option value="en">{t('language.en')}</option>
        <option value="zh-TW">{t('language.zhTW')}</option>
      </select>
    </label>
  )
}
