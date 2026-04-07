import { MessageSquareText } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  description?: string | null
  embedURL?: string | null
  height?: number | null
  provider?: string | null
  title?: string | null
}

export function ChatEmbedBlock({ description, embedURL, height = 560, provider, title }: Props) {
  if (!embedURL) return null

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
        {description ? <p className="max-w-3xl text-sm text-slate-300">{description}</p> : null}
      </div>

      <Card className="border-white/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg text-white">
            <MessageSquareText className="h-5 w-5 text-cyan-300" />
            {provider || 'Embedded chat'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
            <iframe
              className="w-full"
              height={height ?? 560}
              src={embedURL}
              title={title || 'Chat embed'}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
