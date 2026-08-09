interface FormattedTextProps {
  text: string
  className?: string
}

/** Безпечно відображає просте форматування описів без innerHTML.
 * Наразі підтримує синтаксис **жирний текст**, який також використовується
 * у Telegram-анонсах, і зберігає переноси рядків. */
export function FormattedText({ text, className = '' }: FormattedTextProps) {
  const parts = text.split(/(\*\*[\s\S]+?\*\*)/g)

  return (
    <p className={`whitespace-pre-line ${className}`}>
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={index} className="font-semibold text-[var(--text-primary)]">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </p>
  )
}
