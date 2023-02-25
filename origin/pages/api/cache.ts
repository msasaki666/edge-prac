import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  date: string
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  res.status(200).json({ date: new Date().toISOString() })
}
