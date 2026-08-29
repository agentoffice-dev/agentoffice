import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export interface WopiEditorProps {
  /** Editor action URL — for Collabora WOPISrc is already embedded in the query string; for OnlyOffice it is also in the URL */
  actionUrl: string
  accessToken: string
  accessTokenTtl: number
}

export default function WopiEditor({ actionUrl, accessToken, accessTokenTtl }: WopiEditorProps) {
  const { t } = useTranslation()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.submit()
  }, [])

  return (
    <div className="w-full h-full flex flex-col">
      {/*
        Hidden form — browser POSTs token + WOPISrc into the iframe.
        This keeps the access_token out of the URL and works for both
        Collabora Online and OnlyOffice (WOPI mode).
      */}
      <form
        ref={formRef}
        action={actionUrl}
        method="post"
        target="wopi-frame"
        style={{ display: 'none' }}
      >
        <input name="access_token"     defaultValue={accessToken}    type="hidden" />
        <input name="access_token_ttl" defaultValue={accessTokenTtl} type="hidden" />
      </form>

      <iframe
        name="wopi-frame"
        title={t('document.editor')}
        className="flex-1 w-full border-0"
        allow="microphone *; camera *; fullscreen *; display-capture *; autoplay *; clipboard-read *; clipboard-write *"
        sandbox="allow-scripts allow-same-origin allow-forms allow-top-navigation allow-popups allow-pointer-lock allow-modals"
      />
    </div>
  )
}
