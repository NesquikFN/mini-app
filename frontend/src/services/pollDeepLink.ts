/**
 * Односторонній "поштовий ящик" між StartAppRedirect (App.tsx) і блоком
 * опитування на HomePage: сам deep link (`poll_<uuid>`) читається один
 * раз при відкритті Mini App, задовго до того, як PollSection встигне
 * змонтуватись і завантажити активне опитування. Модульна змінна замість
 * React Context — обидва боки й так живуть в одному дереві, а сам факт
 * "щойно прийшли за конкретним опитуванням" потрібен рівно одноразово.
 */
let pendingPollId: string | undefined

export function setPendingPollId(id: string): void {
  pendingPollId = id
}

/** Читає й одразу очищає — повторний виклик (наприклад, ще один
 * ремаунт PollSection) більше нічого не поверне, тож картка не
 * підсвічується щоразу заново без нового deep link. */
export function consumePendingPollId(): string | undefined {
  const id = pendingPollId
  pendingPollId = undefined
  return id
}
